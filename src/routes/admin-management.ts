import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { AuditRepository } from "../audit/audit-repository.js";
import {
  createAdminGuard,
  type AdminGuardDependencies,
  type AdminPrincipal,
} from "../auth/admin-guard.js";
import type { AdminManagementRepository } from "../identity/admin-management-repository.js";
import type { AdminSettingsRepository } from "../settings/admin-settings-repository.js";
import { ProblemDetailSchema } from "../http/problem.js";
import { AppError } from "../http/problem.js";

const StatusSchema = Type.Union([
  Type.Literal("invited"),
  Type.Literal("active"),
  Type.Literal("suspended"),
  Type.Literal("revoked"),
]);
const UserSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    email: Type.String({ format: "email" }),
    displayName: Type.Union([Type.String(), Type.Null()]),
    status: StatusSchema,
    createdAt: Type.String({ format: "date-time" }),
    lastSeenAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    roles: Type.Array(Type.String()),
  },
  { $id: "AdminManagedUser", additionalProperties: false },
);
const RoleSchema = Type.Object(
  {
    key: Type.String(),
    name: Type.String(),
    description: Type.String(),
    isSystem: Type.Boolean(),
    permissions: Type.Array(Type.String()),
  },
  { $id: "AdminManagedRole", additionalProperties: false },
);
const SettingsSchema = Type.Object(
  {
    payload: Type.Record(Type.String(), Type.Unknown()),
    version: Type.Integer(),
    updatedAt: Type.String({ format: "date-time" }),
    updatedBy: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  },
  { $id: "AdminSettings", additionalProperties: false },
);
const UsersQuerySchema = Type.Object(
  {
    q: Type.Optional(Type.String({ maxLength: 120 })),
    status: Type.Optional(StatusSchema),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 100_000 })),
  },
  { additionalProperties: false },
);
const UserListSchema = Type.Object(
  {
    items: Type.Array(UserSchema),
    total: Type.Integer(),
    limit: Type.Integer(),
    offset: Type.Integer(),
  },
  { $id: "AdminUserList", additionalProperties: false },
);
const UpdateSettingsSchema = Type.Object(
  {
    payload: Type.Record(Type.String(), Type.Unknown()),
    expectedVersion: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);
const UpdateStatusSchema = Type.Object(
  { status: StatusSchema },
  { additionalProperties: false },
);
const RoleBodySchema = Type.Object(
  { roleKey: Type.String({ minLength: 1, maxLength: 80 }) },
  { additionalProperties: false },
);
const InviteBodySchema = Type.Object(
  {
    email: Type.String({ format: "email" }),
    displayName: Type.Optional(Type.String({ maxLength: 120 })),
    roleKey: Type.String({ minLength: 1, maxLength: 80 }),
    redirectTo: Type.String({ format: "uri" }),
  },
  { additionalProperties: false },
);

function principal(request: {
  adminPrincipal: AdminPrincipal | null;
}): AdminPrincipal {
  if (!request.adminPrincipal)
    throw new Error("Admin guard did not set a principal.");
  return request.adminPrincipal;
}

async function audit(
  auditRepository: AuditRepository,
  request: {
    id: string;
    ip: string;
    headers: Record<string, string | string[] | undefined>;
  },
  actor: AdminPrincipal,
  action: string,
  resourceType: string,
  resourceId: string,
  outcome: "success" | "failure" = "success",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await auditRepository.append({
    requestId: request.id,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action,
    resourceType,
    resourceId,
    outcome,
    sourceIp: request.ip,
    userAgent:
      typeof request.headers["user-agent"] === "string"
        ? request.headers["user-agent"]
        : null,
    metadata,
  });
}

export interface AdminManagementRouteDependencies extends AdminGuardDependencies {
  adminSettingsRepository: AdminSettingsRepository;
  adminManagementRepository: AdminManagementRepository;
}

export function registerAdminManagementRoutes(
  app: FastifyInstance,
  dependencies: AdminManagementRouteDependencies,
): void {
  app.addSchema(UserSchema);
  app.addSchema(RoleSchema);
  app.addSchema(SettingsSchema);
  app.addSchema(UserListSchema);

  app.get(
    "/api/v1/admin/settings",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["settings.manage"],
      }),
      schema: {
        operationId: "getAdminSettings",
        summary: "Read editable Admin settings",
        tags: ["admin-settings"],
        security: [{ bearerAuth: [] }],
        response: {
          200: SettingsSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async () => dependencies.adminSettingsRepository.get(),
  );

  app.post<{ Body: Static<typeof InviteBodySchema> }>(
    "/api/v1/admin/users/invite",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["users.manage"],
      }),
      schema: {
        operationId: "inviteAdminUser",
        summary: "Invite an Admin user through Supabase Auth",
        tags: ["admin-users"],
        security: [{ bearerAuth: [] }],
        body: InviteBodySchema,
        response: {
          200: UserSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          502: ProblemDetailSchema,
          503: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const redirect = new URL(request.body.redirectTo);
      if (redirect.protocol !== "https:" && redirect.hostname !== "localhost")
        throw new AppError({
          statusCode: 400,
          code: "INVALID_INVITE_REDIRECT",
          title: "Invalid invitation redirect",
          detail:
            "The invitation redirect must use HTTPS (or localhost in development).",
        });
      const result = await dependencies.adminManagementRepository.invite(
        request.body,
        actor.userId,
      );
      await audit(
        dependencies.auditRepository,
        request,
        actor,
        "admin_user.invited",
        "admin_user",
        result.id,
        "success",
        {
          roleKey: request.body.roleKey,
          email: request.body.email.toLowerCase(),
        },
      );
      return result;
    },
  );

  app.patch<{ Body: Static<typeof UpdateSettingsSchema> }>(
    "/api/v1/admin/settings",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["settings.manage"],
      }),
      schema: {
        operationId: "updateAdminSettings",
        summary: "Update editable Admin settings",
        tags: ["admin-settings"],
        security: [{ bearerAuth: [] }],
        body: UpdateSettingsSchema,
        response: {
          200: SettingsSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const result = await dependencies.adminSettingsRepository.update(
        request.body.payload,
        actor.userId,
        request.body.expectedVersion,
      );
      await audit(
        dependencies.auditRepository,
        request,
        actor,
        "settings.updated",
        "admin_settings",
        "1",
        "success",
        { version: result.version },
      );
      return result;
    },
  );

  app.get<{ Querystring: Static<typeof UsersQuerySchema> }>(
    "/api/v1/admin/users",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["users.read"],
      }),
      schema: {
        operationId: "listAdminUsers",
        summary: "List Admin users and roles",
        tags: ["admin-users"],
        security: [{ bearerAuth: [] }],
        querystring: UsersQuerySchema,
        response: {
          200: UserListSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async (request) =>
      dependencies.adminManagementRepository.listUsers({
        ...(request.query.q ? { query: request.query.q } : {}),
        ...(request.query.status ? { status: request.query.status } : {}),
        limit: request.query.limit ?? 50,
        offset: request.query.offset ?? 0,
      }),
  );

  app.get(
    "/api/v1/admin/roles",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["users.read"],
      }),
      schema: {
        operationId: "listAdminRoles",
        summary: "List available Admin roles and permissions",
        tags: ["admin-users"],
        security: [{ bearerAuth: [] }],
        response: {
          200: Type.Object({ items: Type.Array(RoleSchema) }),
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async () => ({
      items: await dependencies.adminManagementRepository.listRoles(),
    }),
  );

  app.patch<{
    Params: { id: string };
    Body: Static<typeof UpdateStatusSchema>;
  }>(
    "/api/v1/admin/users/:id/status",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["users.manage"],
      }),
      schema: {
        operationId: "updateAdminUserStatus",
        summary: "Suspend, reactivate or revoke an Admin user",
        tags: ["admin-users"],
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Type.String({ format: "uuid" }) }),
        body: UpdateStatusSchema,
        response: {
          200: UserSchema,
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
      if (
        actor.userId === request.params.id &&
        request.body.status !== "active"
      )
        throw new AppError({
          statusCode: 409,
          code: "SELF_ADMIN_STATUS_CHANGE",
          title: "Cannot change own status",
          detail: "An Admin cannot deactivate its own account.",
        });
      const result = await dependencies.adminManagementRepository.updateStatus(
        request.params.id,
        request.body.status,
      );
      await audit(
        dependencies.auditRepository,
        request,
        actor,
        "admin_user.status_changed",
        "admin_user",
        request.params.id,
        "success",
        { status: request.body.status },
      );
      return result;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/v1/admin/users/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["users.manage"],
      }),
      schema: {
        operationId: "removeAdminUser",
        summary: "Remove an Admin member and revoke all access",
        tags: ["admin-users"],
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Type.String({ format: "uuid" }) }),
        response: {
          200: UserSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      if (!actor.roles.includes("super_admin"))
        throw new AppError({
          statusCode: 403,
          code: "SUPER_ADMIN_REQUIRED",
          title: "Super Admin required",
          detail: "Only a Super Admin can remove an Admin team member.",
        });
      if (actor.userId === request.params.id)
        throw new AppError({
          statusCode: 409,
          code: "SELF_ADMIN_DELETE",
          title: "Cannot remove yourself",
          detail: "A Super Admin cannot remove its own account.",
        });
      const result = await dependencies.adminManagementRepository.removeMember(
        request.params.id,
        actor.userId,
      );
      await audit(
        dependencies.auditRepository,
        request,
        actor,
        "admin_user.removed",
        "admin_user",
        request.params.id,
        "success",
      );
      return result;
    },
  );

  app.post<{ Params: { id: string }; Body: Static<typeof RoleBodySchema> }>(
    "/api/v1/admin/users/:id/roles",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["users.manage"],
      }),
      schema: {
        operationId: "assignAdminRole",
        summary: "Assign an Admin role",
        tags: ["admin-users"],
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Type.String({ format: "uuid" }) }),
        body: RoleBodySchema,
        response: {
          200: UserSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const result = await dependencies.adminManagementRepository.assignRole(
        request.params.id,
        request.body.roleKey,
        actor.userId,
      );
      await audit(
        dependencies.auditRepository,
        request,
        actor,
        "admin_user.role_assigned",
        "admin_user",
        request.params.id,
        "success",
        { roleKey: request.body.roleKey },
      );
      return result;
    },
  );

  app.delete<{ Params: { id: string; roleKey: string } }>(
    "/api/v1/admin/users/:id/roles/:roleKey",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["users.manage"],
      }),
      schema: {
        operationId: "revokeAdminRole",
        summary: "Revoke an Admin role",
        tags: ["admin-users"],
        security: [{ bearerAuth: [] }],
        params: Type.Object({
          id: Type.String({ format: "uuid" }),
          roleKey: Type.String({ minLength: 1, maxLength: 80 }),
        }),
        response: {
          200: UserSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const result = await dependencies.adminManagementRepository.revokeRole(
        request.params.id,
        request.params.roleKey,
        actor.userId,
      );
      await audit(
        dependencies.auditRepository,
        request,
        actor,
        "admin_user.role_revoked",
        "admin_user",
        request.params.id,
        "success",
        { roleKey: request.params.roleKey },
      );
      return result;
    },
  );
}
