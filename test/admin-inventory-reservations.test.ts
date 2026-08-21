import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/environment.js";
import type {
  ReservationExpiryResult,
  ReservationReleaseReason,
  ReservationRepository,
  ReserveStockInput,
  StockReservation,
} from "../src/inventory/reservation-repository.js";
import {
  FakeAdminAccessRepository,
  FakeAuditRepository,
  FakeDatabaseConnection,
  FakeJwtVerifier,
} from "./support/fakes.js";

const userId = "11111111-1111-4111-8111-111111111111";
const reservationId = "33333333-3333-4333-8333-333333333333";
const environment = loadEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGINS: "http://localhost:3001",
  DOCS_ENABLED: "false",
});

const reservation: StockReservation = {
  id: reservationId,
  reservationKey: "order-test-1",
  orderId: "order-test-1",
  status: "active",
  expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
  releasedAt: null,
  releaseReason: null,
  convertedAt: null,
  createdAt: new Date(0).toISOString(),
  items: [
    {
      productId: "product-test-1",
      variantId: "variant-test-1",
      quantity: 2,
    },
  ],
};

class FakeReservationRepository implements ReservationRepository {
  readonly reserveInputs: ReserveStockInput[] = [];
  readonly releases: {
    reservationId: string;
    reason: ReservationReleaseReason;
  }[] = [];

  reserve(input: ReserveStockInput): Promise<StockReservation> {
    this.reserveInputs.push(input);
    return Promise.resolve(reservation);
  }

  get(): Promise<StockReservation> {
    return Promise.resolve(reservation);
  }

  release(
    reservationId: string,
    reason: ReservationReleaseReason,
  ): Promise<StockReservation> {
    this.releases.push({ reservationId, reason });
    return Promise.resolve({
      ...reservation,
      status: reason === "expired" ? "expired" : "released",
      releaseReason: reason,
      releasedAt: new Date().toISOString(),
    });
  }

  expire(): Promise<ReservationExpiryResult> {
    return Promise.resolve({
      releasedCount: 1,
      reservationIds: [reservationId],
    });
  }
}

describe("Admin inventory reservations API", () => {
  let app: FastifyInstance;
  let jwtVerifier: FakeJwtVerifier;
  let accessRepository: FakeAdminAccessRepository;
  let auditRepository: FakeAuditRepository;
  let reservationRepository: FakeReservationRepository;

  beforeEach(async () => {
    jwtVerifier = new FakeJwtVerifier();
    accessRepository = new FakeAdminAccessRepository();
    auditRepository = new FakeAuditRepository();
    reservationRepository = new FakeReservationRepository();
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier,
      adminAccessRepository: accessRepository,
      auditRepository,
      reservationRepository,
    });
  });

  afterEach(async () => app.close());

  function authorize(assuranceLevel: "aal1" | "aal2"): void {
    jwtVerifier.add("valid-token", {
      userId,
      email: "hhometn@gmail.com",
      assuranceLevel,
      sessionId: "22222222-2222-4222-8222-222222222222",
    });
    accessRepository.set({
      userId,
      email: "hhometn@gmail.com",
      displayName: "HBS HOME Admin",
      status: "active",
      roles: ["orders_manager"],
      permissions: ["inventory.read", "inventory.reserve"],
    });
  }

  it("requires MFA and the reservation permission", async () => {
    authorize("aal1");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/inventory/reservations",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        reservationKey: "order-test-1",
        orderId: "order-test-1",
        items: [
          {
            productId: "product-test-1",
            variantId: "variant-test-1",
            quantity: 2,
          },
        ],
      },
    });
    expect(response.statusCode).toBe(403);
    expect(reservationRepository.reserveInputs).toHaveLength(0);
  });

  it("creates and audits a reservation with the configured TTL", async () => {
    authorize("aal2");
    const before = Date.now() + 1_800_000;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/inventory/reservations",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        reservationKey: "order-test-1",
        orderId: "order-test-1",
        items: [
          {
            productId: "product-test-1",
            variantId: "variant-test-1",
            quantity: 2,
          },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(reservationRepository.reserveInputs[0]).toMatchObject({
      reservationKey: "order-test-1",
      actorUserId: userId,
    });
    expect(
      reservationRepository.reserveInputs[0]?.expiresAt.getTime(),
    ).toBeGreaterThanOrEqual(before - 100);
    expect(auditRepository.events).toContainEqual(
      expect.objectContaining({
        action: "inventory.reservation_created",
        outcome: "success",
      }),
    );
  });

  it("releases a reservation idempotently through the protected route", async () => {
    authorize("aal2");
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/admin/inventory/reservations/${reservationId}/release`,
      headers: { authorization: "Bearer valid-token" },
      payload: { reason: "cancelled" },
    });
    expect(response.statusCode).toBe(200);
    expect(reservationRepository.releases).toEqual([
      { reservationId, reason: "cancelled" },
    ]);
    expect(response.json()).toMatchObject({
      id: reservationId,
      status: "released",
      releaseReason: "cancelled",
    });
  });
});
