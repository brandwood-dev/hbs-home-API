import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { AuditRepository } from "../audit/audit-repository.js";
import {
  createAdminGuard,
  type AdminGuardDependencies,
  type AdminPrincipal,
} from "../auth/admin-guard.js";
import type {
  AdminPromotionInput,
  AdminPromotionPatch,
  AdminPromotionRepository,
} from "../promotions/admin-promotion-repository.js";
import { ProblemDetailSchema } from "../http/problem.js";

const IdParams = Type.Object(
  { id: Type.String({ minLength: 1, maxLength: 160 }) },
  { additionalProperties: false },
);
const ListQuery = Type.Object(
  {
    q: Type.Optional(Type.String({ maxLength: 120 })),
    isActive: Type.Optional(Type.Boolean()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    offset: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);
const NullableDate = Type.Union([
  Type.String({ format: "date-time" }),
  Type.Null(),
]);
const DiscountType = Type.Union([
  Type.Literal("percentage"),
  Type.Literal("fixed_amount"),
]);
const PromotionSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    name: Type.String({ minLength: 1, maxLength: 160 }),
    code: Type.String({ pattern: "^[A-Z0-9][A-Z0-9_-]{2,63}$" }),
    discountType: DiscountType,
    discountValue: Type.Integer({ minimum: 1 }),
    currency: Type.Literal("TND"),
    minSubtotalMinor: Type.Integer({ minimum: 0 }),
    startsAt: NullableDate,
    endsAt: NullableDate,
    maxRedemptions: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    redeemedCount: Type.Integer({ minimum: 0 }),
    isActive: Type.Boolean(),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { $id: "AdminPromotion", additionalProperties: false },
);
const PromotionsResponse = Type.Object(
  {
    items: Type.Array(PromotionSchema),
    total: Type.Integer({ minimum: 0 }),
    limit: Type.Integer({ minimum: 1 }),
    offset: Type.Integer({ minimum: 0 }),
  },
  { $id: "AdminPromotionsResponse", additionalProperties: false },
);
const PromotionBody = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 160 }),
    code: Type.String({
      minLength: 3,
      maxLength: 64,
      pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$",
    }),
    discountType: DiscountType,
    discountValue: Type.Integer({ minimum: 1 }),
    minSubtotalMinor: Type.Optional(Type.Integer({ minimum: 0 })),
    startsAt: Type.Optional(NullableDate),
    endsAt: Type.Optional(NullableDate),
    maxRedemptions: Type.Optional(
      Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    ),
    isActive: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
const PromotionPatchBody = Type.Partial(PromotionBody);
const EmptyBody = Type.Optional(
  Type.Object({}, { additionalProperties: false }),
);

type ListQueryType = Static<typeof ListQuery>;
type PromotionBodyType = Static<typeof PromotionBody>;
type PromotionPatchBodyType = Static<typeof PromotionPatchBody>;

export interface AdminPromotionRouteDependencies extends AdminGuardDependencies {
  adminPromotionRepository: AdminPromotionRepository;
  auditRepository: AuditRepository;
}

function principal(request: {
  adminPrincipal: AdminPrincipal | null;
}): AdminPrincipal {
  if (!request.adminPrincipal)
    throw new Error("Admin guard did not set a principal.");
  return request.adminPrincipal;
}

async function audit(
  dependencies: AdminPromotionRouteDependencies,
  request: {
    id: string;
    ip: string;
    headers: Record<string, string | string[] | undefined>;
  },
  actor: AdminPrincipal,
  action: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await dependencies.auditRepository.append({
    requestId: request.id,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action,
    resourceType: "promotion",
    resourceId,
    outcome: "success",
    sourceIp: request.ip,
    userAgent: request.headers["user-agent"]?.toString() ?? null,
    metadata,
  });
}

function input(body: PromotionBodyType): AdminPromotionInput {
  return {
    ...body,
    ...(body.startsAt === undefined ? {} : { startsAt: body.startsAt }),
    ...(body.endsAt === undefined ? {} : { endsAt: body.endsAt }),
  };
}

function patch(body: PromotionPatchBodyType): AdminPromotionPatch {
  return body;
}

export function registerAdminPromotionRoutes(
  app: FastifyInstance,
  dependencies: AdminPromotionRouteDependencies,
): void {
  app.addSchema(PromotionSchema);
  app.addSchema(PromotionsResponse);

  app.get<{ Querystring: ListQueryType }>(
    "/api/v1/admin/promotions",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["promotions.read"],
      }),
      schema: {
        operationId: "adminListPromotions",
        summary: "List promotion rules",
        tags: ["admin-promotions"],
        security: [{ bearerAuth: [] }],
        querystring: ListQuery,
        response: {
          200: PromotionsResponse,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const limit = request.query.limit ?? 100;
      const offset = request.query.offset ?? 0;
      const result = await dependencies.adminPromotionRepository.list({
        ...(request.query.q ? { query: request.query.q } : {}),
        ...(request.query.isActive === undefined
          ? {}
          : { isActive: request.query.isActive }),
        limit,
        offset,
      });
      return { ...result, limit, offset };
    },
  );

  app.post<{ Body: PromotionBodyType }>(
    "/api/v1/admin/promotions",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["promotions.write"],
      }),
      schema: {
        operationId: "adminCreatePromotion",
        summary: "Create a promotion rule",
        tags: ["admin-promotions"],
        security: [{ bearerAuth: [] }],
        body: PromotionBody,
        response: {
          201: PromotionSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const item = await dependencies.adminPromotionRepository.create(
        input(request.body),
      );
      await audit(
        dependencies,
        request,
        principal(request),
        "promotion.created",
        item.id,
        { code: item.code },
      );
      return reply.code(201).send(item);
    },
  );

  app.get<{ Params: Static<typeof IdParams> }>(
    "/api/v1/admin/promotions/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["promotions.read"],
      }),
      schema: {
        operationId: "adminGetPromotion",
        summary: "Get a promotion rule",
        tags: ["admin-promotions"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: {
          200: PromotionSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) =>
      dependencies.adminPromotionRepository.get(request.params.id),
  );

  app.patch<{ Params: Static<typeof IdParams>; Body: PromotionPatchBodyType }>(
    "/api/v1/admin/promotions/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["promotions.write"],
      }),
      schema: {
        operationId: "adminUpdatePromotion",
        summary: "Update a promotion rule",
        tags: ["admin-promotions"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: PromotionPatchBody,
        response: {
          200: PromotionSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const item = await dependencies.adminPromotionRepository.update(
        request.params.id,
        patch(request.body),
      );
      await audit(
        dependencies,
        request,
        principal(request),
        "promotion.updated",
        item.id,
        { code: item.code },
      );
      return reply.type("application/json").send(item);
    },
  );

  app.post<{
    Params: Static<typeof IdParams>;
    Body: Record<string, never> | undefined;
  }>(
    "/api/v1/admin/promotions/:id/archive",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["promotions.write"],
      }),
      schema: {
        operationId: "adminArchivePromotion",
        summary: "Deactivate a promotion rule",
        tags: ["admin-promotions"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: EmptyBody,
        response: {
          200: PromotionSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const item = await dependencies.adminPromotionRepository.archive(
        request.params.id,
      );
      await audit(
        dependencies,
        request,
        principal(request),
        "promotion.archived",
        item.id,
        { code: item.code },
      );
      return item;
    },
  );
}
