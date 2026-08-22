import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { ProblemDetailSchema, type ProblemDetail } from "../http/problem.js";
import type {
  ProductListParams,
  CatalogScope,
} from "../catalog/product-repository.js";
import {
  type Product,
  type PaginatedProducts,
  PostgresProductRepository,
} from "../catalog/product-repository.js";
import { type DatabaseConnection } from "../database/connection.js";

const PriceSchema = Type.Object(
  { amountMinor: Type.Integer(), currency: Type.Literal("TND") },
  { additionalProperties: false },
);

const VariantSchema = Type.Object(
  {
    id: Type.String(),
    sku: Type.String(),
    colorId: Type.String(),
    widthCm: Type.Integer({ minimum: 1 }),
    heightCm: Type.Integer({ minimum: 1 }),
    curtainHeader: Type.Optional(Type.String()),
    eyeletColor: Type.Optional(Type.String()),
    lining: Type.Optional(Type.String()),
    blindMountingType: Type.Optional(Type.String()),
    blindControlSide: Type.Optional(Type.String()),
    blindMechanismColor: Type.Optional(Type.String()),
    sizeLabel: Type.Optional(Type.String()),
    cushionContent: Type.Optional(Type.String()),
    cushionClosure: Type.Optional(Type.String()),
    chairPadFastening: Type.Optional(Type.String()),
    accessoryFinish: Type.Optional(Type.String()),
    accessoryMountingType: Type.Optional(Type.String()),
    minLengthCm: Type.Optional(Type.Integer({ minimum: 1 })),
    maxLengthCm: Type.Optional(Type.Integer({ minimum: 1 })),
    diameterMm: Type.Optional(Type.Integer({ minimum: 1 })),
    depthCm: Type.Optional(Type.Integer({ minimum: 1 })),
    seatCount: Type.Optional(Type.Integer({ minimum: 1 })),
    plantHeightCm: Type.Optional(Type.Integer({ minimum: 1 })),
    potDiameterCm: Type.Optional(Type.Integer({ minimum: 1 })),
    plantSize: Type.Optional(Type.String()),
    packQuantity: Type.Optional(Type.Integer({ minimum: 1 })),
    price: PriceSchema,
    compareAtPrice: Type.Optional(PriceSchema),
    availability: Type.String(),
    availableQuantity: Type.Integer({ minimum: 0 }),
    imageUrl: Type.String(),
    secondaryImageUrl: Type.Optional(Type.String()),
    imageIds: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

const ImageSchema = Type.Object(
  {
    id: Type.String(),
    url: Type.String(),
    alt: Type.String(),
    type: Type.Union([
      Type.Literal("front"),
      Type.Literal("lifestyle"),
      Type.Literal("fabric_detail"),
      Type.Literal("header_detail"),
      Type.Literal("mechanism_detail"),
    ]),
    colorId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const ColorSchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    slug: Type.String(),
    family: Type.String(),
    hex: Type.String(),
  },
  { additionalProperties: false },
);

export const ProductSchema = Type.Object(
  {
    id: Type.String(),
    slug: Type.String(),
    name: Type.String(),
    reference: Type.String(),
    category: Type.String(),
    material: Type.String(),
    opacityLevel: Type.Optional(Type.String()),
    sellingMode: Type.String(),
    pattern: Type.Optional(Type.String()),
    blindType: Type.Optional(Type.String()),
    isLargeWidth: Type.Boolean(),
    cushionShape: Type.Optional(Type.String()),
    removableCover: Type.Optional(Type.Boolean()),
    machineWashable: Type.Optional(Type.Boolean()),
    chairPadShape: Type.Optional(Type.String()),
    accessoryType: Type.Optional(Type.String()),
    accessoryMaterial: Type.Optional(Type.String()),
    accessoryCompatibilities: Type.Optional(Type.Array(Type.String())),
    furnitureType: Type.Optional(Type.String()),
    furnitureRooms: Type.Optional(Type.Array(Type.String())),
    furnitureStyle: Type.Optional(Type.String()),
    furnitureAssembly: Type.Optional(Type.String()),
    plantNature: Type.Optional(Type.String()),
    plantType: Type.Optional(Type.String()),
    plantLightNeed: Type.Optional(Type.String()),
    plantCareLevel: Type.Optional(Type.String()),
    petFriendly: Type.Optional(Type.Boolean()),
    potIncluded: Type.Optional(Type.Boolean()),
    shortDescription: Type.String(),
    longDescription: Type.String(),
    imageAlt: Type.String(),
    images: Type.Array(ImageSchema),
    variants: Type.Array(VariantSchema),
    colors: Type.Array(ColorSchema),
    details: Type.Record(Type.String(), Type.Unknown()),
    seo: Type.Object({ title: Type.String(), description: Type.String() }),
    isThermal: Type.Boolean(),
    isNew: Type.Boolean(),
    isBestSeller: Type.Boolean(),
    isFeatured: Type.Boolean(),
    createdAt: Type.String(),
    recommendationScore: Type.Number(),
    isDemo: Type.Boolean(),
  },
  { $id: "Product", additionalProperties: false },
);

const ProductListResponseSchema = Type.Object(
  {
    items: Type.Array(ProductSchema),
    page: Type.Integer(),
    pageSize: Type.Integer(),
    total: Type.Integer(),
    totalPages: Type.Integer(),
    categoryCounts: Type.Optional(
      Type.Record(Type.String(), Type.Integer({ minimum: 0 })),
    ),
  },
  { additionalProperties: false },
);

const ProductsListQuerySchema = Type.Object(
  {
    q: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    page: Type.Optional(Type.Integer({ minimum: 1 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
    sort: Type.Optional(
      Type.Union([
        Type.Literal("recommended"),
        Type.Literal("newest"),
        Type.Literal("best_sellers"),
        Type.Literal("price_asc"),
        Type.Literal("price_desc"),
        Type.Literal("discount"),
      ]),
    ),
    categories: Type.Optional(Type.String()),
    materials: Type.Optional(Type.String()),
    colors: Type.Optional(Type.String()),
    opacityLevels: Type.Optional(Type.String()),
    curtainHeaders: Type.Optional(Type.String()),
    patterns: Type.Optional(Type.String()),
    blindTypes: Type.Optional(Type.String()),
    shapes: Type.Optional(Type.String()),
    cushionContents: Type.Optional(Type.String()),
    chairPadFastenings: Type.Optional(Type.String()),
    accessoryTypes: Type.Optional(Type.String()),
    accessoryFinishes: Type.Optional(Type.String()),
    mountings: Type.Optional(Type.String()),
    controlSides: Type.Optional(Type.String()),
    widths: Type.Optional(Type.String()),
    heights: Type.Optional(Type.String()),
    availability: Type.Optional(Type.String()),
    minPriceMinor: Type.Optional(Type.Integer({ minimum: 0 })),
    maxPriceMinor: Type.Optional(Type.Integer({ minimum: 0 })),
    sellingMode: Type.Optional(Type.String()),
    onlyNew: Type.Optional(Type.Union([Type.String(), Type.Boolean()])),
    onlyBestSellers: Type.Optional(Type.Union([Type.String(), Type.Boolean()])),
    onlyDiscounted: Type.Optional(Type.Union([Type.String(), Type.Boolean()])),
    onlyThermal: Type.Optional(Type.Union([Type.String(), Type.Boolean()])),
    onlyLargeWidth: Type.Optional(Type.Union([Type.String(), Type.Boolean()])),
    ids: Type.Optional(Type.String()),
    plantCareLevels: Type.Optional(Type.String()),
    plantLightNeeds: Type.Optional(Type.String()),
    plantNatures: Type.Optional(Type.String()),
    plantTypes: Type.Optional(Type.String()),
    plantSizes: Type.Optional(Type.String()),
    furnitureTypes: Type.Optional(Type.String()),
    furnitureRooms: Type.Optional(Type.String()),
    furnitureStyles: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const ScopeQuerySchema = Type.Object(
  {
    categories: Type.Optional(Type.String()),
    materials: Type.Optional(Type.String()),
    opacityLevels: Type.Optional(Type.String()),
    curtainHeaders: Type.Optional(Type.String()),
    patterns: Type.Optional(Type.String()),
    blindTypes: Type.Optional(Type.String()),
    shapes: Type.Optional(Type.String()),
    accessoryTypes: Type.Optional(Type.String()),
    furnitureTypes: Type.Optional(Type.String()),
    furnitureRooms: Type.Optional(Type.String()),
    furnitureStyles: Type.Optional(Type.String()),
    plantNatures: Type.Optional(Type.String()),
    plantTypes: Type.Optional(Type.String()),
    plantSizes: Type.Optional(Type.String()),
    sellingMode: Type.Optional(Type.String()),
    onlyThermal: Type.Optional(Type.Union([Type.String(), Type.Boolean()])),
    onlyLargeWidth: Type.Optional(Type.Union([Type.String(), Type.Boolean()])),
  },
  { additionalProperties: false },
);

const ByIdsQuerySchema = Type.Object(
  {
    ids: Type.String(),
  },
  { additionalProperties: false },
);

const RelatedQuerySchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
  },
  { additionalProperties: false },
);

function asStringList(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => asStringList(entry));
  }
  return [];
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function parseCatalogQuery(
  query: Static<typeof ProductsListQuerySchema>,
): ProductListParams {
  const widths = asStringList(query.widths)
    .map((entry) => Number(entry))
    .filter((entry): entry is number => Number.isFinite(entry));
  const heights = asStringList(query.heights)
    .map((entry) => Number(entry))
    .filter((entry): entry is number => Number.isFinite(entry));

  return {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 12,
    sort: query.sort ?? "recommended",
    query: query.q,
    categories: asStringList(query.categories),
    materials: asStringList(query.materials),
    colors: asStringList(query.colors),
    opacityLevels: asStringList(query.opacityLevels),
    curtainHeaders: asStringList(query.curtainHeaders),
    patterns: asStringList(query.patterns),
    blindTypes: asStringList(query.blindTypes),
    shapes: asStringList(query.shapes),
    cushionContents: asStringList(query.cushionContents),
    chairPadFastenings: asStringList(query.chairPadFastenings),
    accessoryTypes: asStringList(query.accessoryTypes),
    accessoryFinishes: asStringList(query.accessoryFinishes),
    mountings: asStringList(query.mountings),
    controlSides: asStringList(query.controlSides),
    widths,
    heights,
    availability: asStringList(query.availability),
    minPriceMinor: query.minPriceMinor,
    maxPriceMinor: query.maxPriceMinor,
    sellingMode: asStringList(query.sellingMode),
    onlyNew: query.onlyNew != null ? asBoolean(query.onlyNew) : undefined,
    onlyBestSellers:
      query.onlyBestSellers != null
        ? asBoolean(query.onlyBestSellers)
        : undefined,
    onlyDiscounted:
      query.onlyDiscounted != null
        ? asBoolean(query.onlyDiscounted)
        : undefined,
    onlyThermal:
      query.onlyThermal != null ? asBoolean(query.onlyThermal) : undefined,
    onlyLargeWidth:
      query.onlyLargeWidth != null
        ? asBoolean(query.onlyLargeWidth)
        : undefined,
    ids: asStringList(query.ids),
    plantCareLevels: asStringList(query.plantCareLevels),
    plantLightNeeds: asStringList(query.plantLightNeeds),
    plantNatures: asStringList(query.plantNatures),
    plantTypes: asStringList(query.plantTypes),
    plantSizes: asStringList(query.plantSizes),
    furnitureTypes: asStringList(query.furnitureTypes),
    furnitureRooms: asStringList(query.furnitureRooms),
    furnitureStyles: asStringList(query.furnitureStyles),
  };
}

function parseScopeQuery(query: Static<typeof ScopeQuerySchema>): Omit<
  CatalogScope,
  "sellingMode"
> & {
  sellingMode?: readonly string[] | undefined;
} {
  return {
    categories: asStringList(query.categories),
    materials: asStringList(query.materials),
    opacityLevels: asStringList(query.opacityLevels),
    curtainHeaders: asStringList(query.curtainHeaders),
    patterns: asStringList(query.patterns),
    blindTypes: asStringList(query.blindTypes),
    shapes: asStringList(query.shapes),
    accessoryTypes: asStringList(query.accessoryTypes),
    furnitureTypes: asStringList(query.furnitureTypes),
    furnitureRooms: asStringList(query.furnitureRooms),
    furnitureStyles: asStringList(query.furnitureStyles),
    plantNatures: asStringList(query.plantNatures),
    plantTypes: asStringList(query.plantTypes),
    plantSizes: asStringList(query.plantSizes),
    sellingMode: asStringList(query.sellingMode),
    onlyThermal:
      query.onlyThermal != null ? asBoolean(query.onlyThermal) : undefined,
    onlyLargeWidth:
      query.onlyLargeWidth != null
        ? asBoolean(query.onlyLargeWidth)
        : undefined,
  };
}

function normalizeByIds(ids: string | undefined): string[] {
  return asStringList(ids);
}

export interface CatalogRouteDependencies {
  database: DatabaseConnection;
}

export function registerCatalogRoutes(
  app: FastifyInstance,
  dependencies: CatalogRouteDependencies,
): void {
  app.addSchema(ProductSchema);
  const productRepository = new PostgresProductRepository(
    dependencies.database.client,
  );

  app.get<{
    Reply: PaginatedProducts;
    Querystring: Static<typeof ProductsListQuerySchema>;
  }>(
    "/api/v1/products",
    {
      schema: {
        operationId: "listProducts",
        summary: "List published products with filters and pagination",
        tags: ["catalog"],
        querystring: ProductsListQuerySchema,
        response: {
          200: ProductListResponseSchema,
          400: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      return await productRepository.listProducts(
        parseCatalogQuery(request.query),
      );
    },
  );

  app.get<{ Querystring: Static<typeof ScopeQuerySchema>; Reply: Product[] }>(
    "/api/v1/products/scope",
    {
      schema: {
        operationId: "listCatalogScopeProducts",
        summary: "List products for catalog scope calculations",
        tags: ["catalog"],
        querystring: ScopeQuerySchema,
        response: {
          200: Type.Array(ProductSchema),
          400: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const parsed = parseScopeQuery(request.query);
      const scope: CatalogScope = {
        categories: parsed.categories,
        materials: parsed.materials,
        opacityLevels: parsed.opacityLevels,
        curtainHeaders: parsed.curtainHeaders,
        patterns: parsed.patterns,
        blindTypes: parsed.blindTypes,
        shapes: parsed.shapes,
        accessoryTypes: parsed.accessoryTypes,
        furnitureTypes: parsed.furnitureTypes,
        furnitureRooms: parsed.furnitureRooms,
        furnitureStyles: parsed.furnitureStyles,
        plantNatures: parsed.plantNatures,
        plantTypes: parsed.plantTypes,
        plantSizes: parsed.plantSizes,
        sellingMode: parsed.sellingMode,
        onlyThermal: parsed.onlyThermal,
        onlyLargeWidth: parsed.onlyLargeWidth,
      };
      return await productRepository.listScope(scope);
    },
  );

  app.get<{
    Querystring: Static<typeof ByIdsQuerySchema>;
    Reply: { items: Product[] };
  }>(
    "/api/v1/products/by-ids",
    {
      schema: {
        operationId: "listProductsByIds",
        summary: "List products by identifiers",
        tags: ["catalog"],
        querystring: ByIdsQuerySchema,
        response: {
          200: Type.Object({ items: Type.Array(ProductSchema) }),
          400: ProblemDetailSchema,
        },
      },
    },
    async (request) => ({
      items: await productRepository.getByIds(
        normalizeByIds(request.query.ids),
      ),
    }),
  );

  app.get<{ Params: { slug: string }; Reply: Product | ProblemDetail }>(
    "/api/v1/products/:slug",
    {
      schema: {
        operationId: "getProductBySlug",
        summary: "Get one product by slug",
        tags: ["catalog"],
        params: Type.Object({ slug: Type.String() }),
        response: {
          200: ProductSchema,
          404: ProblemDetailSchema,
          400: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const product = await productRepository.getBySlug(request.params.slug);
      if (!product) {
        const notFoundProblem: ProblemDetail = {
          type: "https://api.hbs-home.com/problems/product-not-found",
          title: "Product not found",
          status: 404,
          detail: "No published product matches the requested slug.",
          instance: "/api/v1/products/:slug",
          code: "PRODUCT_NOT_FOUND",
          requestId: request.id,
        };
        return reply.status(404).send(notFoundProblem);
      }
      return product;
    },
  );

  app.get<{
    Params: { slug: string };
    Querystring: Static<typeof RelatedQuerySchema>;
    Reply: Product[];
  }>(
    "/api/v1/products/:slug/related",
    {
      schema: {
        operationId: "getRelatedProducts",
        summary: "List related products for the current slug",
        tags: ["catalog"],
        params: Type.Object({ slug: Type.String() }),
        querystring: RelatedQuerySchema,
        response: {
          200: Type.Array(ProductSchema),
          400: ProblemDetailSchema,
        },
      },
    },
    async (request) =>
      await productRepository.listRelated(
        request.params.slug,
        request.query.limit ?? 4,
      ),
  );
}
