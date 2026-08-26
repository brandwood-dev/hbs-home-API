import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { Environment } from "../config/environment.js";
import type { AuditRepository } from "../audit/audit-repository.js";
import {
  createAdminGuard,
  type AdminGuardDependencies,
  type AdminPrincipal,
} from "../auth/admin-guard.js";
import { ProblemDetailSchema } from "../http/problem.js";
import type {
  ReservationReleaseReason,
  ReservationRepository,
} from "../inventory/reservation-repository.js";

const ReservationItemSchema = Type.Object(
  {
    productId: Type.String({ minLength: 1, maxLength: 160 }),
    variantId: Type.String({ minLength: 1, maxLength: 160 }),
    quantity: Type.Integer({ minimum: 1, maximum: 100_000 }),
  },
  { additionalProperties: false },
);

const ReservationSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    reservationKey: Type.String(),
    orderId: Type.Union([Type.String(), Type.Null()]),
    status: Type.Union([
      Type.Literal("active"),
      Type.Literal("released"),
      Type.Literal("expired"),
      Type.Literal("converted"),
    ]),
    expiresAt: Type.String({ format: "date-time" }),
    releasedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    releaseReason: Type.Union([Type.String(), Type.Null()]),
    convertedAt: Type.Union([
      Type.String({ format: "date-time" }),
      Type.Null(),
    ]),
    createdAt: Type.String({ format: "date-time" }),
    items: Type.Array(ReservationItemSchema),
  },
  { $id: "StockReservation", additionalProperties: false },
);

const ReservationBody = Type.Object(
  {
    reservationKey: Type.String({ minLength: 1, maxLength: 160 }),
    orderId: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
    items: Type.Array(ReservationItemSchema, { minItems: 1, maxItems: 50 }),
  },
  { additionalProperties: false },
);
type ReservationBodyType = Static<typeof ReservationBody>;

const ReservationParams = Type.Object(
  { reservationId: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);

const ReleaseBody = Type.Object(
  {
    reason: Type.Optional(
      Type.Union([Type.Literal("cancelled"), Type.Literal("manual")]),
    ),
  },
  { additionalProperties: false },
);
type ReleaseBodyType = Static<typeof ReleaseBody>;

const ExpireBody = Type.Object(
  { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) },
  { additionalProperties: false },
);
type ExpireBodyType = Static<typeof ExpireBody>;

const ExpiryResponseSchema = Type.Object(
  {
    releasedCount: Type.Integer({ minimum: 0 }),
    reservationIds: Type.Array(Type.String({ format: "uuid" })),
  },
  { $id: "ReservationExpiryResponse", additionalProperties: false },
);

export interface AdminInventoryReservationRouteDependencies extends AdminGuardDependencies {
  auditRepository: AuditRepository;
  reservationRepository: ReservationRepository;
  environment: Environment;
}

function principal(request: {
  adminPrincipal: AdminPrincipal | null;
}): AdminPrincipal {
  if (!request.adminPrincipal)
    throw new Error("Admin guard did not set a principal.");
  return request.adminPrincipal;
}

function reservationReason(
  value: ReleaseBodyType["reason"],
): ReservationReleaseReason {
  return value ?? "manual";
}

export function registerAdminInventoryReservationRoutes(
  app: FastifyInstance,
  dependencies: AdminInventoryReservationRouteDependencies,
): void {
  app.addSchema(ReservationSchema);
  app.addSchema(ExpiryResponseSchema);

  app.post<{ Body: ReservationBodyType }>(
    "/api/v1/admin/inventory/reservations",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["inventory.reserve"],
      }),
      schema: {
        operationId: "adminCreateInventoryReservation",
        summary: "Reserve available stock transactionally",
        tags: ["admin-inventory"],
        security: [{ bearerAuth: [] }],
        body: ReservationBody,
        response: {
          201: ReservationSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      const reservation = await dependencies.reservationRepository.reserve({
        ...request.body,
        expiresAt: new Date(
          Date.now() +
            dependencies.environment.inventoryReservationTtlSeconds * 1_000,
        ),
        actorUserId: actor.userId,
      });
      await dependencies.auditRepository.append({
        requestId: request.id,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: "inventory.reservation_created",
        resourceType: "inventory_reservation",
        resourceId: reservation.id,
        outcome: "success",
        sourceIp: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        metadata: {
          reservationKey: reservation.reservationKey,
          itemCount: reservation.items.length,
        },
      });
      return reply.status(201).send(reservation);
    },
  );

  app.get<{ Params: Static<typeof ReservationParams> }>(
    "/api/v1/admin/inventory/reservations/:reservationId",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["inventory.read"],
      }),
      schema: {
        operationId: "adminGetInventoryReservation",
        summary: "Read one stock reservation",
        tags: ["admin-inventory"],
        security: [{ bearerAuth: [] }],
        params: ReservationParams,
        response: {
          200: ReservationSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) =>
      dependencies.reservationRepository.get(request.params.reservationId),
  );

  app.post<{
    Params: Static<typeof ReservationParams>;
    Body: ReleaseBodyType;
  }>(
    "/api/v1/admin/inventory/reservations/:reservationId/release",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["inventory.reserve"],
      }),
      schema: {
        operationId: "adminReleaseInventoryReservation",
        summary: "Release a stock reservation idempotently",
        tags: ["admin-inventory"],
        security: [{ bearerAuth: [] }],
        params: ReservationParams,
        body: ReleaseBody,
        response: {
          200: ReservationSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const reason = reservationReason(request.body.reason);
      const reservation = await dependencies.reservationRepository.release(
        request.params.reservationId,
        reason,
      );
      await dependencies.auditRepository.append({
        requestId: request.id,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: "inventory.reservation_released",
        resourceType: "inventory_reservation",
        resourceId: reservation.id,
        outcome: "success",
        sourceIp: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        metadata: { reason, status: reservation.status },
      });
      return reservation;
    },
  );

  app.post<{ Body: ExpireBodyType }>(
    "/api/v1/admin/inventory/reservations/expire",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["inventory.reserve"],
      }),
      schema: {
        operationId: "adminExpireInventoryReservations",
        summary: "Release expired stock reservations",
        tags: ["admin-inventory"],
        security: [{ bearerAuth: [] }],
        body: ExpireBody,
        response: {
          200: ExpiryResponseSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const result = await dependencies.reservationRepository.expire(
        new Date(),
        request.body.limit ?? 100,
      );
      await dependencies.auditRepository.append({
        requestId: request.id,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: "inventory.reservation_expired",
        resourceType: "inventory_reservation",
        resourceId: null,
        outcome: "success",
        sourceIp: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        metadata: {
          releasedCount: result.releasedCount,
          reservationIds: result.reservationIds,
        },
      });
      return result;
    },
  );
}
