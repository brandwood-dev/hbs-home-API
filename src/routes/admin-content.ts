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
import { AppError, ProblemDetailSchema } from "../http/problem.js";

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
  {
    items: Type.Array(MediaSchema),
    total: Type.Integer({ minimum: 0 }),
    limit: Type.Integer({ minimum: 1 }),
    offset: Type.Integer({ minimum: 0 }),
  },
  { $id: "AdminMediaResponse", additionalProperties: false },
);
const MediaListQuery = Type.Object(
  {
    q: Type.Optional(Type.String({ maxLength: 120 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    offset: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
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

const EditorialPageBlockSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    sortOrder: Type.Integer({ minimum: 0 }),
    blockType: Type.String({ minLength: 1, maxLength: 80 }),
    payload: Type.Record(Type.String(), Type.Unknown()),
    media: Type.Union([
      Type.Null(),
      Type.Object(
        {
          id: Type.String({ format: "uuid" }),
          publicUrl: Type.String({ format: "uri" }),
          alt: Type.String(),
        },
        { additionalProperties: false },
      ),
    ]),
  },
  { $id: "AdminEditorialPageBlock", additionalProperties: false },
);
const EditorialPageSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    title: Type.String(),
    body: Type.String(),
    seoTitle: Type.Union([Type.String(), Type.Null()]),
    seoDescription: Type.Union([Type.String(), Type.Null()]),
    status: Type.Union([
      Type.Literal("draft"),
      Type.Literal("published"),
      Type.Literal("archived"),
    ]),
    version: Type.Integer({ minimum: 1 }),
    publishedAt: Type.Union([
      Type.String({ format: "date-time" }),
      Type.Null(),
    ]),
    updatedAt: Type.String({ format: "date-time" }),
    blocks: Type.Array(EditorialPageBlockSchema),
  },
  { $id: "AdminEditorialPage", additionalProperties: false },
);
const EditorialPagesResponse = Type.Object(
  { items: Type.Array(EditorialPageSchema) },
  { $id: "AdminEditorialPagesResponse", additionalProperties: false },
);
const EditorialPageBlockInputSchema = Type.Object(
  {
    sortOrder: Type.Integer({ minimum: 0 }),
    blockType: Type.String({
      minLength: 1,
      maxLength: 80,
      pattern: "^[a-z][a-z0-9_-]{0,79}$",
    }),
    payload: Type.Record(Type.String(), Type.Unknown()),
    mediaAssetId: Type.Optional(
      Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    ),
  },
  { additionalProperties: false },
);
const EditorialPageBody = Type.Object(
  {
    slug: Type.String({
      minLength: 1,
      maxLength: 160,
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
    }),
    title: Type.String({ minLength: 1, maxLength: 240 }),
    body: Type.Optional(Type.String({ maxLength: 200000 })),
    seoTitle: Type.Optional(
      Type.Union([Type.String({ minLength: 1, maxLength: 160 }), Type.Null()]),
    ),
    seoDescription: Type.Optional(
      Type.Union([Type.String({ minLength: 1, maxLength: 320 }), Type.Null()]),
    ),
    blocks: Type.Optional(
      Type.Array(EditorialPageBlockInputSchema, { maxItems: 100 }),
    ),
  },
  { additionalProperties: false },
);
const EditorialPagePatchBody = Type.Partial(
  Type.Object(
    {
      slug: Type.String({
        minLength: 1,
        maxLength: 160,
        pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      }),
      title: Type.String({ minLength: 1, maxLength: 240 }),
      body: Type.String({ maxLength: 200000 }),
      seoTitle: Type.Union([
        Type.String({ minLength: 1, maxLength: 160 }),
        Type.Null(),
      ]),
      seoDescription: Type.Union([
        Type.String({ minLength: 1, maxLength: 320 }),
        Type.Null(),
      ]),
      blocks: Type.Array(EditorialPageBlockInputSchema, { maxItems: 100 }),
      expectedVersion: Type.Integer({ minimum: 1 }),
    },
    { additionalProperties: false },
  ),
);
const EmptyBody = Type.Object({}, { additionalProperties: false });

type MediaBodyType = Static<typeof MediaBody>;
type MediaPatchBodyType = Static<typeof MediaPatchBody>;
type EditorialPageBodyType = Static<typeof EditorialPageBody>;
type EditorialPagePatchBodyType = Static<typeof EditorialPagePatchBody>;

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
  if (!input.name.trim() || !input.alt.trim()) {
    throw new AppError({
      statusCode: 400,
      code: "MEDIA_VALIDATION_ERROR",
      title: "Invalid media asset",
      detail:
        "name and alt must contain at least one non-whitespace character.",
    });
  }
  const hasWidth = input.width !== undefined;
  const hasHeight = input.height !== undefined;
  if (
    hasWidth !== hasHeight ||
    (hasWidth && (input.width === null) !== (input.height === null))
  ) {
    throw new AppError({
      statusCode: 400,
      code: "MEDIA_VALIDATION_ERROR",
      title: "Invalid media asset",
      detail: "Width and height must be provided together or both be null.",
    });
  }
  return input;
}

function mediaPatch(input: MediaPatchBodyType): MediaAssetPatch {
  if (
    (input.name !== undefined && !input.name.trim()) ||
    (input.alt !== undefined && !input.alt.trim()) ||
    (input.usage !== undefined && !input.usage.trim())
  ) {
    throw new AppError({
      statusCode: 400,
      code: "MEDIA_VALIDATION_ERROR",
      title: "Invalid media asset",
      detail:
        "Media text fields must contain at least one non-whitespace character.",
    });
  }
  return input;
}

export function registerAdminContentRoutes(
  app: FastifyInstance,
  dependencies: AdminContentRouteDependencies,
): void {
  app.addSchema(MediaSchema);
  app.addSchema(MediaResponse);
  app.addSchema(EditorialPageSchema);
  app.addSchema(EditorialPagesResponse);

  app.get<{ Querystring: Static<typeof MediaListQuery> }>(
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
        querystring: MediaListQuery,
        response: {
          200: MediaResponse,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      // Keep the legacy repository call useful for selectors and editors while
      // paginated screens explicitly request a smaller page size.
      const limit = request.query.limit ?? 100;
      const offset = request.query.offset ?? 0;
      if (dependencies.adminContentRepository.listMediaPage) {
        return dependencies.adminContentRepository.listMediaPage({
          limit,
          offset,
          ...(request.query.q === undefined ? {} : { query: request.query.q }),
        });
      }
      const items = await dependencies.adminContentRepository.listMedia();
      const needle = request.query.q?.trim().toLocaleLowerCase();
      const filtered = needle
        ? items.filter((item) =>
            `${item.name} ${item.alt} ${item.usage}`
              .toLocaleLowerCase()
              .includes(needle),
          )
        : items;
      return {
        items: filtered.slice(offset, offset + limit),
        total: filtered.length,
        limit,
        offset,
      };
    },
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
    async (request, reply) => {
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
      return reply.code(200).send(item);
    },
  );

  app.get(
    "/api/v1/admin/content/pages",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["content.read"],
      }),
      schema: {
        operationId: "adminListEditorialPages",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        response: {
          200: EditorialPagesResponse,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async () => ({
      items: await dependencies.adminContentRepository.listPages(),
    }),
  );

  app.get<{ Params: Static<typeof IdParams> }>(
    "/api/v1/admin/content/pages/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["content.read"],
      }),
      schema: {
        operationId: "adminGetEditorialPage",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: {
          200: EditorialPageSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const item = await dependencies.adminContentRepository.getPage(
        request.params.id,
      );
      if (!item) {
        return reply.code(404).send({
          type: "https://hbs-home.com/problems/editorial-page-not-found",
          title: "Editorial page not found",
          status: 404,
          code: "EDITORIAL_PAGE_NOT_FOUND",
          detail: "The requested page does not exist.",
          instance: request.url,
          requestId: request.id,
        });
      }
      return reply.code(200).send(item);
    },
  );

  app.post<{ Body: EditorialPageBodyType }>(
    "/api/v1/admin/content/pages",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["content.write"],
      }),
      schema: {
        operationId: "adminCreateEditorialPage",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        body: EditorialPageBody,
        response: {
          201: EditorialPageSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      const item = await dependencies.adminContentRepository.createPage(
        request.body,
        actor.userId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "content.page_created",
        "editorial_page",
        item.id,
      );
      return reply.code(201).send(item);
    },
  );

  app.patch<{
    Params: Static<typeof IdParams>;
    Body: EditorialPagePatchBodyType;
  }>(
    "/api/v1/admin/content/pages/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["content.write"],
      }),
      schema: {
        operationId: "adminUpdateEditorialPage",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: EditorialPagePatchBody,
        response: {
          200: EditorialPageSchema,
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
      const item = await dependencies.adminContentRepository.updatePage(
        request.params.id,
        request.body,
        actor.userId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "content.page_updated",
        "editorial_page",
        item.id,
      );
      return reply.code(200).send(item);
    },
  );

  app.post<{ Params: Static<typeof IdParams> }>(
    "/api/v1/admin/content/pages/:id/publish",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["content.publish"],
      }),
      schema: {
        operationId: "adminPublishEditorialPage",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: EmptyBody,
        response: {
          200: EditorialPageSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      const item = await dependencies.adminContentRepository.publishPage(
        request.params.id,
        actor.userId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "content.page_published",
        "editorial_page",
        item.id,
      );
      return reply.code(200).send(item);
    },
  );

  app.post<{ Params: Static<typeof IdParams> }>(
    "/api/v1/admin/content/pages/:id/archive",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["content.publish"],
      }),
      schema: {
        operationId: "adminArchiveEditorialPage",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: EmptyBody,
        response: {
          200: EditorialPageSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      const item = await dependencies.adminContentRepository.archivePage(
        request.params.id,
        actor.userId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "content.page_archived",
        "editorial_page",
        item.id,
      );
      return reply.code(200).send(item);
    },
  );
}
