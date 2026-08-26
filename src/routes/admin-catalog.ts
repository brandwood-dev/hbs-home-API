import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { AuditRepository } from "../audit/audit-repository.js";
import {
  createAdminGuard,
  type AdminGuardDependencies,
  type AdminPrincipal,
} from "../auth/admin-guard.js";
import type {
  AdminCatalogRepository,
  AttributeInput,
  CategoryInput,
  ProductInput,
  ProductPatch,
  VariantInput,
  VariantPatch,
} from "../catalog/admin-catalog-repository.js";
import type { AdminContentRepository } from "../content/admin-content-repository.js";
import { ProblemDetailSchema } from "../http/problem.js";
import {
  CATEGORY_IMAGE_MAX_BYTES,
  type CategoryImageInputMime,
  type CategoryMediaStorage,
} from "../media/category-media-storage.js";

const IdParams = Type.Object(
  { id: Type.String({ minLength: 1, maxLength: 160 }) },
  { additionalProperties: false },
);
const ProductVariantParams = Type.Object(
  {
    productId: Type.String({ minLength: 1, maxLength: 160 }),
    variantId: Type.String({ minLength: 1, maxLength: 160 }),
  },
  { additionalProperties: false },
);
const Status = Type.Union([
  Type.Literal("draft"),
  Type.Literal("active"),
  Type.Literal("archived"),
]);
const NullableString = Type.Union([Type.String(), Type.Null()]);
const CategoryImageUrl = Type.Union([
  Type.String({ minLength: 1, maxLength: 2048 }),
  Type.Null(),
]);
const CategorySeoTitle = Type.Union([
  Type.String({ minLength: 1, maxLength: 160 }),
  Type.Null(),
]);
const CategorySeoDescription = Type.Union([
  Type.String({ minLength: 1, maxLength: 320 }),
  Type.Null(),
]);
const AttributeFamily = Type.Union([
  Type.String({ minLength: 1, maxLength: 80 }),
  Type.Null(),
]);

const CategorySchema = Type.Object(
  {
    id: Type.String(),
    slug: Type.String(),
    name: Type.String(),
    description: NullableString,
    parentId: NullableString,
    status: Status,
    sortOrder: Type.Integer(),
    imageUrl: CategoryImageUrl,
    imageMediaAssetId: NullableString,
    seoTitle: CategorySeoTitle,
    seoDescription: CategorySeoDescription,
    showInNavigation: Type.Boolean(),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { $id: "AdminCategory", additionalProperties: false },
);
const AttributeOptionSchema = Type.Object(
  {
    id: Type.String(),
    value: Type.String(),
    label: Type.String(),
    sortOrder: Type.Integer(),
    hex: Type.Union([
      Type.String({ pattern: "^#[0-9A-Fa-f]{6}$" }),
      Type.Null(),
    ]),
    family: AttributeFamily,
    isActive: Type.Boolean(),
  },
  { $id: "AdminAttributeOption", additionalProperties: false },
);
const AttributeSchema = Type.Object(
  {
    id: Type.String(),
    key: Type.String(),
    name: Type.String(),
    valueType: Type.Union([
      Type.Literal("text"),
      Type.Literal("number"),
      Type.Literal("boolean"),
      Type.Literal("select"),
      Type.Literal("color"),
      Type.Literal("dimension"),
    ]),
    isFilterable: Type.Boolean(),
    isRequired: Type.Boolean(),
    status: Status,
    isVariantAxis: Type.Boolean(),
    sortOrder: Type.Integer({ minimum: 0 }),
    isSystem: Type.Boolean(),
    categorySlugs: Type.Array(Type.String({ minLength: 1, maxLength: 160 })),
    options: Type.Array(AttributeOptionSchema),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { $id: "AdminAttribute", additionalProperties: false },
);
const VariantSchema = Type.Object(
  {
    id: Type.String(),
    productId: Type.String(),
    sku: Type.String(),
    title: NullableString,
    priceAmountMinor: Type.Integer({ minimum: 0 }),
    compareAtPriceAmountMinor: Type.Union([
      Type.Integer({ minimum: 0 }),
      Type.Null(),
    ]),
    currency: Type.Literal("TND"),
    status: Status,
    options: Type.Record(Type.String(), Type.Unknown()),
    payload: Type.Record(Type.String(), Type.Unknown()),
    isDefault: Type.Boolean(),
    sortOrder: Type.Integer(),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { $id: "AdminProductVariant", additionalProperties: false },
);
const ProductMediaSchema = Type.Object(
  {
    id: Type.String(),
    productId: Type.String(),
    variantId: NullableString,
    storagePath: Type.String(),
    publicUrl: NullableString,
    alt: Type.String(),
    mediaType: Type.Union([
      Type.Literal("front"),
      Type.Literal("lifestyle"),
      Type.Literal("fabric_detail"),
      Type.Literal("header_detail"),
      Type.Literal("mechanism_detail"),
    ]),
    status: Status,
    isPrimary: Type.Boolean(),
    sortOrder: Type.Integer(),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { $id: "AdminProductMedia", additionalProperties: false },
);
const ProductSchema = Type.Object(
  {
    id: Type.String(),
    slug: Type.String(),
    name: Type.String(),
    reference: Type.String(),
    shortDescription: NullableString,
    longDescription: NullableString,
    imageAlt: NullableString,
    status: Status,
    categoryId: NullableString,
    categorySlug: NullableString,
    material: Type.String(),
    sellingMode: Type.String(),
    isPublished: Type.Boolean(),
    publishedAt: NullableString,
    archivedAt: NullableString,
    version: Type.Integer(),
    isDemo: Type.Boolean(),
    attributes: Type.Record(Type.String(), Type.Unknown()),
    media: Type.Array(ProductMediaSchema),
    variants: Type.Array(VariantSchema),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { $id: "AdminProduct", additionalProperties: false },
);
const CategoriesResponse = Type.Object(
  { items: Type.Array(CategorySchema) },
  { $id: "AdminCategoriesResponse", additionalProperties: false },
);
const CategoryImageUploadSchema = Type.Object(
  {
    mediaAssetId: Type.String({ format: "uuid" }),
    storagePath: Type.String(),
    publicUrl: Type.String({ format: "uri" }),
    mimeType: Type.Literal("image/webp"),
    width: Type.Integer({ minimum: 1 }),
    height: Type.Integer({ minimum: 1 }),
  },
  { $id: "AdminCategoryImageUpload", additionalProperties: false },
);
const AttributesResponse = Type.Object(
  { items: Type.Array(AttributeSchema) },
  { $id: "AdminAttributesResponse", additionalProperties: false },
);
const ProductsResponse = Type.Object(
  {
    items: Type.Array(ProductSchema),
    total: Type.Integer(),
    limit: Type.Integer(),
    offset: Type.Integer(),
  },
  { $id: "AdminProductsResponse", additionalProperties: false },
);

const CategoryBody = Type.Object(
  {
    slug: Type.String({
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      minLength: 2,
      maxLength: 160,
    }),
    name: Type.String({ minLength: 2, maxLength: 160 }),
    description: Type.Optional(NullableString),
    parentId: Type.Optional(NullableString),
    status: Type.Optional(Status),
    sortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
    imageUrl: Type.Optional(CategoryImageUrl),
    imageMediaAssetId: Type.Optional(
      Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    ),
    seoTitle: Type.Optional(CategorySeoTitle),
    seoDescription: Type.Optional(CategorySeoDescription),
    showInNavigation: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
const CategoryPatchBody = Type.Partial(CategoryBody);
const CategoryReorderBody = Type.Object(
  {
    direction: Type.Union([Type.Literal("up"), Type.Literal("down")]),
  },
  { additionalProperties: false },
);
const AttributeOptionBody = Type.Object(
  {
    value: Type.String({ minLength: 1, maxLength: 160 }),
    label: Type.String({ minLength: 1, maxLength: 160 }),
    sortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
    hex: Type.Optional(
      Type.Union([Type.String({ pattern: "^#[0-9A-Fa-f]{6}$" }), Type.Null()]),
    ),
    family: Type.Optional(AttributeFamily),
    isActive: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
const AttributeBody = Type.Object(
  {
    key: Type.String({ pattern: "^[a-z][a-z0-9_]{1,63}$" }),
    name: Type.String({ minLength: 2, maxLength: 160 }),
    valueType: Type.Union([
      Type.Literal("text"),
      Type.Literal("number"),
      Type.Literal("boolean"),
      Type.Literal("select"),
      Type.Literal("color"),
      Type.Literal("dimension"),
    ]),
    isFilterable: Type.Optional(Type.Boolean()),
    isRequired: Type.Optional(Type.Boolean()),
    status: Type.Optional(Status),
    isVariantAxis: Type.Optional(Type.Boolean()),
    sortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
    isSystem: Type.Optional(Type.Boolean()),
    categorySlugs: Type.Optional(
      Type.Array(Type.String({ minLength: 1, maxLength: 160 })),
    ),
    options: Type.Optional(Type.Array(AttributeOptionBody)),
  },
  { additionalProperties: false },
);
const AttributePatchBody = Type.Partial(AttributeBody);
const ProductBody = Type.Object(
  {
    slug: Type.String({
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      minLength: 2,
      maxLength: 160,
    }),
    name: Type.String({ minLength: 2, maxLength: 240 }),
    reference: Type.String({ minLength: 2, maxLength: 120 }),
    categoryId: Type.String({ minLength: 1, maxLength: 160 }),
    material: Type.String({ minLength: 1, maxLength: 120 }),
    sellingMode: Type.String({ minLength: 1, maxLength: 80 }),
    shortDescription: Type.Optional(NullableString),
    longDescription: Type.Optional(NullableString),
    imageAlt: Type.Optional(NullableString),
    isDemo: Type.Optional(Type.Boolean()),
    isLargeWidth: Type.Optional(Type.Boolean()),
    isNew: Type.Optional(Type.Boolean()),
    isBestSeller: Type.Optional(Type.Boolean()),
    isFeatured: Type.Optional(Type.Boolean()),
    isThermal: Type.Optional(Type.Boolean()),
    recommendationScore: Type.Optional(Type.Number()),
    attributes: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);
const ProductPatchBody = Type.Partial(
  Type.Object(
    {
      ...ProductBody.properties,
      expectedVersion: Type.Optional(Type.Integer({ minimum: 1 })),
    },
    { additionalProperties: false },
  ),
);
const VariantBody = Type.Object(
  {
    sku: Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$" }),
    title: Type.Optional(NullableString),
    priceAmountMinor: Type.Integer({ minimum: 0 }),
    compareAtPriceAmountMinor: Type.Optional(
      Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    ),
    status: Type.Optional(Status),
    options: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    isDefault: Type.Optional(Type.Boolean()),
    sortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);
const VariantPatchBody = Type.Partial(
  Type.Object(
    {
      ...VariantBody.properties,
      expectedVersion: Type.Optional(Type.Integer({ minimum: 1 })),
    },
    { additionalProperties: false },
  ),
);
const ProductListQuery = Type.Object(
  {
    status: Type.Optional(Status),
    q: Type.Optional(Type.String({ maxLength: 120 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    offset: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);
const EmptyBody = Type.Optional(
  Type.Object({}, { additionalProperties: false }),
);

type CategoryBodyType = Static<typeof CategoryBody>;
type AttributeBodyType = Static<typeof AttributeBody>;
type ProductBodyType = Static<typeof ProductBody>;
type ProductPatchBodyType = Static<typeof ProductPatchBody>;
type VariantBodyType = Static<typeof VariantBody>;
type VariantPatchBodyType = Static<typeof VariantPatchBody>;

export interface AdminCatalogRouteDependencies extends AdminGuardDependencies {
  adminCatalogRepository: AdminCatalogRepository;
  adminContentRepository: AdminContentRepository;
  categoryMediaStorage: CategoryMediaStorage | null;
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
  dependencies: AdminCatalogRouteDependencies,
  request: {
    id: string;
    ip: string;
    headers: Record<string, string | string[] | undefined>;
  },
  actor: AdminPrincipal,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
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
    metadata,
  });
}

function categoryBody(input: CategoryBodyType): CategoryInput {
  return input;
}
function attributeBody(input: AttributeBodyType): AttributeInput {
  return input;
}
function productBody(input: ProductBodyType): ProductInput {
  return input;
}
function productPatch(input: ProductPatchBodyType): ProductPatch {
  return input;
}
function variantBody(input: VariantBodyType): VariantInput {
  return input;
}
function variantPatch(input: VariantPatchBodyType): VariantPatch {
  return input;
}

function imageHeader(
  value: string | string[] | undefined,
  fallback: string,
  maxLength: number,
): string {
  const encodedCandidate = (Array.isArray(value) ? value[0] : value)?.trim();
  if (!encodedCandidate) return fallback;
  let candidate = encodedCandidate;
  try {
    candidate = decodeURIComponent(encodedCandidate);
  } catch {
    // Keep the raw value when a legacy client sends a literal '%' character.
  }
  const normalized = Array.from(candidate)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    })
    .join("")
    .trim();
  return Array.from(normalized).slice(0, maxLength).join("") || fallback;
}

function imageContentType(
  value: string | undefined,
): CategoryImageInputMime | null {
  if (
    value === "image/jpeg" ||
    value === "image/png" ||
    value === "image/webp"
  ) {
    return value;
  }
  return null;
}

export function registerAdminCatalogRoutes(
  app: FastifyInstance,
  dependencies: AdminCatalogRouteDependencies,
): void {
  for (const schema of [
    CategorySchema,
    AttributeOptionSchema,
    AttributeSchema,
    VariantSchema,
    ProductMediaSchema,
    ProductSchema,
    CategoriesResponse,
    AttributesResponse,
    ProductsResponse,
    CategoryImageUploadSchema,
  ])
    app.addSchema(schema);

  app.get(
    "/api/v1/admin/categories",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["categories.read"],
      }),
      schema: {
        operationId: "adminListCategories",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        response: {
          200: CategoriesResponse,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async () => ({
      items: await dependencies.adminCatalogRepository.listCategories(),
    }),
  );

  app.post<{ Body: Buffer }>(
    "/api/v1/admin/categories/image",
    {
      bodyLimit: CATEGORY_IMAGE_MAX_BYTES,
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["categories.write"],
      }),
      schema: {
        operationId: "adminUploadCategoryImage",
        tags: ["admin-catalog"],
        summary: "Upload and convert a category image",
        description:
          "Accepts a JPEG, PNG or WebP binary payload. The API converts it to WebP before storing it.",
        consumes: ["image/jpeg", "image/png", "image/webp"],
        // `contentEncoding` documents the binary payload while leaving runtime
        // validation to the content-type parser and image decoder below.
        body: { contentEncoding: "binary" },
        security: [{ bearerAuth: [] }],
        response: {
          201: CategoryImageUploadSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          413: ProblemDetailSchema,
          503: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      if (!dependencies.categoryMediaStorage) {
        return reply.status(503).send({
          type: "https://api.hbs-home.com/problems/media-storage-unavailable",
          title: "Media storage unavailable",
          status: 503,
          detail:
            "Category image uploads are not configured on this environment.",
          instance: request.url,
          code: "MEDIA_STORAGE_NOT_CONFIGURED",
          requestId: request.id,
        });
      }
      const contentType = imageContentType(
        request.headers["content-type"]?.toString().split(";", 1)[0],
      );
      if (!contentType) {
        return reply.status(400).send({
          type: "https://api.hbs-home.com/problems/invalid-media",
          title: "Invalid category image",
          status: 400,
          detail: "Use a JPEG, PNG or WebP image.",
          instance: request.url,
          code: "MEDIA_TYPE_NOT_ALLOWED",
          requestId: request.id,
        });
      }
      const upload = await dependencies.categoryMediaStorage.upload({
        bytes: request.body,
        contentType,
      });
      const name = imageHeader(
        request.headers["x-image-name"],
        "category-image",
        240,
      );
      const alt = imageHeader(request.headers["x-image-alt"], name, 240);
      const asset = await dependencies.adminContentRepository.createMedia(
        {
          storagePath: upload.storagePath,
          publicUrl: upload.publicUrl,
          name,
          alt,
          width: upload.width,
          height: upload.height,
          mimeType: upload.mimeType,
          status: "active",
          usage: "catalog.category",
        },
        actor.userId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "catalog.category_image_uploaded",
        "media",
        asset.id,
        { storagePath: upload.storagePath, mimeType: upload.mimeType },
      );
      return reply.code(201).send({
        mediaAssetId: asset.id,
        storagePath: asset.storagePath,
        publicUrl: asset.publicUrl,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
      });
    },
  );
  app.post<{ Body: CategoryBodyType }>(
    "/api/v1/admin/categories",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["categories.write"],
      }),
      schema: {
        operationId: "adminCreateCategory",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        body: CategoryBody,
        response: {
          201: CategorySchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      const item = await dependencies.adminCatalogRepository.createCategory(
        categoryBody(request.body),
      );
      await audit(
        dependencies,
        request,
        actor,
        "catalog.category_created",
        "category",
        item.id,
      );
      return reply.code(201).send(item);
    },
  );
  app.patch<{
    Params: Static<typeof IdParams>;
    Body: Static<typeof CategoryPatchBody>;
  }>(
    "/api/v1/admin/categories/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["categories.write"],
      }),
      schema: {
        operationId: "adminUpdateCategory",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: CategoryPatchBody,
        response: {
          200: CategorySchema,
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
      const item = await dependencies.adminCatalogRepository.updateCategory(
        request.params.id,
        request.body,
      );
      await audit(
        dependencies,
        request,
        actor,
        "catalog.category_updated",
        "category",
        item.id,
      );
      return reply.type("application/json").send(item);
    },
  );
  app.post<{
    Params: Static<typeof IdParams>;
    Body: Static<typeof CategoryReorderBody>;
  }>(
    "/api/v1/admin/categories/:id/reorder",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["categories.write"],
      }),
      schema: {
        operationId: "adminReorderCategory",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: CategoryReorderBody,
        response: {
          200: CategorySchema,
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
      const item = await dependencies.adminCatalogRepository.reorderCategory(
        request.params.id,
        request.body.direction,
      );
      await audit(
        dependencies,
        request,
        actor,
        "catalog.category_reordered",
        "category",
        item.id,
        { direction: request.body.direction },
      );
      return reply.type("application/json").send(item);
    },
  );

  app.get(
    "/api/v1/admin/attributes",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["categories.read"],
      }),
      schema: {
        operationId: "adminListAttributes",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        response: {
          200: AttributesResponse,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async () => ({
      items: await dependencies.adminCatalogRepository.listAttributes(),
    }),
  );
  app.post<{ Body: AttributeBodyType }>(
    "/api/v1/admin/attributes",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["categories.write"],
      }),
      schema: {
        operationId: "adminCreateAttribute",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        body: AttributeBody,
        response: {
          201: AttributeSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      const item = await dependencies.adminCatalogRepository.createAttribute(
        attributeBody(request.body),
      );
      await audit(
        dependencies,
        request,
        actor,
        "catalog.attribute_created",
        "attribute",
        item.id,
      );
      return reply.code(201).send(item);
    },
  );
  app.patch<{
    Params: Static<typeof IdParams>;
    Body: Static<typeof AttributePatchBody>;
  }>(
    "/api/v1/admin/attributes/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["categories.write"],
      }),
      schema: {
        operationId: "adminUpdateAttribute",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: AttributePatchBody,
        response: {
          200: AttributeSchema,
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
      const item = await dependencies.adminCatalogRepository.updateAttribute(
        request.params.id,
        request.body,
      );
      await audit(
        dependencies,
        request,
        actor,
        "catalog.attribute_updated",
        "attribute",
        item.id,
      );
      return reply.type("application/json").send(item);
    },
  );

  app.get<{ Querystring: Static<typeof ProductListQuery> }>(
    "/api/v1/admin/products",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["products.read"],
      }),
      schema: {
        operationId: "adminListProducts",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        querystring: ProductListQuery,
        response: {
          200: ProductsResponse,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const limit = request.query.limit ?? 25;
      const offset = request.query.offset ?? 0;
      const result = await dependencies.adminCatalogRepository.listProducts({
        limit,
        offset,
        ...(request.query.status === undefined
          ? {}
          : { status: request.query.status }),
        ...(request.query.q === undefined ? {} : { query: request.query.q }),
      });
      return { ...result, limit, offset };
    },
  );
  app.post<{ Body: ProductBodyType }>(
    "/api/v1/admin/products",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["products.write"],
      }),
      schema: {
        operationId: "adminCreateProduct",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        body: ProductBody,
        response: {
          201: ProductSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          409: ProblemDetailSchema,
          422: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      const item = await dependencies.adminCatalogRepository.createProduct(
        productBody(request.body),
      );
      await audit(
        dependencies,
        request,
        actor,
        "catalog.product_created",
        "product",
        item.id,
      );
      return reply.code(201).send(item);
    },
  );
  app.get<{ Params: Static<typeof IdParams> }>(
    "/api/v1/admin/products/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["products.read"],
      }),
      schema: {
        operationId: "adminGetProduct",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: {
          200: ProductSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) =>
      dependencies.adminCatalogRepository.getProduct(request.params.id),
  );
  app.patch<{ Params: Static<typeof IdParams>; Body: ProductPatchBodyType }>(
    "/api/v1/admin/products/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["products.write"],
      }),
      schema: {
        operationId: "adminUpdateProduct",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: ProductPatchBody,
        response: {
          200: ProductSchema,
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
      const item = await dependencies.adminCatalogRepository.updateProduct(
        request.params.id,
        productPatch(request.body),
      );
      await audit(
        dependencies,
        request,
        actor,
        "catalog.product_updated",
        "product",
        item.id,
        { version: item.version },
      );
      return reply.type("application/json").send(item);
    },
  );
  app.post<{ Params: Static<typeof IdParams>; Body: Static<typeof EmptyBody> }>(
    "/api/v1/admin/products/:id/publish",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["products.publish"],
      }),
      schema: {
        operationId: "adminPublishProduct",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: EmptyBody,
        response: {
          200: ProductSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          422: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const item = await dependencies.adminCatalogRepository.publishProduct(
        request.params.id,
      );
      await audit(
        dependencies,
        request,
        actor,
        "catalog.product_published",
        "product",
        item.id,
      );
      return item;
    },
  );
  app.post<{ Params: Static<typeof IdParams>; Body: Static<typeof EmptyBody> }>(
    "/api/v1/admin/products/:id/archive",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["products.publish"],
      }),
      schema: {
        operationId: "adminArchiveProduct",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: EmptyBody,
        response: {
          200: ProductSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const item = await dependencies.adminCatalogRepository.archiveProduct(
        request.params.id,
      );
      await audit(
        dependencies,
        request,
        actor,
        "catalog.product_archived",
        "product",
        item.id,
      );
      return item;
    },
  );

  app.post<{ Params: Static<typeof IdParams>; Body: VariantBodyType }>(
    "/api/v1/admin/products/:id/variants",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["products.write"],
      }),
      schema: {
        operationId: "adminCreateVariant",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: VariantBody,
        response: {
          201: ProductSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
          422: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = principal(request);
      const result = await dependencies.adminCatalogRepository.createVariant(
        request.params.id,
        variantBody(request.body),
      );
      await audit(
        dependencies,
        request,
        actor,
        "catalog.variant_created",
        "product_variant",
        result.variantId,
        { productId: request.params.id },
      );
      return reply.code(201).send(result.product);
    },
  );
  app.patch<{
    Params: Static<typeof ProductVariantParams>;
    Body: VariantPatchBodyType;
  }>(
    "/api/v1/admin/products/:productId/variants/:variantId",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["products.write"],
      }),
      schema: {
        operationId: "adminUpdateVariant",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        params: ProductVariantParams,
        body: VariantPatchBody,
        response: {
          200: ProductSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
          422: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const item = await dependencies.adminCatalogRepository.updateVariant(
        request.params.productId,
        request.params.variantId,
        variantPatch(request.body),
      );
      await audit(
        dependencies,
        request,
        actor,
        "catalog.variant_updated",
        "product_variant",
        request.params.variantId,
      );
      return item;
    },
  );
  app.post<{
    Params: Static<typeof ProductVariantParams>;
    Body: Static<typeof EmptyBody>;
  }>(
    "/api/v1/admin/products/:productId/variants/:variantId/archive",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["products.write"],
      }),
      schema: {
        operationId: "adminArchiveVariant",
        tags: ["admin-catalog"],
        security: [{ bearerAuth: [] }],
        params: ProductVariantParams,
        body: EmptyBody,
        response: {
          200: ProductSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const item = await dependencies.adminCatalogRepository.archiveVariant(
        request.params.productId,
        request.params.variantId,
      );
      await audit(
        dependencies,
        request,
        actor,
        "catalog.variant_archived",
        "product_variant",
        request.params.variantId,
      );
      return item;
    },
  );
}
