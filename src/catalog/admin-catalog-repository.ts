import { randomUUID } from "node:crypto";
import type { Kysely, Selectable, Transaction } from "kysely";
import type { DatabaseSchema } from "../database/schema.js";
import { AppError } from "../http/problem.js";

type DbExecutor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;
type CategoryRow = Selectable<DatabaseSchema["catalog.categories"]>;
type AttributeRow = Selectable<DatabaseSchema["catalog.attributes"]>;
type ProductRow = Selectable<DatabaseSchema["catalog.products"]>;
type VariantRow = Selectable<DatabaseSchema["catalog.product_variants"]>;
type CategoryStatus = "draft" | "active" | "archived";
type AttributeStatus = CategoryStatus;
type ProductStatus = CategoryStatus;
type VariantStatus = CategoryStatus;
type AttributeValueType =
  "text" | "number" | "boolean" | "select" | "color" | "dimension";

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parentId: string | null;
  status: CategoryStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAttributeOption {
  id: string;
  value: string;
  label: string;
  sortOrder: number;
}

export interface AdminAttribute {
  id: string;
  key: string;
  name: string;
  valueType: AttributeValueType;
  isFilterable: boolean;
  isRequired: boolean;
  status: AttributeStatus;
  options: readonly AdminAttributeOption[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductVariant {
  id: string;
  productId: string;
  sku: string;
  title: string | null;
  priceAmountMinor: number;
  compareAtPriceAmountMinor: number | null;
  currency: "TND";
  status: VariantStatus;
  options: Record<string, unknown>;
  payload: Record<string, unknown>;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type ProductMediaType =
  | "front"
  | "lifestyle"
  | "fabric_detail"
  | "header_detail"
  | "mechanism_detail";

export interface AdminProductMedia {
  id: string;
  productId: string;
  variantId: string | null;
  storagePath: string;
  publicUrl: string | null;
  alt: string;
  mediaType: ProductMediaType;
  status: ProductStatus;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  reference: string;
  shortDescription: string | null;
  longDescription: string | null;
  imageAlt: string | null;
  status: ProductStatus;
  categoryId: string | null;
  categorySlug: string | null;
  material: string;
  sellingMode: string;
  isPublished: boolean;
  publishedAt: string | null;
  archivedAt: string | null;
  version: number;
  isDemo: boolean;
  media: readonly AdminProductMedia[];
  variants: readonly AdminProductVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface CategoryInput {
  slug: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  status?: CategoryStatus;
  sortOrder?: number;
}

export interface CategoryPatch {
  slug?: string;
  name?: string;
  description?: string | null;
  parentId?: string | null;
  status?: CategoryStatus;
  sortOrder?: number;
}

export interface AttributeOptionInput {
  value: string;
  label: string;
  sortOrder?: number;
}

export interface AttributeInput {
  key: string;
  name: string;
  valueType: AttributeValueType;
  isFilterable?: boolean;
  isRequired?: boolean;
  status?: AttributeStatus;
  options?: readonly AttributeOptionInput[];
}

export interface AttributePatch {
  key?: string;
  name?: string;
  valueType?: AttributeValueType;
  isFilterable?: boolean;
  isRequired?: boolean;
  status?: AttributeStatus;
  options?: readonly AttributeOptionInput[];
}

export interface ProductInput {
  slug: string;
  name: string;
  reference: string;
  categoryId: string;
  material: string;
  sellingMode: string;
  shortDescription?: string | null;
  longDescription?: string | null;
  imageAlt?: string | null;
  isDemo?: boolean;
  isLargeWidth?: boolean;
  isNew?: boolean;
  isBestSeller?: boolean;
  isFeatured?: boolean;
  isThermal?: boolean;
  recommendationScore?: number;
  payload?: Record<string, unknown>;
}

export interface ProductPatch {
  slug?: string;
  name?: string;
  reference?: string;
  categoryId?: string;
  material?: string;
  sellingMode?: string;
  shortDescription?: string | null;
  longDescription?: string | null;
  imageAlt?: string | null;
  isDemo?: boolean;
  isLargeWidth?: boolean;
  isNew?: boolean;
  isBestSeller?: boolean;
  isFeatured?: boolean;
  isThermal?: boolean;
  recommendationScore?: number;
  payload?: Record<string, unknown>;
  expectedVersion?: number;
}

export interface VariantInput {
  sku: string;
  title?: string | null;
  priceAmountMinor: number;
  compareAtPriceAmountMinor?: number | null;
  status?: VariantStatus;
  options?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  isDefault?: boolean;
  sortOrder?: number;
}

export interface VariantPatch {
  sku?: string;
  title?: string | null;
  priceAmountMinor?: number;
  compareAtPriceAmountMinor?: number | null;
  status?: VariantStatus;
  options?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  isDefault?: boolean;
  sortOrder?: number;
  expectedVersion?: number;
}

export interface AdminCatalogRepository {
  listCategories(): Promise<readonly AdminCategory[]>;
  createCategory(input: CategoryInput): Promise<AdminCategory>;
  updateCategory(id: string, patch: CategoryPatch): Promise<AdminCategory>;
  listAttributes(): Promise<readonly AdminAttribute[]>;
  createAttribute(input: AttributeInput): Promise<AdminAttribute>;
  updateAttribute(id: string, patch: AttributePatch): Promise<AdminAttribute>;
  listProducts(input: {
    status?: ProductStatus;
    query?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: readonly AdminProduct[]; total: number }>;
  getProduct(id: string): Promise<AdminProduct>;
  createProduct(input: ProductInput): Promise<AdminProduct>;
  updateProduct(id: string, patch: ProductPatch): Promise<AdminProduct>;
  publishProduct(id: string): Promise<AdminProduct>;
  archiveProduct(id: string): Promise<AdminProduct>;
  createVariant(
    productId: string,
    input: VariantInput,
  ): Promise<{ product: AdminProduct; variantId: string }>;
  updateVariant(
    productId: string,
    variantId: string,
    patch: VariantPatch,
  ): Promise<AdminProduct>;
  archiveVariant(productId: string, variantId: string): Promise<AdminProduct>;
}

function fail(
  statusCode: number,
  code: string,
  title: string,
  detail: string,
): never {
  throw new AppError({ statusCode, code, title, detail });
}

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.trunc(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return fallback;
}

const MEDIA_TYPES = new Set<ProductMediaType>([
  "front",
  "lifestyle",
  "fabric_detail",
  "header_detail",
  "mechanism_detail",
]);

function mediaType(value: unknown): ProductMediaType {
  return MEDIA_TYPES.has(value as ProductMediaType)
    ? (value as ProductMediaType)
    : "front";
}

function mediaInputs(
  productId: string,
  payload: Record<string, unknown>,
  status: ProductStatus,
  fallbackAlt: string,
): {
  id: string;
  product_id: string;
  variant_id: string | null;
  storage_path: string;
  public_url: string | null;
  alt: string;
  media_type: ProductMediaType;
  status: ProductStatus;
  is_primary: boolean;
  sort_order: number;
}[] {
  const assets = Array.isArray(payload.imageAssets)
    ? payload.imageAssets
    : Array.isArray(payload.images)
      ? payload.images
      : [];
  const seen = new Set<string>();
  const rows: {
    id: string;
    product_id: string;
    variant_id: string | null;
    storage_path: string;
    public_url: string | null;
    alt: string;
    media_type: ProductMediaType;
    status: ProductStatus;
    is_primary: boolean;
    sort_order: number;
  }[] = [];
  for (const [index, value] of assets.entries()) {
    const object = typeof value === "string" ? { url: value } : asObject(value);
    const url = stringValue(object.url);
    const storagePath = stringValue(object.storagePath) ?? url;
    if (!url || !storagePath || storagePath.length > 500) continue;
    const id = stringValue(object.id) ?? randomUUID();
    if (seen.has(id)) continue;
    const alt = stringValue(object.alt) ?? fallbackAlt.trim();
    if (!alt || alt.length > 240) continue;
    seen.add(id);
    rows.push({
      id,
      product_id: productId,
      variant_id: stringValue(object.variantId),
      storage_path: storagePath,
      public_url: stringValue(object.publicUrl) ?? url,
      alt,
      media_type: mediaType(object.type ?? object.mediaType),
      status,
      is_primary:
        object.isPrimary === true || (index === 0 && rows.length === 0),
      sort_order:
        typeof object.order === "number" &&
        Number.isInteger(object.order) &&
        object.order >= 0
          ? object.order
          : index,
    });
  }
  return rows.map((row, index) => ({
    ...row,
    is_primary:
      index === 0
        ? true
        : row.is_primary &&
          !rows.slice(0, index).some((item) => item.is_primary),
  }));
}

export class PostgresAdminCatalogRepository implements AdminCatalogRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async listCategories(): Promise<readonly AdminCategory[]> {
    const rows = await this.database
      .selectFrom("catalog.categories")
      .selectAll()
      .orderBy("sort_order")
      .orderBy("name")
      .execute();
    return rows.map(categoryRecord);
  }

  async createCategory(input: CategoryInput): Promise<AdminCategory> {
    return this.database.transaction().execute(async (trx) => {
      await this.assertCategoryParent(trx, input.parentId ?? null, null);
      const existing = await trx
        .selectFrom("catalog.categories")
        .select("id")
        .where("slug", "=", input.slug)
        .executeTakeFirst();
      if (existing)
        fail(
          409,
          "CATEGORY_SLUG_CONFLICT",
          "Category conflict",
          "A category with this slug already exists.",
        );
      const row = await trx
        .insertInto("catalog.categories")
        .values({
          id: randomUUID(),
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          parent_id: input.parentId ?? null,
          status: input.status ?? "draft",
          sort_order: input.sortOrder ?? 0,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return categoryRecord(row);
    });
  }

  async updateCategory(
    id: string,
    patch: CategoryPatch,
  ): Promise<AdminCategory> {
    return this.database.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom("catalog.categories")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      if (!current)
        fail(
          404,
          "CATEGORY_NOT_FOUND",
          "Category not found",
          "The requested category does not exist.",
        );
      const parentId =
        patch.parentId === undefined ? current.parent_id : patch.parentId;
      await this.assertCategoryParent(trx, parentId, id);
      if (patch.slug && patch.slug !== current.slug) {
        const duplicate = await trx
          .selectFrom("catalog.categories")
          .select("id")
          .where("slug", "=", patch.slug)
          .where("id", "!=", id)
          .executeTakeFirst();
        if (duplicate)
          fail(
            409,
            "CATEGORY_SLUG_CONFLICT",
            "Category conflict",
            "A category with this slug already exists.",
          );
      }
      const row = await trx
        .updateTable("catalog.categories")
        .set({
          ...(patch.slug === undefined ? {} : { slug: patch.slug }),
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.description === undefined
            ? {}
            : { description: patch.description }),
          ...(patch.parentId === undefined
            ? {}
            : { parent_id: patch.parentId }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(patch.sortOrder === undefined
            ? {}
            : { sort_order: patch.sortOrder }),
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return categoryRecord(row);
    });
  }

  async listAttributes(): Promise<readonly AdminAttribute[]> {
    const rows = await this.database
      .selectFrom("catalog.attributes")
      .selectAll()
      .orderBy("key")
      .execute();
    return Promise.all(
      rows.map((row) => this.attributeRecord(this.database, row)),
    );
  }

  async createAttribute(input: AttributeInput): Promise<AdminAttribute> {
    return this.database.transaction().execute(async (trx) => {
      const duplicate = await trx
        .selectFrom("catalog.attributes")
        .select("id")
        .where("key", "=", input.key)
        .executeTakeFirst();
      if (duplicate)
        fail(
          409,
          "ATTRIBUTE_KEY_CONFLICT",
          "Attribute conflict",
          "An attribute with this key already exists.",
        );
      const row = await trx
        .insertInto("catalog.attributes")
        .values({
          id: randomUUID(),
          key: input.key,
          name: input.name,
          value_type: input.valueType,
          is_filterable: input.isFilterable ?? false,
          is_required: input.isRequired ?? false,
          status: input.status ?? "draft",
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await replaceAttributeOptions(trx, row.id, input.options ?? []);
      return this.attributeRecord(trx, row);
    });
  }

  async updateAttribute(
    id: string,
    patch: AttributePatch,
  ): Promise<AdminAttribute> {
    return this.database.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom("catalog.attributes")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      if (!current)
        fail(
          404,
          "ATTRIBUTE_NOT_FOUND",
          "Attribute not found",
          "The requested attribute does not exist.",
        );
      if (patch.key && patch.key !== current.key) {
        const duplicate = await trx
          .selectFrom("catalog.attributes")
          .select("id")
          .where("key", "=", patch.key)
          .where("id", "!=", id)
          .executeTakeFirst();
        if (duplicate)
          fail(
            409,
            "ATTRIBUTE_KEY_CONFLICT",
            "Attribute conflict",
            "An attribute with this key already exists.",
          );
      }
      const row = await trx
        .updateTable("catalog.attributes")
        .set({
          ...(patch.key === undefined ? {} : { key: patch.key }),
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.valueType === undefined
            ? {}
            : { value_type: patch.valueType }),
          ...(patch.isFilterable === undefined
            ? {}
            : { is_filterable: patch.isFilterable }),
          ...(patch.isRequired === undefined
            ? {}
            : { is_required: patch.isRequired }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
      if (patch.options !== undefined)
        await replaceAttributeOptions(trx, id, patch.options);
      return this.attributeRecord(trx, row);
    });
  }

  async listProducts(input: {
    status?: ProductStatus;
    query?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: readonly AdminProduct[]; total: number }> {
    let filtered = this.database.selectFrom("catalog.products");
    if (input.status) filtered = filtered.where("status", "=", input.status);
    if (input.query) {
      const term = `%${input.query}%`;
      filtered = filtered.where((eb) =>
        eb.or([
          eb("name", "ilike", term),
          eb("reference", "ilike", term),
          eb("slug", "ilike", term),
        ]),
      );
    }
    const count = await filtered
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    const rows = await filtered
      .selectAll()
      .orderBy("updated_at", "desc")
      .limit(input.limit)
      .offset(input.offset)
      .execute();
    return {
      total: Number.parseInt(String(count.count), 10),
      items: await Promise.all(
        rows.map((row) => this.productRecord(this.database, row)),
      ),
    };
  }

  async getProduct(id: string): Promise<AdminProduct> {
    const row = await this.database
      .selectFrom("catalog.products")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row)
      fail(
        404,
        "PRODUCT_NOT_FOUND",
        "Product not found",
        "The requested product does not exist.",
      );
    return this.productRecord(this.database, row);
  }

  async createProduct(input: ProductInput): Promise<AdminProduct> {
    return this.database.transaction().execute(async (trx) => {
      const category = await this.assertCategory(trx, input.categoryId);
      const duplicate = await trx
        .selectFrom("catalog.products")
        .select("id")
        .where((eb) =>
          eb.or([
            eb("slug", "=", input.slug),
            eb("reference", "=", input.reference),
          ]),
        )
        .executeTakeFirst();
      if (duplicate)
        fail(
          409,
          "PRODUCT_IDENTIFIER_CONFLICT",
          "Product conflict",
          "The product slug or reference already exists.",
        );
      const product = {
        ...(input.payload ?? {}),
        name: input.name,
        reference: input.reference,
        slug: input.slug,
        shortDescription: input.shortDescription ?? "",
        longDescription: input.longDescription ?? "",
        imageAlt: input.imageAlt ?? "",
        variants: Array.isArray(input.payload?.variants)
          ? input.payload.variants
          : [],
        images: Array.isArray(input.payload?.images)
          ? input.payload.images
          : [],
      };
      const row = await trx
        .insertInto("catalog.products")
        .values({
          id: randomUUID(),
          slug: input.slug,
          is_published: false,
          is_demo: input.isDemo ?? false,
          name: input.name,
          reference: input.reference,
          short_description: input.shortDescription ?? null,
          long_description: input.longDescription ?? null,
          image_alt: input.imageAlt ?? null,
          status: "draft",
          category_id: input.categoryId,
          published_at: null,
          archived_at: null,
          version: 1,
          category: category.slug,
          material: input.material,
          opacity_level: null,
          selling_mode: input.sellingMode,
          pattern: null,
          blind_type: null,
          is_large_width: input.isLargeWidth ?? false,
          is_new: input.isNew ?? false,
          is_best_seller: input.isBestSeller ?? false,
          is_featured: input.isFeatured ?? false,
          is_thermal: input.isThermal ?? false,
          recommendation_score: input.recommendationScore ?? 0,
          product,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("catalog.product_categories")
        .values({
          product_id: row.id,
          category_id: input.categoryId,
          is_primary: true,
        })
        .executeTakeFirst();
      await this.replaceProductMedia(
        trx,
        row.id,
        product,
        "draft",
        input.imageAlt ?? "",
      );
      return this.productRecord(trx, row);
    });
  }

  async updateProduct(id: string, patch: ProductPatch): Promise<AdminProduct> {
    return this.database.transaction().execute(async (trx) => {
      const current = await this.productRow(trx, id);
      const categoryId = patch.categoryId ?? current.category_id;
      const category = categoryId
        ? await this.assertCategory(trx, categoryId)
        : null;
      if (patch.slug && patch.slug !== current.slug)
        await this.assertProductIdentifier(trx, "slug", patch.slug, id);
      if (patch.reference && patch.reference !== current.reference)
        await this.assertProductIdentifier(
          trx,
          "reference",
          patch.reference,
          id,
        );
      const update = {
        ...(patch.slug === undefined ? {} : { slug: patch.slug }),
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.reference === undefined
          ? {}
          : { reference: patch.reference }),
        ...(patch.categoryId === undefined
          ? {}
          : {
              category_id: patch.categoryId,
              category: category?.slug ?? current.category,
            }),
        ...(patch.material === undefined ? {} : { material: patch.material }),
        ...(patch.sellingMode === undefined
          ? {}
          : { selling_mode: patch.sellingMode }),
        ...(patch.shortDescription === undefined
          ? {}
          : { short_description: patch.shortDescription }),
        ...(patch.longDescription === undefined
          ? {}
          : { long_description: patch.longDescription }),
        ...(patch.imageAlt === undefined ? {} : { image_alt: patch.imageAlt }),
        ...(patch.isDemo === undefined ? {} : { is_demo: patch.isDemo }),
        ...(patch.isLargeWidth === undefined
          ? {}
          : { is_large_width: patch.isLargeWidth }),
        ...(patch.isNew === undefined ? {} : { is_new: patch.isNew }),
        ...(patch.isBestSeller === undefined
          ? {}
          : { is_best_seller: patch.isBestSeller }),
        ...(patch.isFeatured === undefined
          ? {}
          : { is_featured: patch.isFeatured }),
        ...(patch.isThermal === undefined
          ? {}
          : { is_thermal: patch.isThermal }),
        ...(patch.recommendationScore === undefined
          ? {}
          : { recommendation_score: patch.recommendationScore }),
        version: current.version + 1,
      };
      let updateQuery = trx
        .updateTable("catalog.products")
        .set(update)
        .where("id", "=", id);
      if (patch.expectedVersion !== undefined)
        updateQuery = updateQuery.where("version", "=", patch.expectedVersion);
      const result = await updateQuery.returningAll().executeTakeFirst();
      if (!result)
        fail(
          409,
          "PRODUCT_VERSION_CONFLICT",
          "Product changed",
          "Reload the product before saving these changes.",
        );
      if (patch.categoryId !== undefined) {
        await trx
          .deleteFrom("catalog.product_categories")
          .where("product_id", "=", id)
          .execute();
        await trx
          .insertInto("catalog.product_categories")
          .values({
            product_id: id,
            category_id: patch.categoryId,
            is_primary: true,
          })
          .executeTakeFirst();
      }
      const nextProduct =
        patch.payload === undefined
          ? asObject(current.product)
          : { ...asObject(current.product), ...patch.payload };
      if (patch.payload !== undefined) {
        await trx
          .updateTable("catalog.products")
          .set({ product: nextProduct })
          .where("id", "=", id)
          .executeTakeFirst();
        await this.replaceProductMedia(
          trx,
          id,
          nextProduct,
          current.is_published ? "active" : "draft",
          patch.imageAlt ?? current.image_alt ?? "",
        );
      }
      await this.refreshProductPayload(id, trx);
      return this.productRecord(trx, result);
    });
  }

  async publishProduct(id: string): Promise<AdminProduct> {
    return this.database.transaction().execute(async (trx) => {
      const current = await this.productRow(trx, id);
      const category = await trx
        .selectFrom("catalog.product_categories")
        .innerJoin(
          "catalog.categories",
          "catalog.categories.id",
          "catalog.product_categories.category_id",
        )
        .select([
          "catalog.product_categories.category_id",
          "catalog.categories.status",
        ])
        .where("product_id", "=", id)
        .where("is_primary", "=", true)
        .executeTakeFirst();
      const variants = await trx
        .selectFrom("catalog.product_variants")
        .selectAll()
        .where("product_id", "=", id)
        .where("status", "!=", "archived")
        .execute();
      if (
        current.name.trim().length < 2 ||
        current.reference.trim().length < 2 ||
        category?.status !== "active" ||
        variants.length === 0 ||
        variants.some(
          (variant) =>
            variant.sku.trim().length < 2 ||
            variant.price_amount_minor < 0 ||
            !isPublicVariant(variant),
        )
      ) {
        fail(
          422,
          "PRODUCT_NOT_READY",
          "Product is not ready",
          "A product needs a category and at least one valid variant before publication.",
        );
      }
      await trx
        .updateTable("catalog.product_variants")
        .set({ status: "active" })
        .where("product_id", "=", id)
        .where("status", "!=", "archived")
        .execute();
      await trx
        .updateTable("catalog.product_media")
        .set({ status: "active" })
        .where("product_id", "=", id)
        .where("status", "!=", "archived")
        .execute();
      const row = await trx
        .updateTable("catalog.products")
        .set({
          status: "active",
          is_published: true,
          published_at: new Date(),
          archived_at: null,
          version: current.version + 1,
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await this.refreshProductPayload(id, trx);
      return this.productRecord(trx, row);
    });
  }

  async archiveProduct(id: string): Promise<AdminProduct> {
    return this.database.transaction().execute(async (trx) => {
      const current = await this.productRow(trx, id);
      const row = await trx
        .updateTable("catalog.products")
        .set({
          status: "archived",
          is_published: false,
          archived_at: new Date(),
          version: current.version + 1,
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx
        .updateTable("catalog.product_media")
        .set({ status: "archived" })
        .where("product_id", "=", id)
        .execute();
      await this.refreshProductPayload(id, trx);
      return this.productRecord(trx, row);
    });
  }

  async createVariant(
    productId: string,
    input: VariantInput,
  ): Promise<{ product: AdminProduct; variantId: string }> {
    return this.database.transaction().execute(async (trx) => {
      await this.productRow(trx, productId);
      await this.assertVariantSku(trx, input.sku, null);
      if (
        input.compareAtPriceAmountMinor !== undefined &&
        input.compareAtPriceAmountMinor !== null &&
        input.compareAtPriceAmountMinor < input.priceAmountMinor
      )
        fail(
          422,
          "VARIANT_PRICE_INVALID",
          "Invalid variant price",
          "The comparison price cannot be lower than the selling price.",
        );
      if (input.isDefault)
        await trx
          .updateTable("catalog.product_variants")
          .set({ is_default: false })
          .where("product_id", "=", productId)
          .execute();
      const variant = await trx
        .insertInto("catalog.product_variants")
        .values({
          id: randomUUID(),
          product_id: productId,
          sku: input.sku,
          title: input.title ?? null,
          price_amount_minor: input.priceAmountMinor,
          compare_at_price_amount_minor:
            input.compareAtPriceAmountMinor ?? null,
          currency: "TND",
          status: input.status ?? "draft",
          options: input.options ?? {},
          payload: input.payload ?? {},
          is_default: input.isDefault ?? false,
          sort_order: input.sortOrder ?? 0,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await this.bumpProduct(trx, productId);
      await this.refreshProductPayload(productId, trx);
      return {
        product: await this.getProductFromExecutor(trx, productId),
        variantId: variant.id,
      };
    });
  }

  async updateVariant(
    productId: string,
    variantId: string,
    patch: VariantPatch,
  ): Promise<AdminProduct> {
    return this.database.transaction().execute(async (trx) => {
      const product = await this.productRow(trx, productId);
      const current = await trx
        .selectFrom("catalog.product_variants")
        .selectAll()
        .where("id", "=", variantId)
        .where("product_id", "=", productId)
        .executeTakeFirst();
      if (!current)
        fail(
          404,
          "VARIANT_NOT_FOUND",
          "Variant not found",
          "The requested variant does not exist.",
        );
      if (
        patch.expectedVersion !== undefined &&
        product.version !== patch.expectedVersion
      )
        fail(
          409,
          "PRODUCT_VERSION_CONFLICT",
          "Product changed",
          "Reload the product before saving this variant.",
        );
      if (patch.sku && patch.sku !== current.sku)
        await this.assertVariantSku(trx, patch.sku, variantId);
      const price = patch.priceAmountMinor ?? current.price_amount_minor;
      const compare =
        patch.compareAtPriceAmountMinor === undefined
          ? current.compare_at_price_amount_minor
          : patch.compareAtPriceAmountMinor;
      if (compare !== null && compare < price)
        fail(
          422,
          "VARIANT_PRICE_INVALID",
          "Invalid variant price",
          "The comparison price cannot be lower than the selling price.",
        );
      if (patch.isDefault)
        await trx
          .updateTable("catalog.product_variants")
          .set({ is_default: false })
          .where("product_id", "=", productId)
          .where("id", "!=", variantId)
          .execute();
      await trx
        .updateTable("catalog.product_variants")
        .set({
          ...(patch.sku === undefined ? {} : { sku: patch.sku }),
          ...(patch.title === undefined ? {} : { title: patch.title }),
          price_amount_minor: price,
          compare_at_price_amount_minor: compare,
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(patch.options === undefined ? {} : { options: patch.options }),
          ...(patch.payload === undefined ? {} : { payload: patch.payload }),
          ...(patch.isDefault === undefined
            ? {}
            : { is_default: patch.isDefault }),
          ...(patch.sortOrder === undefined
            ? {}
            : { sort_order: patch.sortOrder }),
        })
        .where("id", "=", variantId)
        .where("product_id", "=", productId)
        .executeTakeFirstOrThrow();
      await this.bumpProduct(trx, productId);
      await this.refreshProductPayload(productId, trx);
      return this.getProductFromExecutor(trx, productId);
    });
  }

  async archiveVariant(
    productId: string,
    variantId: string,
  ): Promise<AdminProduct> {
    return this.database.transaction().execute(async (trx) => {
      const result = await trx
        .updateTable("catalog.product_variants")
        .set({ status: "archived", is_default: false })
        .where("id", "=", variantId)
        .where("product_id", "=", productId)
        .returning("id")
        .executeTakeFirst();
      if (!result)
        fail(
          404,
          "VARIANT_NOT_FOUND",
          "Variant not found",
          "The requested variant does not exist.",
        );
      await this.bumpProduct(trx, productId);
      await this.refreshProductPayload(productId, trx);
      return this.getProductFromExecutor(trx, productId);
    });
  }

  private async productRow(executor: DbExecutor, id: string) {
    const row = await executor
      .selectFrom("catalog.products")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row)
      fail(
        404,
        "PRODUCT_NOT_FOUND",
        "Product not found",
        "The requested product does not exist.",
      );
    return row;
  }

  private async replaceProductMedia(
    executor: DbExecutor,
    productId: string,
    payload: Record<string, unknown>,
    status: ProductStatus,
    fallbackAlt: string,
  ): Promise<void> {
    const rows = mediaInputs(productId, payload, status, fallbackAlt);
    await executor
      .deleteFrom("catalog.product_media")
      .where("product_id", "=", productId)
      .execute();
    if (rows.length === 0) return;
    await executor.insertInto("catalog.product_media").values(rows).execute();
  }

  private async getProductFromExecutor(
    executor: DbExecutor,
    id: string,
  ): Promise<AdminProduct> {
    const row = await this.productRow(executor, id);
    return this.productRecord(executor, row);
  }

  private async productRecord(
    executor: DbExecutor,
    row: ProductRow,
  ): Promise<AdminProduct> {
    const category = row.category_id
      ? await executor
          .selectFrom("catalog.categories")
          .select("slug")
          .where("id", "=", row.category_id)
          .executeTakeFirst()
      : undefined;
    const variants = await executor
      .selectFrom("catalog.product_variants")
      .selectAll()
      .where("product_id", "=", row.id)
      .orderBy("sort_order")
      .orderBy("id")
      .execute();
    const media = await executor
      .selectFrom("catalog.product_media")
      .selectAll()
      .where("product_id", "=", row.id)
      .orderBy("sort_order")
      .orderBy("id")
      .execute();
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      reference: row.reference,
      shortDescription: row.short_description,
      longDescription: row.long_description,
      imageAlt: row.image_alt,
      status: row.status,
      categoryId: row.category_id,
      categorySlug: category?.slug ?? row.category,
      material: row.material,
      sellingMode: row.selling_mode,
      isPublished: row.is_published,
      publishedAt: iso(row.published_at),
      archivedAt: iso(row.archived_at),
      version: row.version,
      isDemo: row.is_demo,
      media: media.map(mediaRecord),
      variants: variants.map(variantRecord),
      createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
      updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
    };
  }

  private async attributeRecord(
    executor: DbExecutor,
    row: AttributeRow,
  ): Promise<AdminAttribute> {
    const options = await executor
      .selectFrom("catalog.attribute_options")
      .selectAll()
      .where("attribute_id", "=", row.id)
      .orderBy("sort_order")
      .orderBy("id")
      .execute();
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      valueType: row.value_type,
      isFilterable: row.is_filterable,
      isRequired: row.is_required,
      status: row.status,
      options: options.map((option) => ({
        id: option.id,
        value: option.value,
        label: option.label,
        sortOrder: option.sort_order,
      })),
      createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
      updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
    };
  }

  private async assertCategory(executor: DbExecutor, id: string) {
    const row = await executor
      .selectFrom("catalog.categories")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row)
      fail(
        422,
        "CATEGORY_NOT_FOUND",
        "Invalid category",
        "The selected category does not exist.",
      );
    if (row.status === "archived")
      fail(
        422,
        "CATEGORY_ARCHIVED",
        "Invalid category",
        "An archived category cannot receive new catalogue products.",
      );
    return row;
  }

  private async assertCategoryParent(
    executor: DbExecutor,
    parentId: string | null,
    selfId: string | null,
  ): Promise<void> {
    if (!parentId) return;
    if (parentId === selfId)
      fail(
        422,
        "CATEGORY_PARENT_INVALID",
        "Invalid category parent",
        "A category cannot be its own parent.",
      );
    let cursor: string | null = parentId;
    const visited = new Set<string>();
    while (cursor) {
      if (visited.has(cursor) || cursor === selfId)
        fail(
          422,
          "CATEGORY_PARENT_INVALID",
          "Invalid category parent",
          "Category nesting would create a cycle.",
        );
      visited.add(cursor);
      const parent = await this.assertCategory(executor, cursor);
      cursor = parent.parent_id;
    }
  }

  private async assertProductIdentifier(
    executor: DbExecutor,
    field: "slug" | "reference",
    value: string,
    id: string,
  ): Promise<void> {
    const row = await executor
      .selectFrom("catalog.products")
      .select("id")
      .where(field, "=", value)
      .where("id", "!=", id)
      .executeTakeFirst();
    if (row)
      fail(
        409,
        "PRODUCT_IDENTIFIER_CONFLICT",
        "Product conflict",
        "The product slug or reference already exists.",
      );
  }

  private async assertVariantSku(
    executor: DbExecutor,
    sku: string,
    id: string | null,
  ): Promise<void> {
    let query = executor
      .selectFrom("catalog.product_variants")
      .select("id")
      .where("sku", "=", sku);
    if (id) query = query.where("id", "!=", id);
    if (await query.executeTakeFirst())
      fail(
        409,
        "VARIANT_SKU_CONFLICT",
        "Variant conflict",
        "A variant with this SKU already exists.",
      );
  }

  private async bumpProduct(
    executor: DbExecutor,
    productId: string,
  ): Promise<void> {
    await executor
      .updateTable("catalog.products")
      .set(({ eb }) => ({ version: eb("version", "+", 1) }))
      .where("id", "=", productId)
      .executeTakeFirst();
  }

  private async refreshProductPayload(
    productId: string,
    executor: DbExecutor,
  ): Promise<void> {
    const row = await this.productRow(executor, productId);
    let variantQuery = executor
      .selectFrom("catalog.product_variants")
      .selectAll()
      .where("product_id", "=", productId)
      .orderBy("sort_order")
      .orderBy("id");
    if (row.is_published)
      variantQuery = variantQuery.where("status", "=", "active");
    const variants = await variantQuery.execute();
    let mediaQuery = executor
      .selectFrom("catalog.product_media")
      .selectAll()
      .where("product_id", "=", productId)
      .orderBy("sort_order")
      .orderBy("id");
    if (row.is_published)
      mediaQuery = mediaQuery.where("status", "=", "active");
    const media = await mediaQuery.execute();
    const balances = await executor
      .selectFrom("inventory.stock_balances")
      .selectAll()
      .where("product_id", "=", productId)
      .execute();
    const balanceByVariant = new Map(
      balances.map((balance) => [balance.variant_id, balance]),
    );
    const existing = asObject(row.product);
    const images = media.map((item) => ({
      id: item.id,
      url: item.public_url ?? item.storage_path,
      alt: item.alt,
      type: item.media_type,
    }));
    const normalizedVariants = variants.map((variant) => {
      const balance = balanceByVariant.get(variant.id);
      const legacy = asObject(variant.payload);
      const stock = balance?.on_hand ?? numberValue(legacy.stock, 0);
      const reserved = balance?.reserved ?? 0;
      const availableQuantity = Math.max(0, stock - reserved);
      const threshold =
        balance?.low_stock_threshold ??
        numberValue(legacy.lowStockThreshold, 3);
      const availability =
        balance?.availability ??
        stringValue(legacy.availability) ??
        (stock <= 0
          ? "out_of_stock"
          : stock <= threshold
            ? "low_stock"
            : "in_stock");
      return {
        ...legacy,
        ...asObject(variant.options),
        id: variant.id,
        sku: variant.sku,
        price: { amountMinor: variant.price_amount_minor, currency: "TND" },
        ...(variant.compare_at_price_amount_minor === null
          ? {}
          : {
              compareAtPrice: {
                amountMinor: variant.compare_at_price_amount_minor,
                currency: "TND",
              },
            }),
        availability,
        availableQuantity,
        ...(balance ? { reservedQuantity: reserved } : {}),
        imageIds: [],
      };
    });
    const payload = {
      ...existing,
      id: row.id,
      slug: row.slug,
      name: row.name,
      reference: row.reference,
      shortDescription: row.short_description ?? "",
      longDescription: row.long_description ?? "",
      imageAlt: row.image_alt ?? "",
      category: row.category,
      material: row.material,
      sellingMode: row.selling_mode,
      images:
        images.length > 0
          ? images
          : !row.is_published && Array.isArray(existing.images)
            ? existing.images
            : [],
      variants:
        normalizedVariants.length > 0
          ? normalizedVariants
          : !row.is_published && Array.isArray(existing.variants)
            ? existing.variants
            : [],
    };
    await executor
      .updateTable("catalog.products")
      .set({ product: payload })
      .where("id", "=", productId)
      .executeTakeFirst();
  }
}

function mediaRecord(
  row: Selectable<DatabaseSchema["catalog.product_media"]>,
): AdminProductMedia {
  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    alt: row.alt,
    mediaType: row.media_type,
    status: row.status,
    isPrimary: row.is_primary,
    sortOrder: row.sort_order,
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function isPublicVariant(row: VariantRow): boolean {
  const value = { ...asObject(row.payload), ...asObject(row.options) };
  const colorId = value.colorId ?? value.color_id;
  const width = value.widthCm ?? value.width;
  const height = value.heightCm ?? value.height;
  const positiveDimension = (candidate: unknown): boolean => {
    const numeric =
      typeof candidate === "number"
        ? candidate
        : typeof candidate === "string"
          ? Number(candidate)
          : Number.NaN;
    return Number.isFinite(numeric) && numeric > 0;
  };
  return (
    typeof colorId === "string" &&
    colorId.trim().length > 0 &&
    positiveDimension(width) &&
    positiveDimension(height)
  );
}

function categoryRecord(row: CategoryRow): AdminCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    parentId: row.parent_id,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function variantRecord(row: VariantRow): AdminProductVariant {
  return {
    id: row.id,
    productId: row.product_id,
    sku: row.sku,
    title: row.title,
    priceAmountMinor: row.price_amount_minor,
    compareAtPriceAmountMinor: row.compare_at_price_amount_minor,
    currency: row.currency,
    status: row.status,
    options: row.options,
    payload: row.payload,
    isDefault: row.is_default,
    sortOrder: row.sort_order,
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

async function replaceAttributeOptions(
  executor: DbExecutor,
  attributeId: string,
  options: readonly AttributeOptionInput[],
): Promise<void> {
  await executor
    .deleteFrom("catalog.attribute_options")
    .where("attribute_id", "=", attributeId)
    .execute();
  if (options.length === 0) return;
  await executor
    .insertInto("catalog.attribute_options")
    .values(
      options.map((option, index) => ({
        id: randomUUID(),
        attribute_id: attributeId,
        value: option.value,
        label: option.label,
        sort_order: option.sortOrder ?? index,
      })),
    )
    .execute();
}
