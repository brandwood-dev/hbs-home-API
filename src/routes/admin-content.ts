import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { AuditRepository } from "../audit/audit-repository.js";
import {
  createAdminGuard,
  type AdminGuardDependencies,
  type AdminPrincipal,
} from "../auth/admin-guard.js";
import {
  type AdminContentRepository,
  type MediaAssetInput,
  type MediaAssetPatch,
} from "../content/admin-content-repository.js";
import { ProblemDetailSchema } from "../http/problem.js";

const IdParams = Type.Object(
  { id: Type.String({ minLength: 1, maxLength: 160 }) },
  { additionalProperties: false },
);
const MediaStatus = Type.Union([
  Type.Literal("draft"),
  Type.Literal("active"),
  Type.Literal("archived"),
]);
const MediaMimeType = Type.Union([
  Type.Literal("image/jpeg"),
  Type.Literal("image/png"),
  Type.Literal("image/webp"),
  Type.Literal("image/avif"),
]);
const NullablePositiveInteger = Type.Union([
  Type.Integer({ minimum: 1 }),
  Type.Null(),
]);
const MediaSchema = Type.Object(
  {
    id: Type.String(),
    storagePath: Type.String(),
    publicUrl: Type.String({ format: "uri" }),
    name: Type.String(),
    alt: Type.String(),
    width: NullablePositiveInteger,
    height: NullablePositiveInteger,
    mimeType: MediaMimeType,
    status: MediaStatus,
    usage: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { $id: "AdminMediaAsset", additionalProperties: false },
);
const MediaResponse = Type.Object(
  { items: Type.Array(MediaSchema) },
  { $id: "AdminMediaResponse", additionalProperties: false },
);
const MediaBody = Type.Object(
  {
    storagePath: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
    publicUrl: Type.String({ format: "uri", maxLength: 2048 }),
    name: Type.String({ minLength: 1, maxLength: 240 }),
    alt: Type.String({ minLength: 1, maxLength: 240 }),
    width: Type.Optional(NullablePositiveInteger),
    height: Type.Optional(NullablePositiveInteger),
    mimeType: MediaMimeType,
    status: Type.Optional(MediaStatus),
    usage: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  },
  { additionalProperties: false },
);
const MediaPatchBody = Type.Partial(
  Type.Object(
    {
      name: Type.String({ minLength: 1, maxLength: 240 }),
      alt: Type.String({ minLength: 1, maxLength: 240 }),
      width: NullablePositiveInteger,
      height: NullablePositiveInteger,
      status: MediaStatus,
      usage: Type.String({ minLength: 1, maxLength: 80 }),
    },
    { additionalProperties: false },
  ),
);

type MediaBodyType = Static<typeof MediaBody>;
type MediaPatchBodyType = Static<typeof MediaPatchBody>;

export interface AdminContentRouteDependencies extends AdminGuardDependencies {
  adminContentRepository: AdminContentRepository;
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
  dependencies: AdminContentRouteDependencies,
  request: {
    id: string;
    ip: string;
    headers: Record<string, string | string[] | undefined>;
  },
  actor: AdminPrincipal,
  action: string,
  resourceType: string,
  resourceId: string,
): Promise<void> {
  await dependencies.auditRepository.append({
    requestId: request.id,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action,
    resourceType,
    resourceId,
    outcome: "success",
    sourceIp: request.ip,
    userAgent: request.headers["user-agent"]?.toString() ?? null,
  });
}

function mediaInput(input: MediaBodyType): MediaAssetInput {
  return input;
}

function mediaPatch(input: MediaPatchBodyType): MediaAssetPatch {
  return input;
}

export function registerAdminContentRoutes(
  app: FastifyInstance,
  dependencies: AdminContentRouteDependencies,
): void {
  app.addSchema(MediaSchema);
  app.addSchema(MediaResponse);

  app.get(
    "/api/v1/admin/media",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["media.read"],
      }),
      schema: {
        operationId: "adminListMedia",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        response: {
          200: MediaResponse,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async () => ({
      items: await dependencies.adminContentRepository.listMedia(),
    }),
  );

  app.post<{ Body: MediaBodyType }>(
    "/api/v1/admin/media",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["media.write"],
      }),
      schema: {
        operationId: "adminCreateMedia",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        body: MediaBody,
        response: {
          201: MediaSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      const item = await dependencies.adminContentRepository.createMedia(
        mediaInput(request.body),
        actor.userId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "content.media_created",
        "media",
        item.id,
      );
      return reply.code(201).send(item);
    },
  );

  app.patch<{ Params: Static<typeof IdParams>; Body: MediaPatchBodyType }>(
    "/api/v1/admin/media/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["media.write"],
      }),
      schema: {
        operationId: "adminUpdateMedia",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: MediaPatchBody,
        response: {
          200: MediaSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const item = await dependencies.adminContentRepository.updateMedia(
        request.params.id,
        mediaPatch(request.body),
        actor.userId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "content.media_updated",
        "media",
        item.id,
      );
      return item;
    },
  );
}
