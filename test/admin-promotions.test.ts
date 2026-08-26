import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/environment.js";
import {
  FakeAdminAccessRepository,
  FakeAdminPromotionRepository,
  FakeAuditRepository,
  FakeDatabaseConnection,
  FakeJwtVerifier,
} from "./support/fakes.js";

const userId = "11111111-1111-4111-8111-111111111111";
const environment = loadEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGINS: "http://localhost:3001",
  DOCS_ENABLED: "false",
});

describe("Admin promotions API", () => {
  let app: FastifyInstance;
  let jwtVerifier: FakeJwtVerifier;
  let accessRepository: FakeAdminAccessRepository;
  let auditRepository: FakeAuditRepository;
  let promotionRepository: FakeAdminPromotionRepository;

  beforeEach(async () => {
    jwtVerifier = new FakeJwtVerifier();
    accessRepository = new FakeAdminAccessRepository();
    auditRepository = new FakeAuditRepository();
    promotionRepository = new FakeAdminPromotionRepository();
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier,
      adminAccessRepository: accessRepository,
      auditRepository,
      adminPromotionRepository: promotionRepository,
    });
  });

  afterEach(async () => app.close());

  function authorize(
    assuranceLevel: "aal1" | "aal2",
    permissions: readonly string[],
  ): void {
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
      roles: ["promotion_manager"],
      permissions,
    });
  }

  it("lists promotions with the read permission and no MFA", async () => {
    authorize("aal1", ["promotions.read"]);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/promotions",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
    });
  });

  it("requires aal2 for create and records an audit event", async () => {
    authorize("aal1", ["promotions.write"]);
    const blocked = await app.inject({
      method: "POST",
      url: "/api/v1/admin/promotions",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        name: "Bienvenue",
        code: "BIENVENUE10",
        discountType: "percentage",
        discountValue: 10,
      },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({ code: "MFA_REQUIRED" });

    authorize("aal2", ["promotions.write"]);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/promotions",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        name: "Bienvenue",
        code: "bienvenue10",
        discountType: "percentage",
        discountValue: 10,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: "Bienvenue",
      code: "BIENVENUE10",
      discountType: "percentage",
      discountValue: 10,
    });
    expect(auditRepository.events).toContainEqual(
      expect.objectContaining({
        action: "promotion.created",
        resourceType: "promotion",
      }),
    );
  });

  it("enforces promotion permissions separately from other Admin permissions", async () => {
    authorize("aal2", ["products.write"]);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/promotions",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "PERMISSION_DENIED" });
  });
});
