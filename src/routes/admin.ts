import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type {
  AuditListFilters,
  AuditRepository,
} from "../audit/audit-repository.js";
import {
  createAdminGuard,
  type AdminGuardDependencies,
  type AdminPrincipal,
} from "../auth/admin-guard.js";
import type { AdminAccessRepository } from "../identity/admin-access.js";
import { ProblemDetailSchema } from "../http/problem.js";

const AdminSessionSchema = Type.Object(
  {
    user: Type.Object(
      {
        id: Type.String({ format: "uuid" }),
        email: Type.String({ format: "email" }),
        displayName: Type.Union([Type.String(), Type.Null()]),
      },
      { additionalProperties: false },
    ),
    roles: Type.Array(Type.String()),
    permissions: Type.Array(Type.String()),
    assuranceLevel: Type.Union([Type.Literal("aal1"), Type.Literal("aal2")]),
    mfaRequired: Type.Boolean(),
  },
  { $id: "AdminSession", additionalProperties: false },
);
type AdminSession = Static<typeof AdminSessionSchema>;

const AuditEventSchema = Type.Object(
  {
    id: Type.String(),
    occurredAt: Type.String({ format: "date-time" }),
    requestId: Type.String(),
    actorUserId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    actorEmail: Type.Union([Type.String({ format: "email" }), Type.Null()]),
    action: Type.String(),
    resourceType: Type.String(),
    resourceId: Type.Union([Type.String(), Type.Null()]),
    outcome: Type.Union([
      Type.Literal("success"),
      Type.Literal("denied"),
      Type.Literal("failure"),
    ]),
    sourceIp: Type.Union([Type.String(), Type.Null()]),
    userAgent: Type.Union([Type.String(), Type.Null()]),
    metadata: Type.Record(Type.String(), Type.Unknown()),
  },
  { $id: "AuditEvent", additionalProperties: false },
);

const AuditListQuerySchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    offset: Type.Optional(Type.Integer({ minimum: 0 })),
    q: Type.Optional(Type.String({ maxLength: 120 })),
    actorUserId: Type.Optional(Type.String({ format: "uuid" })),
    action: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    resourceType: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
    outcome: Type.Optional(
      Type.Union([
        Type.Literal("success"),
        Type.Literal("denied"),
        Type.Literal("failure"),
      ]),
    ),
    dateFrom: Type.Optional(Type.String({ format: "date-time" })),
    dateTo: Type.Optional(Type.String({ format: "date-time" })),
  },
  { additionalProperties: false },
);
type AuditListQuery = Static<typeof AuditListQuerySchema>;

const AuditListResponseSchema = Type.Object(
  {
    items: Type.Array(AuditEventSchema),
    total: Type.Integer({ minimum: 0 }),
    limit: Type.Integer({ minimum: 1 }),
    offset: Type.Integer({ minimum: 0 }),
  },
  { $id: "AuditListResponse", additionalProperties: false },
);

function requirePrincipal(principal: AdminPrincipal | null): AdminPrincipal {
  if (!principal) throw new Error("Admin guard did not set a principal.");
  return principal;
}

export interface AdminRouteDependencies extends AdminGuardDependencies {
  adminAccessRepository: AdminAccessRepository;
  auditRepository: AuditRepository;
}

export function registerAdminRoutes(
  app: FastifyInstance,
  dependencies: AdminRouteDependencies,
): void {
  app.addSchema(AdminSessionSchema);
  app.addSchema(AuditEventSchema);
  app.addSchema(AuditListResponseSchema);

  app.get<{ Reply: AdminSession }>(
    "/api/v1/admin/session",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["admin.session_read"],
      }),
      schema: {
        operationId: "getAdminSession",
        summary: "Resolve the current Admin profile, roles and MFA state",
        tags: ["admin-identity"],
        security: [{ bearerAuth: [] }],
        response: {
          200: AdminSessionSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const principal = requirePrincipal(request.adminPrincipal);
      await Promise.all([
        dependencies.adminAccessRepository.markLastSeen(principal.userId),
        dependencies.auditRepository.append({
          requestId: request.id,
          actorUserId: principal.userId,
          actorEmail: principal.email,
          action: "auth.admin_session_checked",
          resourceType: "admin_session",
          resourceId: principal.userId,
          outcome: "success",
          sourceIp: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
          metadata: { assuranceLevel: principal.assuranceLevel },
        }),
      ]);

      return {
        user: {
          id: principal.userId,
          email: principal.email,
          displayName: principal.displayName,
        },
        roles: [...principal.roles],
        permissions: [...principal.permissions],
        assuranceLevel: principal.assuranceLevel,
        mfaRequired: principal.assuranceLevel !== "aal2",
      };
    },
  );

  app.get<{ Querystring: AuditListQuery }>(
    "/api/v1/admin/audit-events",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["audit.read"],
      }),
      schema: {
        operationId: "listAuditEvents",
        summary: "List recent immutable audit events",
        tags: ["admin-audit"],
        security: [{ bearerAuth: [] }],
        querystring: AuditListQuerySchema,
        response: {
          200: AuditListResponseSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const filters: AuditListFilters = {};
      if (request.query.q) filters.query = request.query.q;
      if (request.query.actorUserId)
        filters.actorUserId = request.query.actorUserId;
      if (request.query.action) filters.action = request.query.action;
      if (request.query.resourceType)
        filters.resourceType = request.query.resourceType;
      if (request.query.outcome) filters.outcome = request.query.outcome;
      if (request.query.dateFrom) filters.dateFrom = request.query.dateFrom;
      if (request.query.dateTo) filters.dateTo = request.query.dateTo;
      const limit = request.query.limit ?? 50;
      const offset = request.query.offset ?? 0;
      return dependencies.auditRepository.listRecentPage(
        limit,
        offset,
        filters,
      );
    },
  );
}
