import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { AuditRepository } from "../audit/audit-repository.js";
import {
  createAdminGuard,
  type AdminGuardDependencies,
  type AdminPrincipal,
} from "../auth/admin-guard.js";
import { type HomeContentRepository } from "../content/home-content-repository.js";
import { ProblemDetailSchema } from "../http/problem.js";

const HomeSectionKeySchema = Type.Union([
  Type.Literal("hero"),
  Type.Literal("promo_banner"),
  Type.Literal("shop_the_look"),
]);
const HomeHotspotInputSchema = Type.Object(
  {
    productId: Type.String({ minLength: 1, maxLength: 160 }),
    xPercent: Type.Number({ minimum: 0, maximum: 100 }),
    yPercent: Type.Number({ minimum: 0, maximum: 100 }),
    label: Type.Optional(
      Type.Union([Type.String({ minLength: 1, maxLength: 160 }), Type.Null()]),
    ),
    sortOrder: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
const HomeSectionInputSchema = Type.Object(
  {
    sectionKey: HomeSectionKeySchema,
    sortOrder: Type.Integer({ minimum: 0 }),
    isEnabled: Type.Optional(Type.Boolean()),
    payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    mediaAssetId: Type.Optional(
      Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    ),
    mobileMediaAssetId: Type.Optional(
      Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    ),
    hotspots: Type.Optional(
      Type.Array(HomeHotspotInputSchema, { maxItems: 20 }),
    ),
  },
  { additionalProperties: false },
);
const HomeDraftBody = Type.Object(
  {
    sections: Type.Array(HomeSectionInputSchema, { maxItems: 20 }),
    expectedVersion: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { $id: "AdminHomeDraftBody", additionalProperties: false },
);

const HomeMediaSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    publicUrl: Type.String({ format: "uri" }),
    alt: Type.String(),
  },
  { additionalProperties: false },
);
const HomeProductSchema = Type.Object(
  {
    id: Type.String(),
    slug: Type.String(),
    name: Type.String(),
  },
  { additionalProperties: false },
);
const HomeHotspotSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    productId: Type.String(),
    xPercent: Type.Number({ minimum: 0, maximum: 100 }),
    yPercent: Type.Number({ minimum: 0, maximum: 100 }),
    label: Type.Union([Type.String(), Type.Null()]),
    sortOrder: Type.Integer({ minimum: 0 }),
    product: Type.Union([HomeProductSchema, Type.Null()]),
  },
  { additionalProperties: false },
);
const HomeSectionSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    sectionKey: HomeSectionKeySchema,
    sortOrder: Type.Integer({ minimum: 0 }),
    isEnabled: Type.Boolean(),
    payload: Type.Record(Type.String(), Type.Unknown()),
    media: Type.Union([HomeMediaSchema, Type.Null()]),
    mobileMedia: Type.Union([HomeMediaSchema, Type.Null()]),
    hotspots: Type.Array(HomeHotspotSchema),
  },
  { additionalProperties: false },
);
const HomeRevisionSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
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
    sections: Type.Array(HomeSectionSchema),
  },
  { additionalProperties: false },
);
const AdminHomeResponse = Type.Object(
  {
    draft: Type.Union([HomeRevisionSchema, Type.Null()]),
    published: Type.Union([HomeRevisionSchema, Type.Null()]),
  },
  { $id: "AdminHomeContent", additionalProperties: false },
);
const EmptyBody = Type.Object({}, { additionalProperties: false });

type HomeDraftBodyType = Static<typeof HomeDraftBody>;

export interface AdminHomeContentRouteDependencies extends AdminGuardDependencies {
  homeContentRepository: HomeContentRepository;
  auditRepository: AuditRepository;
}

function principal(request: {
  adminPrincipal: AdminPrincipal | null;
}): AdminPrincipal {
  if (!request.adminPrincipal) {
    throw new Error("Admin guard did not set a principal.");
  }
  return request.adminPrincipal;
}

async function audit(
  dependencies: AdminHomeContentRouteDependencies,
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
    resourceType: "home_content",
    resourceId,
    outcome: "success",
    sourceIp: request.ip,
    userAgent: request.headers["user-agent"]?.toString() ?? null,
  });
}

export function registerAdminHomeContentRoutes(
  app: FastifyInstance,
  dependencies: AdminHomeContentRouteDependencies,
): void {
  app.addSchema(HomeDraftBody);
  app.addSchema(AdminHomeResponse);

  app.get(
    "/api/v1/admin/content/home",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["content.read"],
      }),
      schema: {
        operationId: "adminGetHomeContent",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        response: {
          200: AdminHomeResponse,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async (_request, reply) =>
      reply
        .header("cache-control", "no-store")
        .send(await dependencies.homeContentRepository.getAdminHome()),
  );

  app.put<{ Body: HomeDraftBodyType }>(
    "/api/v1/admin/content/home",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["content.write"],
      }),
      schema: {
        operationId: "adminUpdateHomeContent",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        body: HomeDraftBody,
        response: {
          200: HomeRevisionSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      const item = await dependencies.homeContentRepository.updateDraft(
        request.body,
        actor.userId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "content.home_updated",
        item.id,
      );
      return reply.code(200).send(item);
    },
  );

  app.post(
    "/api/v1/admin/content/home/publish",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["content.publish"],
      }),
      schema: {
        operationId: "adminPublishHomeContent",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        body: EmptyBody,
        response: {
          200: HomeRevisionSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      const item = await dependencies.homeContentRepository.publishDraft(
        actor.userId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "content.home_published",
        item.id,
      );
      return reply.code(200).send(item);
    },
  );

  app.post(
    "/api/v1/admin/content/home/archive",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["content.publish"],
      }),
      schema: {
        operationId: "adminArchiveHomeContent",
        tags: ["admin-content"],
        security: [{ bearerAuth: [] }],
        body: EmptyBody,
        response: {
          200: HomeRevisionSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      const item = await dependencies.homeContentRepository.archivePublished(
        actor.userId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "content.home_archived",
        item.id,
      );
      return reply.code(200).send(item);
    },
  );
}
