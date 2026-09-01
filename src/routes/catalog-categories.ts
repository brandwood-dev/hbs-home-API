import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { ProblemDetailSchema, type ProblemDetail } from "../http/problem.js";
import {
  type PublicCategory,
  PostgresPublicCategoryRepository,
} from "../catalog/category-repository.js";
import type { DatabaseConnection } from "../database/connection.js";

const PublicCategorySchema = Type.Recursive(
  (category) =>
    Type.Object(
      {
        slug: Type.String(),
        name: Type.String(),
        description: Type.Union([Type.String(), Type.Null()]),
        parentSlug: Type.Union([Type.String(), Type.Null()]),
        path: Type.String(),
        imageUrl: Type.Union([Type.String(), Type.Null()]),
        seoTitle: Type.Union([Type.String(), Type.Null()]),
        seoDescription: Type.Union([Type.String(), Type.Null()]),
        latestProduct: Type.Union([
          Type.Object(
            {
              slug: Type.String(),
              name: Type.String(),
              imageUrl: Type.String({ minLength: 1 }),
              imageAlt: Type.String({ minLength: 1 }),
              createdAt: Type.String({ format: "date-time" }),
            },
            { additionalProperties: false },
          ),
          Type.Null(),
        ]),
        attributes: Type.Array(
          Type.Object(
            {
              key: Type.String(),
              name: Type.String(),
              valueType: Type.String(),
              isRequired: Type.Boolean(),
              sortOrder: Type.Integer({ minimum: 0 }),
              options: Type.Array(
                Type.Object(
                  {
                    value: Type.String(),
                    label: Type.String(),
                    sortOrder: Type.Integer({ minimum: 0 }),
                    hex: Type.Union([Type.String(), Type.Null()]),
                    family: Type.Union([Type.String(), Type.Null()]),
                  },
                  { additionalProperties: false },
                ),
              ),
            },
            { additionalProperties: false },
          ),
        ),
        children: Type.Array(category),
      },
      { additionalProperties: false },
    ),
  { $id: "PublicCategory" },
);

const ListCategoriesQuerySchema = Type.Object(
  {
    navigation: Type.Optional(
      Type.Union([Type.Literal("true"), Type.Literal("false")]),
    ),
  },
  { additionalProperties: false },
);

const CategoryParamsSchema = Type.Object({
  slug: Type.String({ minLength: 2, maxLength: 160 }),
});

export interface CatalogCategoryRouteDependencies {
  database: DatabaseConnection;
}

function isNavigationQuery(value: unknown): boolean {
  return value === true || value === "true";
}

function notFound(requestId: string, instance: string): ProblemDetail {
  return {
    type: "https://api.hbs-home.com/problems/category-not-found",
    title: "Category not found",
    status: 404,
    detail: "No active category matches the requested slug.",
    instance,
    code: "CATEGORY_NOT_FOUND",
    requestId,
  };
}

export function registerCatalogCategoryRoutes(
  app: FastifyInstance,
  dependencies: CatalogCategoryRouteDependencies,
): void {
  app.addSchema(PublicCategorySchema);
  const repository = new PostgresPublicCategoryRepository(
    dependencies.database.client,
  );

  app.get<{
    Querystring: Static<typeof ListCategoriesQuerySchema>;
    Reply: readonly PublicCategory[];
  }>(
    "/api/v1/catalog/categories",
    {
      schema: {
        operationId: "listPublicCatalogCategories",
        summary: "List active catalog categories and their public taxonomy",
        tags: ["catalog"],
        querystring: ListCategoriesQuerySchema,
        response: { 200: Type.Array(PublicCategorySchema) },
      },
    },
    async (request, reply) => {
      reply.header(
        "cache-control",
        "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      );
      return await repository.listCategories({
        navigationOnly: isNavigationQuery(request.query.navigation),
      });
    },
  );

  app.get<{
    Params: Static<typeof CategoryParamsSchema>;
    Reply: PublicCategory | ProblemDetail;
  }>(
    "/api/v1/catalog/categories/:slug",
    {
      schema: {
        operationId: "getPublicCatalogCategory",
        summary: "Get one active catalog category by slug",
        tags: ["catalog"],
        params: CategoryParamsSchema,
        response: {
          200: PublicCategorySchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const category = await repository.getCategory(request.params.slug);
      if (!category) {
        return reply
          .status(404)
          .send(notFound(request.id, "/api/v1/catalog/categories/:slug"));
      }
      reply.header(
        "cache-control",
        "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      );
      return category;
    },
  );
}
