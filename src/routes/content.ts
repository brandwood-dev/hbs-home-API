import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { AdminContentRepository } from "../content/admin-content-repository.js";
import { ProblemDetailSchema } from "../http/problem.js";

const SlugParams = Type.Object(
  {
    slug: Type.String({
      minLength: 1,
      maxLength: 160,
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
    }),
  },
  { additionalProperties: false },
);

const PublicEditorialPageSchema = Type.Object(
  {
    slug: Type.String(),
    title: Type.String(),
    body: Type.String(),
    seoTitle: Type.Union([Type.String(), Type.Null()]),
    seoDescription: Type.Union([Type.String(), Type.Null()]),
    version: Type.Integer({ minimum: 1 }),
    publishedAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
    blocks: Type.Array(
      Type.Object(
        {
          sortOrder: Type.Integer({ minimum: 0 }),
          blockType: Type.String(),
          payload: Type.Record(Type.String(), Type.Unknown()),
          media: Type.Union([
            Type.Null(),
            Type.Object(
              { publicUrl: Type.String({ format: "uri" }), alt: Type.String() },
              { additionalProperties: false },
            ),
          ]),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { $id: "PublicEditorialPage", additionalProperties: false },
);

const PUBLIC_PAGE_CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const PUBLIC_PAGE_NOT_FOUND_CACHE_CONTROL = "public, max-age=30";

function publicPage(
  page: NonNullable<
    Awaited<ReturnType<AdminContentRepository["getPublishedPageBySlug"]>>
  >,
) {
  return {
    slug: page.slug,
    title: page.title,
    body: page.body,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    version: page.version,
    publishedAt: page.publishedAt ?? page.updatedAt,
    updatedAt: page.updatedAt,
    blocks: page.blocks.map((block) => ({
      sortOrder: block.sortOrder,
      blockType: block.blockType,
      payload: block.payload,
      media: block.media
        ? { publicUrl: block.media.publicUrl, alt: block.media.alt }
        : null,
    })),
  };
}

export interface ContentRouteDependencies {
  adminContentRepository: AdminContentRepository;
}

export function registerContentRoutes(
  app: FastifyInstance,
  dependencies: ContentRouteDependencies,
): void {
  app.addSchema(PublicEditorialPageSchema);
  app.get<{ Params: Static<typeof SlugParams> }>(
    "/api/v1/content/pages/:slug",
    {
      schema: {
        operationId: "getPublishedEditorialPage",
        tags: ["content"],
        params: SlugParams,
        response: {
          200: PublicEditorialPageSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const page =
        await dependencies.adminContentRepository.getPublishedPageBySlug(
          request.params.slug,
        );
      if (!page) {
        return reply
          .header("cache-control", PUBLIC_PAGE_NOT_FOUND_CACHE_CONTROL)
          .code(404)
          .send({
            type: "https://hbs-home.com/problems/editorial-page-not-found",
            title: "Editorial page not found",
            status: 404,
            code: "EDITORIAL_PAGE_NOT_FOUND",
            detail: "The requested published page does not exist.",
            instance: request.url,
            requestId: request.id,
          });
      }
      return reply
        .header("cache-control", PUBLIC_PAGE_CACHE_CONTROL)
        .code(200)
        .send(publicPage(page));
    },
  );
}
