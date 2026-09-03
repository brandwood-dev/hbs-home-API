import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { HomeContentRepository } from "../content/home-content-repository.js";
import { ProblemDetailSchema } from "../http/problem.js";

const HomeMediaSchema = Type.Object(
  {
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
    productId: Type.String(),
    xPercent: Type.Number({ minimum: 0, maximum: 100 }),
    yPercent: Type.Number({ minimum: 0, maximum: 100 }),
    label: Type.Union([Type.String(), Type.Null()]),
    sortOrder: Type.Integer({ minimum: 0 }),
    product: Type.Union([HomeProductSchema, Type.Null()]),
  },
  { additionalProperties: false },
);
const HomePromoBannerMessageSchema = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 120 }),
    label: Type.Optional(Type.String({ maxLength: 80 })),
    text: Type.String({ minLength: 1, maxLength: 240 }),
    href: Type.Optional(Type.String({ maxLength: 2048 })),
    isEnabled: Type.Boolean(),
    sortOrder: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
const HomePromoBannerPayloadSchema = Type.Object(
  {
    messages: Type.Array(HomePromoBannerMessageSchema, { maxItems: 20 }),
  },
  { additionalProperties: false },
);
const HomeSectionSchema = Type.Object(
  {
    sectionKey: Type.Union([
      Type.Literal("hero"),
      Type.Literal("promo_banner"),
      Type.Literal("shop_the_look"),
    ]),
    sortOrder: Type.Integer({ minimum: 0 }),
    isEnabled: Type.Boolean(),
    payload: Type.Union([
      HomePromoBannerPayloadSchema,
      Type.Record(Type.String(), Type.Unknown()),
    ]),
    media: Type.Union([HomeMediaSchema, Type.Null()]),
    mobileMedia: Type.Union([HomeMediaSchema, Type.Null()]),
    hotspots: Type.Array(HomeHotspotSchema),
  },
  { additionalProperties: false },
);
const PublicHomeSchema = Type.Object(
  {
    version: Type.Integer({ minimum: 1 }),
    publishedAt: Type.String({ format: "date-time" }),
    sections: Type.Array(HomeSectionSchema),
  },
  { $id: "PublicHomeContent", additionalProperties: false },
);

const PUBLIC_HOME_CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const PUBLIC_HOME_NOT_FOUND_CACHE_CONTROL = "public, max-age=30";

export interface HomeContentRouteDependencies {
  homeContentRepository: HomeContentRepository;
}

export function registerHomeContentRoutes(
  app: FastifyInstance,
  dependencies: HomeContentRouteDependencies,
): void {
  app.addSchema(PublicHomeSchema);

  app.get(
    "/api/v1/content/home",
    {
      schema: {
        operationId: "getPublishedHomeContent",
        tags: ["content"],
        response: {
          200: PublicHomeSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const content =
        await dependencies.homeContentRepository.getPublishedHome();
      if (!content) {
        return reply
          .header("cache-control", PUBLIC_HOME_NOT_FOUND_CACHE_CONTROL)
          .code(404)
          .send({
            type: "https://hbs-home.com/problems/home-content-not-found",
            title: "Published home content not found",
            status: 404,
            code: "HOME_CONTENT_NOT_FOUND",
            detail: "The homepage has no published configuration.",
            instance: request.url,
            requestId: request.id,
          });
      }
      return reply
        .header("cache-control", PUBLIC_HOME_CACHE_CONTROL)
        .code(200)
        .send(content);
    },
  );
}
