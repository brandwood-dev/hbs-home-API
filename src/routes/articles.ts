import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { AuditRepository } from "../audit/audit-repository.js";
import {
  createAdminGuard,
  type AdminGuardDependencies,
  type AdminPrincipal,
} from "../auth/admin-guard.js";
import {
  type AdminArticleInput,
  type ArticleRepository,
} from "../content/article-repository.js";
import { ProblemDetailSchema } from "../http/problem.js";

const CategorySchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
    description: Type.String(),
    sortOrder: Type.Integer({ minimum: 0 }),
  },
  { $id: "ArticleCategory", additionalProperties: false },
);
const CoverSchema = Type.Object(
  {
    id: Type.Optional(Type.String({ format: "uuid" })),
    publicUrl: Type.String({ format: "uri" }),
    alt: Type.String(),
    width: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    height: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  },
  { additionalProperties: false },
);
const BlockSchema = Type.Record(
  Type.String({ minLength: 1, maxLength: 80 }),
  Type.Unknown(),
);
const PublicArticleSummarySchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    title: Type.String(),
    excerpt: Type.String(),
    category: CategorySchema,
    cover: Type.Union([CoverSchema, Type.Null()]),
    readingTimeMinutes: Type.Integer({ minimum: 1 }),
    authorName: Type.String(),
    publishedAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
    isFeatured: Type.Boolean(),
  },
  { $id: "PublicArticleSummary", additionalProperties: false },
);
const PublicArticleSchema = Type.Composite(
  [
    PublicArticleSummarySchema,
    Type.Object({
      bodyBlocks: Type.Array(BlockSchema),
      seoTitle: Type.Union([Type.String(), Type.Null()]),
      seoDescription: Type.Union([Type.String(), Type.Null()]),
    }),
  ],
  { $id: "PublicArticle", additionalProperties: false },
);
const PublicArticleListSchema = Type.Object(
  {
    items: Type.Array(PublicArticleSummarySchema),
    page: Type.Integer({ minimum: 1 }),
    pageSize: Type.Integer({ minimum: 1 }),
    total: Type.Integer({ minimum: 0 }),
    totalPages: Type.Integer({ minimum: 0 }),
  },
  { $id: "PublicArticleList", additionalProperties: false },
);
const RevisionSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    status: Type.Union([
      Type.Literal("draft"),
      Type.Literal("published"),
      Type.Literal("archived"),
    ]),
    version: Type.Integer({ minimum: 1 }),
    title: Type.String(),
    excerpt: Type.String(),
    bodyBlocks: Type.Array(BlockSchema),
    cover: Type.Union([CoverSchema, Type.Null()]),
    readingTimeMinutes: Type.Integer({ minimum: 1 }),
    seoTitle: Type.Union([Type.String(), Type.Null()]),
    seoDescription: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
const AdminArticleSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    status: Type.Union([
      Type.Literal("draft"),
      Type.Literal("published"),
      Type.Literal("archived"),
    ]),
    category: CategorySchema,
    isFeatured: Type.Boolean(),
    homeSortOrder: Type.Integer({ minimum: 0 }),
    authorName: Type.String(),
    publishedAt: Type.Union([
      Type.String({ format: "date-time" }),
      Type.Null(),
    ]),
    updatedAt: Type.String({ format: "date-time" }),
    version: Type.Integer({ minimum: 1 }),
    draft: Type.Union([RevisionSchema, Type.Null()]),
    published: Type.Union([RevisionSchema, Type.Null()]),
  },
  { $id: "AdminArticle", additionalProperties: false },
);
const AdminArticleListSchema = Type.Object(
  {
    items: Type.Array(AdminArticleSchema),
    total: Type.Integer({ minimum: 0 }),
  },
  { $id: "AdminArticleList", additionalProperties: false },
);
const CategoryParams = Type.Object(
  {
    slug: Type.String({
      minLength: 1,
      maxLength: 160,
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
    }),
  },
  { additionalProperties: false },
);
const IdParams = Type.Object(
  { id: Type.String({ minLength: 1, maxLength: 80 }) },
  { additionalProperties: false },
);
const PublicListQuery = Type.Object(
  {
    q: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    category: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
    featured: Type.Optional(Type.Boolean()),
    page: Type.Optional(Type.Integer({ minimum: 1, maximum: 10000 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 24 })),
  },
  { additionalProperties: false },
);
const AdminListQuery = Type.Object(
  {
    q: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    status: Type.Optional(
      Type.Union([
        Type.Literal("draft"),
        Type.Literal("published"),
        Type.Literal("archived"),
      ]),
    ),
    categoryId: Type.Optional(Type.String({ format: "uuid" })),
    page: Type.Optional(Type.Integer({ minimum: 1, maximum: 10000 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);
const ArticleBody = Type.Object(
  {
    slug: Type.String({
      minLength: 1,
      maxLength: 160,
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
    }),
    categoryId: Type.String({ format: "uuid" }),
    title: Type.String({ minLength: 1, maxLength: 240 }),
    excerpt: Type.String({ minLength: 1, maxLength: 600 }),
    bodyBlocks: Type.Array(BlockSchema, { minItems: 1, maxItems: 100 }),
    coverMediaAssetId: Type.Union([
      Type.String({ format: "uuid" }),
      Type.Null(),
    ]),
    readingTimeMinutes: Type.Optional(
      Type.Integer({ minimum: 1, maximum: 120 }),
    ),
    seoTitle: Type.Optional(
      Type.Union([Type.String({ minLength: 1, maxLength: 160 }), Type.Null()]),
    ),
    seoDescription: Type.Optional(
      Type.Union([Type.String({ minLength: 1, maxLength: 320 }), Type.Null()]),
    ),
    isFeatured: Type.Optional(Type.Boolean()),
    homeSortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
    authorName: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  },
  { additionalProperties: false },
);
const ArticlePatchBody = Type.Partial(
  Type.Composite([
    ArticleBody,
    Type.Object({
      expectedVersion: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
  ]),
  { additionalProperties: false },
);
const EmptyBody = Type.Object({}, { additionalProperties: false });

type PublicListQueryType = Static<typeof PublicListQuery>;
type ArticleBodyType = Static<typeof ArticleBody>;
type ArticlePatchBodyType = Static<typeof ArticlePatchBody>;

export interface ArticleRouteDependencies extends AdminGuardDependencies {
  articleRepository: ArticleRepository;
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
  dependencies: ArticleRouteDependencies,
  request: {
    id: string;
    ip: string;
    headers: Record<string, string | string[] | undefined>;
  },
  actor: AdminPrincipal,
  action: string,
  resourceId: string,
): Promise<void> {
  await dependencies.auditRepository.append({
    requestId: request.id,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action,
    resourceType: "article",
    resourceId,
    outcome: "success",
    sourceIp: request.ip,
    userAgent: request.headers["user-agent"]?.toString() ?? null,
  });
}

function bodyInput(input: ArticleBodyType): AdminArticleInput {
  return input;
}

export function registerArticleRoutes(
  app: FastifyInstance,
  dependencies: ArticleRouteDependencies,
): void {
  app.addSchema(CategorySchema);
  app.addSchema(PublicArticleSummarySchema);
  app.addSchema(PublicArticleSchema);
  app.addSchema(PublicArticleListSchema);
  app.addSchema(AdminArticleSchema);
  app.addSchema(AdminArticleListSchema);

  app.get<{ Querystring: PublicListQueryType }>(
    "/api/v1/content/articles",
    {
      schema: {
        operationId: "listPublishedArticles",
        summary: "List published inspiration articles",
        tags: ["content"],
        querystring: PublicListQuery,
        response: { 200: PublicArticleListSchema },
      },
    },
    async (request, reply) => {
      const result = await dependencies.articleRepository.listPublic({
        ...(request.query.q === undefined ? {} : { query: request.query.q }),
        ...(request.query.category === undefined
          ? {}
          : { category: request.query.category }),
        ...(request.query.featured === undefined
          ? {}
          : { featured: request.query.featured }),
        page: request.query.page ?? 1,
        pageSize: request.query.pageSize ?? 12,
      });
      return reply
        .header(
          "cache-control",
          "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
        )
        .send(result);
    },
  );

  app.get<{ Params: Static<typeof CategoryParams> }>(
    "/api/v1/content/articles/:slug",
    {
      schema: {
        operationId: "getPublishedArticle",
        summary: "Get one published inspiration article",
        tags: ["content"],
        params: CategoryParams,
        response: { 200: PublicArticleSchema, 404: ProblemDetailSchema },
      },
    },
    async (request, reply) => {
      const item = await dependencies.articleRepository.getPublicBySlug(
        request.params.slug,
      );
      if (!item)
        return reply
          .header("cache-control", "public, max-age=30")
          .code(404)
          .send({
            type: "https://hbs-home.com/problems/article-not-found",
            title: "Article not found",
            status: 404,
            code: "ARTICLE_NOT_FOUND",
            detail: "The requested published article does not exist.",
            instance: request.url,
            requestId: request.id,
          });
      return reply
        .header(
          "cache-control",
          "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
        )
        .send(item);
    },
  );

  app.get(
    "/api/v1/content/article-categories",
    {
      schema: {
        operationId: "listArticleCategories",
        summary: "List active article categories",
        tags: ["content"],
        response: { 200: Type.Object({ items: Type.Array(CategorySchema) }) },
      },
    },
    async () => ({
      items: await dependencies.articleRepository.listCategories(true),
    }),
  );

  app.get<{ Querystring: Static<typeof AdminListQuery> }>(
    "/api/v1/admin/content/articles",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["content.read"],
      }),
      schema: {
        operationId: "adminListArticles",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        querystring: AdminListQuery,
        response: {
          200: AdminArticleListSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async (request) => ({
      ...(await dependencies.articleRepository.list({
        ...(request.query.q === undefined ? {} : { query: request.query.q }),
        ...(request.query.status === undefined
          ? {}
          : { status: request.query.status }),
        ...(request.query.categoryId === undefined
          ? {}
          : { categoryId: request.query.categoryId }),
        limit: request.query.pageSize ?? 20,
        offset:
          ((request.query.page ?? 1) - 1) * (request.query.pageSize ?? 20),
      })),
    }),
  );

  app.get<{ Params: Static<typeof IdParams> }>(
    "/api/v1/admin/content/articles/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["content.read"],
      }),
      schema: {
        operationId: "adminGetArticle",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: {
          200: AdminArticleSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const item = await dependencies.articleRepository.get(request.params.id);
      if (!item)
        return reply.code(404).send({
          type: "https://hbs-home.com/problems/article-not-found",
          title: "Article not found",
          status: 404,
          code: "ARTICLE_NOT_FOUND",
          detail: "The requested article does not exist.",
          instance: request.url,
          requestId: request.id,
        });
      return item;
    },
  );

  app.get(
    "/api/v1/admin/content/article-categories",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["content.read"],
      }),
      schema: {
        operationId: "adminListArticleCategories",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        response: {
          200: Type.Object({ items: Type.Array(CategorySchema) }),
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async () => ({
      items: await dependencies.articleRepository.listCategories(true),
    }),
  );

  app.post<{ Body: ArticleBodyType }>(
    "/api/v1/admin/content/articles",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["content.write"],
      }),
      schema: {
        operationId: "adminCreateArticle",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        body: ArticleBody,
        response: {
          201: AdminArticleSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      const item = await dependencies.articleRepository.create(
        bodyInput(request.body),
        actor.userId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "content.article_created",
        item.id,
      );
      return reply.code(201).send(item);
    },
  );

  app.patch<{ Params: Static<typeof IdParams>; Body: ArticlePatchBodyType }>(
    "/api/v1/admin/content/articles/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["content.write"],
      }),
      schema: {
        operationId: "adminUpdateArticle",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: ArticlePatchBody,
        response: {
          200: AdminArticleSchema,
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
      const item = await dependencies.articleRepository.update(
        request.params.id,
        request.body,
        actor.userId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "content.article_updated",
        item.id,
      );
      return item;
    },
  );

  async function transition(
    request: {
      params: { id: string };
      id: string;
      ip: string;
      headers: Record<string, string | string[] | undefined>;
      adminPrincipal: AdminPrincipal | null;
    },
    action: "publish" | "archive",
    reply: {
      code: (status: number) => { send: (payload: unknown) => unknown };
    },
  ): Promise<unknown> {
    const actor = principal(request);
    const item =
      action === "publish"
        ? await dependencies.articleRepository.publish(
            request.params.id,
            actor.userId,
          )
        : await dependencies.articleRepository.archive(
            request.params.id,
            actor.userId,
          );
    await audit(
      dependencies,
      request,
      actor,
      `content.article_${action}d`,
      item.id,
    );
    return reply.code(200).send(item);
  }

  app.post<{ Params: Static<typeof IdParams>; Body: Static<typeof EmptyBody> }>(
    "/api/v1/admin/content/articles/:id/publish",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["content.publish"],
      }),
      schema: {
        operationId: "adminPublishArticle",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: EmptyBody,
        response: {
          200: AdminArticleSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => transition(request, "publish", reply),
  );

  app.post<{ Params: Static<typeof IdParams>; Body: Static<typeof EmptyBody> }>(
    "/api/v1/admin/content/articles/:id/archive",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["content.publish"],
      }),
      schema: {
        operationId: "adminArchiveArticle",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: EmptyBody,
        response: {
          200: AdminArticleSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => transition(request, "archive", reply),
  );

  app.post<{ Params: Static<typeof IdParams>; Body: Static<typeof EmptyBody> }>(
    "/api/v1/admin/content/articles/:id/duplicate",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["content.write"],
      }),
      schema: {
        operationId: "adminDuplicateArticle",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: EmptyBody,
        response: {
          201: AdminArticleSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      const item = await dependencies.articleRepository.duplicate(
        request.params.id,
        actor.userId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "content.article_duplicated",
        item.id,
      );
      return reply.code(201).send(item);
    },
  );

  app.delete<{ Params: Static<typeof IdParams> }>(
    "/api/v1/admin/content/articles/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["content.write"],
      }),
      schema: {
        operationId: "adminDeleteArticle",
        summary: "Permanently delete an archived article",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: {
          204: Type.Null(),
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      await dependencies.articleRepository.delete(
        request.params.id,
        actor.userId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "content.article_deleted",
        request.params.id,
      );
      return reply.code(204).send();
    },
  );
}
