import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Selectable, type Transaction } from "kysely";
import type { DatabaseSchema } from "../database/schema.js";
import { AppError } from "../http/problem.js";
import { validateVariantBusinessRules } from "./variant-business-rules.js";

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
type JsonAttributeValue =
  Record<string, unknown> | readonly unknown[] | string | number | boolean;

/**
 * Canonical system attributes provisioned for each catalogue family.  The
 * public slugs are kept here (rather than in the UI) so categories created
 * after the migration receive the same bindings as the seeded categories.
 */
const SYSTEM_ATTRIBUTE_KEYS_BY_ROOT_CATEGORY: Readonly<
  Record<string, readonly string[]>
> = {
  rideaux: [
    "material",
    "opacity",
    "rooms",
    "large_width",
    "care",
    "installation",
  ],
  voilages: [
    "material",
    "opacity",
    "rooms",
    "large_width",
    "care",
    "installation",
  ],
  stores: [
    "material",
    "opacity",
    "rooms",
    "care",
    "installation",
    "blind_type",
    "mechanism",
  ],
  coussins: [
    "material",
    "rooms",
    "shape",
    "removable_cover",
    "machine_washable",
    "filling",
    "closure",
  ],
  "galettes-de-chaise": [
    "material",
    "rooms",
    "shape",
    "removable_cover",
    "machine_washable",
    "fastening",
    "thickness_cm",
  ],
  galettes_de_chaise: [
    "material",
    "rooms",
    "shape",
    "removable_cover",
    "machine_washable",
    "fastening",
    "thickness_cm",
  ],
  accessoires: [
    "material",
    "installation",
    "accessory_type",
    "compatibilities",
    "finish",
    "min_length_cm",
    "max_length_cm",
    "diameter_mm",
  ],
  mobilier: [
    "rooms",
    "furniture_type",
    "removable_cover",
    "upholstery",
    "frame_material",
    "leg_material",
    "features",
    "seat_comfort",
    "number_of_seats",
    "assembly_level",
    "assembly_time",
    "shipping_profile",
    "free_shipping_eligible",
    "width_cm",
    "depth_cm",
    "height_cm",
    "seat_width_cm",
    "seat_depth_cm",
    "seat_height_cm",
    "back_height_cm",
    "armrest_height_cm",
    "weight_kg",
    "max_load_kg",
    "storage_volume_l",
    "package_count",
  ],
  mobilier_interieur: [
    "rooms",
    "furniture_type",
    "removable_cover",
    "upholstery",
    "frame_material",
    "leg_material",
    "features",
    "seat_comfort",
    "number_of_seats",
    "assembly_level",
    "assembly_time",
    "shipping_profile",
    "free_shipping_eligible",
    "width_cm",
    "depth_cm",
    "height_cm",
    "seat_width_cm",
    "seat_depth_cm",
    "seat_height_cm",
    "back_height_cm",
    "armrest_height_cm",
    "weight_kg",
    "max_load_kg",
    "storage_volume_l",
    "package_count",
  ],
  plantes: [
    "rooms",
    "care",
    "shipping_profile",
    "plant_nature",
    "plant_type",
    "plant_size",
    "common_name",
    "botanical_name",
    "plant_family",
    "origin",
    "light_need",
    "watering",
    "pet_safe",
    "toxicity_note",
    "flowering",
    "trailing",
    "pot_included",
    "indoor_use",
    "preservation",
    "fragile",
  ],
  plantes_decoration: [
    "rooms",
    "care",
    "shipping_profile",
    "plant_nature",
    "plant_type",
    "plant_size",
    "common_name",
    "botanical_name",
    "plant_family",
    "origin",
    "light_need",
    "watering",
    "pet_safe",
    "toxicity_note",
    "flowering",
    "trailing",
    "pot_included",
    "indoor_use",
    "preservation",
    "fragile",
  ],
};

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parentId: string | null;
  status: CategoryStatus;
  sortOrder: number;
  imageUrl: string | null;
  imageMediaAssetId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  showInNavigation: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAttributeOption {
  id: string;
  value: string;
  label: string;
  sortOrder: number;
  hex: string | null;
  family: string | null;
  isActive: boolean;
}

export interface AdminAttribute {
  id: string;
  key: string;
  name: string;
  valueType: AttributeValueType;
  isFilterable: boolean;
  isRequired: boolean;
  status: AttributeStatus;
  isVariantAxis: boolean;
  sortOrder: number;
  isSystem: boolean;
  categorySlugs: readonly string[];
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
  isNew?: boolean;
  isBestSeller?: boolean;
  isFeatured?: boolean;
  isOnSale?: boolean;
  payload?: Record<string, unknown>;
  /** Valeurs d'attributs normalisées, indexées par clé technique. */
  attributes: Record<string, unknown>;
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
  imageUrl?: string | null;
  imageMediaAssetId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  showInNavigation?: boolean;
}

export interface CategoryPatch {
  slug?: string;
  name?: string;
  description?: string | null;
  parentId?: string | null;
  status?: CategoryStatus;
  sortOrder?: number;
  imageUrl?: string | null;
  imageMediaAssetId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  showInNavigation?: boolean;
}

export interface AttributeOptionInput {
  value: string;
  label: string;
  sortOrder?: number;
  hex?: string | null;
  family?: string | null;
  isActive?: boolean;
}

export interface AttributeInput {
  key: string;
  name: string;
  valueType: AttributeValueType;
  isFilterable?: boolean;
  isRequired?: boolean;
  status?: AttributeStatus;
  isVariantAxis?: boolean;
  sortOrder?: number;
  isSystem?: boolean;
  categorySlugs?: readonly string[];
  options?: readonly AttributeOptionInput[];
}

export interface AttributePatch {
  key?: string;
  name?: string;
  valueType?: AttributeValueType;
  isFilterable?: boolean;
  isRequired?: boolean;
  status?: AttributeStatus;
  isVariantAxis?: boolean;
  sortOrder?: number;
  isSystem?: boolean;
  categorySlugs?: readonly string[];
  options?: readonly AttributeOptionInput[];
}

export interface ProductInput {
  slug: string;
  name: string;
  reference: string;
  categoryId: string;
  /** Famille fonctionnelle attendue par le formulaire Admin. */
  category?: string;
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
  isOnSale?: boolean;
  isThermal?: boolean;
  recommendationScore?: number;
  attributes?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

export interface ProductPatch {
  slug?: string;
  name?: string;
  reference?: string;
  categoryId?: string;
  category?: string;
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
  isOnSale?: boolean;
  isThermal?: boolean;
  recommendationScore?: number;
  attributes?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  expectedVersion?: number;
}

export interface VariantInput {
  sku?: string;
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
  reorderCategory(id: string, direction: "up" | "down"): Promise<AdminCategory>;
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

/**
 * PostgreSQL BIGINT columns are returned as strings by the default `pg`
 * parser. Product versions participate in arithmetic and strict comparisons,
 * so normalize them before incrementing or checking optimistic locks.
 */
function productVersion(value: unknown): number {
  return numberValue(value, 1);
}

/**
 * SKU identity is deliberately case-insensitive and whitespace-tolerant.
 * Keeping this canonical form in the API makes the application rule match the
 * expression unique index installed by the catalogue migration.
 */
export function normalizeVariantSku(value: string): string {
  return value.trim().toUpperCase();
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function isVariantSkuUniqueViolation(error: unknown): boolean {
  if (!isUniqueViolation(error)) return false;
  if (typeof error !== "object" || error === null) return false;
  const constraint = (error as { constraint?: unknown }).constraint;
  return constraint === "catalog_product_variants_sku_unique";
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
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
      .where("status", "!=", "archived")
      .orderBy("sort_order")
      .orderBy("name")
      .execute();
    return rows.map(categoryRecord);
  }

  async createCategory(input: CategoryInput): Promise<AdminCategory> {
    return this.database.transaction().execute(async (trx) => {
      await this.assertCategoryParent(
        trx,
        input.parentId ?? null,
        null,
        input.status ?? "draft",
      );
      await this.assertCategoryMediaAsset(trx, input.imageMediaAssetId ?? null);
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
          image_url: input.imageUrl ?? null,
          image_media_asset_id: input.imageMediaAssetId ?? null,
          seo_title: input.seoTitle ?? null,
          seo_description: input.seoDescription ?? null,
          show_in_navigation: input.showInNavigation ?? true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const rootSlug = await this.rootCategorySlug(trx, row);
      await this.bindSystemAttributesForCategory(trx, row.id, rootSlug);
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
      await this.assertCategoryParent(
        trx,
        parentId,
        id,
        patch.status ?? current.status,
      );
      await this.assertCategoryMediaAsset(
        trx,
        patch.imageMediaAssetId === undefined
          ? current.image_media_asset_id
          : patch.imageMediaAssetId,
      );
      if (parentId && parentId !== current.parent_id) {
        const child = await trx
          .selectFrom("catalog.categories")
          .select("id")
          .where("parent_id", "=", id)
          .executeTakeFirst();
        if (child)
          fail(
            422,
            "CATEGORY_PARENT_INVALID",
            "Invalid category parent",
            "A category with children cannot be moved below another category.",
          );
      }
      if (patch.status === "archived" && current.status !== "archived")
        await this.assertCategoryArchivable(trx, id);
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
          ...(patch.imageUrl === undefined
            ? {}
            : { image_url: patch.imageUrl }),
          ...(patch.imageMediaAssetId === undefined
            ? {}
            : { image_media_asset_id: patch.imageMediaAssetId }),
          ...(patch.seoTitle === undefined
            ? {}
            : { seo_title: patch.seoTitle }),
          ...(patch.seoDescription === undefined
            ? {}
            : { seo_description: patch.seoDescription }),
          ...(patch.showInNavigation === undefined
            ? {}
            : { show_in_navigation: patch.showInNavigation }),
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return categoryRecord(row);
    });
  }

  async reorderCategory(
    id: string,
    direction: "up" | "down",
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
      if (current.status === "archived")
        fail(
          409,
          "CATEGORY_ARCHIVED",
          "Category archived",
          "An archived category cannot be reordered.",
        );

      // Lock and order only the current sibling set. This prevents a child
      // from being swapped with a root category and keeps the operation
      // atomic when two Admin users reorder at the same time.
      const siblingQuery = trx
        .selectFrom("catalog.categories")
        .selectAll()
        .where("status", "!=", "archived");
      const siblings = current.parent_id
        ? await siblingQuery
            .where("parent_id", "=", current.parent_id)
            .orderBy("sort_order")
            .orderBy("name")
            .orderBy("id")
            .forUpdate()
            .execute()
        : await siblingQuery
            .where("parent_id", "is", null)
            .orderBy("sort_order")
            .orderBy("name")
            .orderBy("id")
            .forUpdate()
            .execute();

      const currentIndex = siblings.findIndex((item) => item.id === id);
      const targetIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length)
        return categoryRecord(current);

      const reordered = [...siblings];
      const [moved] = reordered.splice(currentIndex, 1);
      if (!moved) return categoryRecord(current);
      reordered.splice(targetIndex, 0, moved);

      for (const [sortOrder, sibling] of reordered.entries()) {
        if (sibling.sort_order === sortOrder) continue;
        await trx
          .updateTable("catalog.categories")
          .set({ sort_order: sortOrder })
          .where("id", "=", sibling.id)
          .execute();
      }

      const updated = await trx
        .selectFrom("catalog.categories")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
      return categoryRecord(updated);
    });
  }

  async listAttributes(): Promise<readonly AdminAttribute[]> {
    const rows = await this.database
      .selectFrom("catalog.attributes")
      .selectAll()
      .where("status", "!=", "archived")
      .orderBy("key")
      .execute();
    return Promise.all(
      rows.map((row) => this.attributeRecord(this.database, row)),
    );
  }

  async createAttribute(input: AttributeInput): Promise<AdminAttribute> {
    return this.database.transaction().execute(async (trx) => {
      if (input.isSystem === true)
        fail(
          422,
          "ATTRIBUTE_SYSTEM_IMMUTABLE",
          "System attribute",
          "System attributes are provisioned by the catalogue and cannot be created manually.",
        );
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
          is_variant_axis: input.isVariantAxis ?? false,
          sort_order: input.sortOrder ?? 0,
          is_system: input.isSystem ?? false,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await replaceAttributeOptions(trx, row.id, input.options ?? []);
      await replaceAttributeCategories(trx, row.id, input.categorySlugs ?? []);
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
      if (
        (current.is_system &&
          ((patch.key !== undefined && patch.key !== current.key) ||
            (patch.valueType !== undefined &&
              patch.valueType !== current.value_type) ||
            patch.isSystem === false)) ||
        (!current.is_system && patch.isSystem === true)
      )
        fail(
          422,
          "ATTRIBUTE_SYSTEM_IMMUTABLE",
          "System attribute",
          current.is_system
            ? "The key and type of a system attribute cannot be changed."
            : "A regular attribute cannot be promoted to a system attribute.",
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
      const productIdsToRefresh =
        patch.key !== undefined && patch.key !== current.key
          ? await trx
              .selectFrom("catalog.product_attributes")
              .select("product_id")
              .distinct()
              .where("attribute_id", "=", id)
              .execute()
          : [];
      if (patch.status === "archived" && current.status !== "archived") {
        if (current.is_system)
          fail(
            409,
            "ATTRIBUTE_SYSTEM_IN_USE",
            "System attribute",
            "A system attribute cannot be archived.",
          );
        await this.assertAttributeArchivable(trx, id);
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
          ...(patch.isVariantAxis === undefined
            ? {}
            : { is_variant_axis: patch.isVariantAxis }),
          ...(patch.sortOrder === undefined
            ? {}
            : { sort_order: patch.sortOrder }),
          ...(patch.isSystem === undefined
            ? {}
            : { is_system: patch.isSystem }),
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
      if (patch.options !== undefined)
        await replaceAttributeOptions(trx, id, patch.options);
      if (patch.categorySlugs !== undefined)
        await replaceAttributeCategories(trx, id, patch.categorySlugs);
      for (const product of productIdsToRefresh)
        await this.refreshProductPayload(product.product_id, trx);
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
      const rootCategorySlug = await this.rootCategorySlug(trx, category);
      if (input.category && input.category !== rootCategorySlug)
        fail(
          422,
          "CATEGORY_FAMILY_MISMATCH",
          "Invalid product family",
          "The catalogue category does not belong to the selected product family.",
        );
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
        ...(input.isOnSale === undefined ? {} : { isOnSale: input.isOnSale }),
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
          // Keep the legacy public field at the catalog root. The normalized
          // category_id/product_categories tables retain the subcategory.
          category: rootCategorySlug,
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
      await this.replaceProductAttributes(
        trx,
        row.id,
        category.id,
        input.attributes ?? {},
        false,
        input.material,
      );
      await this.refreshProductPayload(row.id, trx);
      return this.productRecord(trx, row);
    });
  }

  async updateProduct(id: string, patch: ProductPatch): Promise<AdminProduct> {
    return this.database.transaction().execute(async (trx) => {
      const current = await this.productRow(trx, id);
      const currentVersion = productVersion(current.version);
      const categoryId = patch.categoryId ?? current.category_id;
      const category = categoryId
        ? await this.assertCategory(trx, categoryId)
        : null;
      const rootCategorySlug = category
        ? await this.rootCategorySlug(trx, category)
        : current.category;
      if (patch.category && patch.category !== rootCategorySlug)
        fail(
          422,
          "CATEGORY_FAMILY_MISMATCH",
          "Invalid product family",
          "The catalogue category does not belong to the selected product family.",
        );
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
              category: rootCategorySlug,
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
        version: currentVersion + 1,
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
      const productWithSaleFlag =
        patch.isOnSale === undefined
          ? nextProduct
          : { ...nextProduct, isOnSale: patch.isOnSale };
      if (patch.payload !== undefined) {
        await trx
          .updateTable("catalog.products")
          .set({ product: productWithSaleFlag })
          .where("id", "=", id)
          .executeTakeFirst();
        await this.replaceProductMedia(
          trx,
          id,
          productWithSaleFlag,
          current.is_published ? "active" : "draft",
          patch.imageAlt ?? current.image_alt ?? "",
        );
      }
      if (patch.isOnSale !== undefined && patch.payload === undefined) {
        await trx
          .updateTable("catalog.products")
          .set({ product: productWithSaleFlag })
          .where("id", "=", id)
          .executeTakeFirst();
      }
      const payloadAttributes = asObject(productWithSaleFlag.attributes);
      const taxonomyChanged =
        patch.categoryId !== undefined ||
        patch.material !== undefined ||
        (patch.payload !== undefined &&
          ("accessory_type" in patch.payload ||
            "accessoryType" in patch.payload ||
            "attributes" in patch.payload ||
            "accessory_type" in payloadAttributes ||
            "accessoryType" in payloadAttributes));
      if (current.is_published && taxonomyChanged) {
        await this.assertProductVariantsBusinessRules(
          trx,
          id,
          rootCategorySlug,
          patch.material ?? current.material,
          productWithSaleFlag,
        );
      }
      if (
        patch.attributes !== undefined ||
        patch.categoryId !== undefined ||
        patch.material !== undefined
      ) {
        const attributes =
          patch.attributes ?? (await this.productAttributes(trx, id));
        await this.replaceProductAttributes(
          trx,
          id,
          categoryId,
          attributes,
          false,
          patch.material ?? current.material,
        );
      }
      await this.refreshProductPayload(id, trx);
      return this.getProductFromExecutor(trx, id);
    });
  }

  async publishProduct(id: string): Promise<AdminProduct> {
    return this.database.transaction().execute(async (trx) => {
      const current = await this.productRow(trx, id);
      const currentVersion = productVersion(current.version);
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
      for (const variant of variants) {
        const ruleViolation = validateVariantBusinessRules(
          current.category,
          current.material,
          current.product,
          { ...asObject(variant.options), ...asObject(variant.payload) },
        );
        if (ruleViolation)
          fail(
            422,
            ruleViolation.code,
            ruleViolation.title,
            ruleViolation.detail,
          );
      }
      const attributes = await this.productAttributes(trx, id);
      await this.replaceProductAttributes(
        trx,
        id,
        current.category_id,
        attributes,
        true,
        current.material,
      );
      const publicationIssues: string[] = [];
      if (current.name.trim().length < 2)
        publicationIssues.push("Le nom du produit est manquant.");
      if (current.reference.trim().length < 2)
        publicationIssues.push("La référence du produit est manquante.");
      if (category?.status !== "active")
        publicationIssues.push(
          "La catégorie principale est absente ou inactive.",
        );
      if (variants.length === 0) {
        publicationIssues.push("Au moins une variante active est requise.");
      } else {
        variants.forEach((variant, index) => {
          const variantIssues: string[] = [];
          if (variant.sku.trim().length < 2)
            variantIssues.push("le SKU est manquant");
          if (variant.price_amount_minor < 0)
            variantIssues.push("le prix est invalide");
          variantIssues.push(...publicVariantIssues(variant));
          if (variantIssues.length > 0) {
            publicationIssues.push(
              `Variante ${String(index + 1)} : ${variantIssues.join(" ; ")}.`,
            );
          }
        });
      }
      if (publicationIssues.length > 0) {
        fail(
          422,
          "PRODUCT_NOT_READY",
          "Product is not ready",
          `Impossible de publier le produit : ${publicationIssues.join(" ")}`,
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
          version: currentVersion + 1,
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
      const currentVersion = productVersion(current.version);
      const row = await trx
        .updateTable("catalog.products")
        .set({
          status: "archived",
          is_published: false,
          archived_at: new Date(),
          version: currentVersion + 1,
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
    try {
      return await this.database.transaction().execute(async (trx) => {
        const product = await this.productRow(trx, productId);
        const requestedSku = input.sku ? normalizeVariantSku(input.sku) : "";
        const sku =
          requestedSku.length > 0
            ? requestedSku
            : await this.generateVariantSku(trx, product.reference, input);
        await this.assertVariantSku(trx, sku, null);
        const ruleViolation = validateVariantBusinessRules(
          product.category,
          product.material,
          product.product,
          { ...asObject(input.options), ...asObject(input.payload) },
        );
        if (ruleViolation)
          fail(
            422,
            ruleViolation.code,
            ruleViolation.title,
            ruleViolation.detail,
          );
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
            sku,
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
    } catch (error) {
      // The preflight lookup closes the normal path; this catch maps the
      // remaining race where another transaction claims the SKU first.
      if (isVariantSkuUniqueViolation(error))
        fail(
          409,
          "VARIANT_SKU_CONFLICT",
          "Variant conflict",
          "A variant with this SKU already exists. Choose another SKU.",
        );
      throw error;
    }
  }

  /** Génère un SKU lisible et unique lorsque l'interface ne fournit aucun SKU. */
  private async generateVariantSku(
    executor: DbExecutor,
    reference: string,
    input: VariantInput,
  ): Promise<string> {
    const options = asObject(input.options);
    const color = stringValue(options.colorId ?? options.color_id);
    const dimensions = [options.widthCm, options.heightCm]
      .map((value) => numberValue(value, 0))
      .filter((value) => value > 0)
      .join("X");
    const base =
      reference
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "HBS-PRODUIT";
    const suffix = [color, dimensions].filter(Boolean).join("-") || "VAR";
    const prefix = `${base}-${suffix}`.slice(0, 112);
    // SKU uniqueness is global, not scoped to a product.  Check every row so
    // an automatically generated value cannot collide with another product
    // (or with an archived variant retained for order history).
    const existing = await executor
      .selectFrom("catalog.product_variants")
      .select("sku")
      .execute();
    const taken = new Set(existing.map((row) => normalizeVariantSku(row.sku)));
    for (let index = 1; ; index += 1) {
      const candidate = `${prefix}-${String(index).padStart(2, "0")}`;
      if (!taken.has(normalizeVariantSku(candidate))) return candidate;
    }
  }

  async updateVariant(
    productId: string,
    variantId: string,
    patch: VariantPatch,
  ): Promise<AdminProduct> {
    try {
      return await this.database.transaction().execute(async (trx) => {
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
          productVersion(product.version) !== patch.expectedVersion
        )
          fail(
            409,
            "PRODUCT_VERSION_CONFLICT",
            "Product changed",
            "Reload the product before saving this variant.",
          );
        const normalizedSku =
          patch.sku === undefined ? undefined : normalizeVariantSku(patch.sku);
        if (
          normalizedSku !== undefined &&
          normalizedSku !== normalizeVariantSku(current.sku)
        )
          await this.assertVariantSku(trx, normalizedSku, variantId);
        const price = patch.priceAmountMinor ?? current.price_amount_minor;
        const compare =
          patch.compareAtPriceAmountMinor === undefined
            ? current.compare_at_price_amount_minor
            : patch.compareAtPriceAmountMinor;
        const nextOptions = patch.options ?? asObject(current.options);
        const nextPayload = patch.payload ?? asObject(current.payload);
        const ruleViolation = validateVariantBusinessRules(
          product.category,
          product.material,
          product.product,
          { ...asObject(nextOptions), ...asObject(nextPayload) },
        );
        if (ruleViolation)
          fail(
            422,
            ruleViolation.code,
            ruleViolation.title,
            ruleViolation.detail,
          );
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
            ...(normalizedSku === undefined ? {} : { sku: normalizedSku }),
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
    } catch (error) {
      if (isVariantSkuUniqueViolation(error))
        fail(
          409,
          "VARIANT_SKU_CONFLICT",
          "Variant conflict",
          `Le SKU « ${normalizeVariantSku(patch.sku ?? "") || "demandé"} » est déjà utilisé. Choisissez un autre SKU.`,
        );
      throw error;
    }
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

  private async assertProductVariantsBusinessRules(
    executor: DbExecutor,
    productId: string,
    category: unknown,
    material: unknown,
    productPayload: unknown,
  ): Promise<void> {
    const variants = await executor
      .selectFrom("catalog.product_variants")
      .selectAll()
      .where("product_id", "=", productId)
      .where("status", "!=", "archived")
      .execute();
    for (const variant of variants) {
      const ruleViolation = validateVariantBusinessRules(
        category,
        material,
        productPayload,
        { ...asObject(variant.options), ...asObject(variant.payload) },
      );
      if (ruleViolation)
        fail(
          422,
          ruleViolation.code,
          ruleViolation.title,
          ruleViolation.detail,
        );
    }
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

  private async productAttributes(
    executor: DbExecutor,
    productId: string,
  ): Promise<Record<string, unknown>> {
    const rows = await executor
      .selectFrom("catalog.product_attributes as productAttribute")
      .innerJoin(
        "catalog.attributes as attribute",
        "attribute.id",
        "productAttribute.attribute_id",
      )
      .select(["attribute.key", "productAttribute.value"])
      .where("productAttribute.product_id", "=", productId)
      .orderBy("attribute.key")
      .execute();
    return Object.fromEntries(
      rows.map((row) => [row.key, row.value as unknown]),
    );
  }

  private async replaceProductAttributes(
    executor: DbExecutor,
    productId: string,
    categoryId: string | null,
    attributes: Record<string, unknown>,
    requireRequired: boolean,
    legacyMaterial?: string | null,
  ): Promise<void> {
    const materialBinding = categoryId
      ? await executor
          .selectFrom("catalog.category_attributes as categoryAttribute")
          .innerJoin(
            "catalog.attributes as attribute",
            "attribute.id",
            "categoryAttribute.attribute_id",
          )
          .select("attribute.id")
          .where("categoryAttribute.category_id", "=", categoryId)
          .where("attribute.key", "=", "material")
          .where("attribute.is_system", "=", true)
          .where("attribute.status", "!=", "archived")
          .executeTakeFirst()
      : undefined;
    const effectiveAttributes =
      materialBinding && legacyMaterial?.trim()
        ? { ...attributes, material: legacyMaterial.trim() }
        : attributes;
    const { values: normalized, definitions } =
      await this.normalizeProductAttributes(
        executor,
        categoryId,
        effectiveAttributes,
        requireRequired,
      );
    await executor
      .deleteFrom("catalog.product_attributes")
      .where("product_id", "=", productId)
      .execute();
    const entries = Object.entries(normalized);
    if (entries.length === 0) return;
    const rows = entries.map(([key, value]) => {
      const attributeId = definitions[key];
      if (!attributeId)
        fail(
          500,
          "ATTRIBUTE_DEFINITION_MISSING",
          "Attribute definition missing",
          `The definition for '${key}' could not be resolved.`,
        );
      return {
        product_id: productId,
        attribute_id: attributeId,
        // PostgreSQL serializes bound JavaScript strings as text.  This column
        // is JSONB, so bind an explicit JSON representation for every value
        // (including primitive text/number/boolean attributes).
        value: sql`cast(${JSON.stringify(value)} as jsonb)` as unknown as
          Record<string, unknown> | unknown[] | string | number | boolean,
      };
    });
    await executor
      .insertInto("catalog.product_attributes")
      .values(rows)
      .execute();
  }

  private async normalizeProductAttributes(
    executor: DbExecutor,
    categoryId: string | null,
    attributes: Record<string, unknown>,
    requireRequired: boolean,
  ): Promise<{
    values: Record<string, JsonAttributeValue>;
    definitions: Record<string, string>;
  }> {
    if (!categoryId) {
      if (Object.keys(attributes).length > 0 || requireRequired)
        fail(
          422,
          "PRODUCT_CATEGORY_REQUIRED",
          "Product category required",
          "Product attributes require a catalogue category.",
        );
      return { values: {}, definitions: {} };
    }
    const category = await executor
      .selectFrom("catalog.categories")
      .select(["id", "status"])
      .where("id", "=", categoryId)
      .executeTakeFirst();
    if (!category || category.status === "archived")
      fail(
        422,
        "CATEGORY_NOT_FOUND",
        "Invalid category",
        "The selected category does not exist or is archived.",
      );

    const definitions = await executor
      .selectFrom("catalog.attributes")
      .selectAll()
      .where("status", "!=", "archived")
      .execute();
    const definitionByKey = new Map(
      definitions.map((definition) => [definition.key, definition]),
    );
    const bindings = await executor
      .selectFrom("catalog.category_attributes")
      .select(["attribute_id", "category_id", "is_required"])
      .execute();
    const bindingsByAttribute = new Map<string, typeof bindings>();
    for (const binding of bindings) {
      const current = bindingsByAttribute.get(binding.attribute_id) ?? [];
      current.push(binding);
      bindingsByAttribute.set(binding.attribute_id, current);
    }
    const optionRows = definitions.length
      ? await executor
          .selectFrom("catalog.attribute_options")
          .select(["attribute_id", "value", "is_active"])
          .where(
            "attribute_id",
            "in",
            definitions.map((definition) => definition.id),
          )
          .execute()
      : [];
    const optionsByAttribute = new Map<string, Set<string>>();
    for (const option of optionRows) {
      if (!option.is_active) continue;
      const values =
        optionsByAttribute.get(option.attribute_id) ?? new Set<string>();
      values.add(option.value);
      optionsByAttribute.set(option.attribute_id, values);
    }

    const normalized: Record<string, JsonAttributeValue> = {};
    const definitionIds: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(attributes)) {
      const key = rawKey.trim();
      if (!key || !hasAttributeValue(rawValue)) continue;
      const definition = definitionByKey.get(key);
      if (!definition)
        fail(
          422,
          "ATTRIBUTE_NOT_FOUND",
          "Invalid product attribute",
          `The attribute '${key}' does not exist or is archived.`,
        );
      const scopedBindings = bindingsByAttribute.get(definition.id) ?? [];
      if (
        scopedBindings.length > 0 &&
        !scopedBindings.some((binding) => binding.category_id === categoryId)
      )
        fail(
          422,
          "ATTRIBUTE_CATEGORY_MISMATCH",
          "Invalid product attribute",
          `The attribute '${key}' is not available for the selected category.`,
        );
      const value = normalizeAttributeValue(
        definition.value_type,
        rawValue,
        optionsByAttribute.get(definition.id),
        key,
      );
      normalized[key] = value;
      definitionIds[key] = definition.id;
    }

    if (requireRequired) {
      for (const definition of definitions) {
        const scopedBindings = bindingsByAttribute.get(definition.id) ?? [];
        const binding = scopedBindings.find(
          (item) => item.category_id === categoryId,
        );
        const isScoped = scopedBindings.length > 0;
        const required = isScoped
          ? binding !== undefined &&
            (definition.is_required || binding.is_required)
          : definition.is_required;
        if (
          required &&
          !Object.prototype.hasOwnProperty.call(normalized, definition.key)
        )
          fail(
            422,
            "ATTRIBUTE_REQUIRED",
            "Required product attribute missing",
            `The attribute '${definition.name}' is required before publication.`,
          );
      }
    }

    return { values: normalized, definitions: definitionIds };
  }

  private async productRecord(
    executor: DbExecutor,
    row: ProductRow,
  ): Promise<AdminProduct> {
    const productPayload = asObject(row.product);
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
    const attributes = await this.productAttributes(executor, row.id);
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
      version: productVersion(row.version),
      isDemo: row.is_demo,
      isNew: row.is_new,
      isBestSeller: row.is_best_seller,
      isFeatured: row.is_featured,
      isOnSale: booleanValue(productPayload.isOnSale, false),
      payload: productPayload,
      attributes,
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
    const categoryRows = await executor
      .selectFrom("catalog.category_attributes as categoryAttribute")
      .innerJoin(
        "catalog.categories as category",
        "category.id",
        "categoryAttribute.category_id",
      )
      .select(["category.slug", "categoryAttribute.sort_order"])
      .where("categoryAttribute.attribute_id", "=", row.id)
      .where("category.status", "!=", "archived")
      .orderBy("categoryAttribute.sort_order")
      .orderBy("category.slug")
      .execute();
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      valueType: row.value_type,
      isFilterable: row.is_filterable,
      isRequired: row.is_required,
      status: row.status,
      isVariantAxis: row.is_variant_axis,
      sortOrder: row.sort_order,
      isSystem: row.is_system,
      categorySlugs: categoryRows.map((category) => category.slug),
      options: options.map((option) => ({
        id: option.id,
        value: option.value,
        label: option.label,
        sortOrder: option.sort_order,
        hex: option.hex,
        family: option.family,
        isActive: option.is_active,
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

  private async bindSystemAttributesForCategory(
    executor: DbExecutor,
    categoryId: string,
    rootSlug: string,
  ): Promise<void> {
    const keys = SYSTEM_ATTRIBUTE_KEYS_BY_ROOT_CATEGORY[rootSlug];
    if (!keys || keys.length === 0) return;
    const attributes = await executor
      .selectFrom("catalog.attributes")
      .select(["id", "is_required", "sort_order"])
      .where("key", "in", keys)
      .where("is_system", "=", true)
      .where("status", "!=", "archived")
      .execute();
    if (attributes.length === 0) return;
    await executor
      .insertInto("catalog.category_attributes")
      .values(
        attributes.map((attribute) => ({
          category_id: categoryId,
          attribute_id: attribute.id,
          is_required: attribute.is_required,
          sort_order: attribute.sort_order,
        })),
      )
      .onConflict((oc) =>
        oc.columns(["category_id", "attribute_id"]).doUpdateSet((eb) => ({
          is_required: eb.ref("excluded.is_required"),
          sort_order: eb.ref("excluded.sort_order"),
        })),
      )
      .execute();
  }

  private async rootCategorySlug(
    executor: DbExecutor,
    category: CategoryRow,
  ): Promise<string> {
    let current = category;
    const visited = new Set<string>();
    while (current.parent_id) {
      if (visited.has(current.id))
        fail(
          422,
          "CATEGORY_PARENT_INVALID",
          "Invalid category hierarchy",
          "The category hierarchy contains a cycle.",
        );
      visited.add(current.id);
      current = await this.assertCategory(executor, current.parent_id);
    }
    return current.slug;
  }

  private async assertCategoryParent(
    executor: DbExecutor,
    parentId: string | null,
    selfId: string | null,
    childStatus: CategoryStatus,
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
      if (parent.status === "archived")
        fail(
          422,
          "CATEGORY_PARENT_INVALID",
          "Invalid category parent",
          "An archived category cannot contain a child.",
        );
      if (childStatus === "active" && parent.status !== "active")
        fail(
          422,
          "CATEGORY_PARENT_INVALID",
          "Invalid category parent",
          "An active category must have an active parent.",
        );
      if (parent.parent_id)
        fail(
          422,
          "CATEGORY_PARENT_INVALID",
          "Invalid category parent",
          "Category nesting is limited to a root category and one subcategory.",
        );
      cursor = parent.parent_id;
    }
  }

  private async assertCategoryMediaAsset(
    executor: DbExecutor,
    mediaAssetId: string | null | undefined,
  ): Promise<void> {
    if (!mediaAssetId) return;
    const media = await executor
      .selectFrom("content.media_assets")
      .select(["id", "status"])
      .where("id", "=", mediaAssetId)
      .executeTakeFirst();
    if (!media || media.status === "archived")
      fail(
        400,
        "CATEGORY_MEDIA_INVALID",
        "Invalid category media",
        "The category image does not exist or is archived.",
      );
  }

  private async assertCategoryArchivable(
    executor: DbExecutor,
    id: string,
  ): Promise<void> {
    const child = await executor
      .selectFrom("catalog.categories")
      .select("id")
      .where("parent_id", "=", id)
      .where("status", "!=", "archived")
      .executeTakeFirst();
    const product = await executor
      .selectFrom("catalog.product_categories")
      .select("product_id")
      .where("category_id", "=", id)
      .executeTakeFirst();
    const primaryProduct = await executor
      .selectFrom("catalog.products")
      .select("id")
      .where("category_id", "=", id)
      .executeTakeFirst();
    const attribute = await executor
      .selectFrom("catalog.category_attributes")
      .select("attribute_id")
      .where("category_id", "=", id)
      .executeTakeFirst();
    if (child || product || primaryProduct || attribute)
      fail(
        409,
        "CATEGORY_IN_USE",
        "Category in use",
        "A category with children, products or attributes cannot be archived.",
      );
  }

  private async assertAttributeArchivable(
    executor: DbExecutor,
    id: string,
  ): Promise<void> {
    const product = await executor
      .selectFrom("catalog.product_attributes")
      .select("product_id")
      .where("attribute_id", "=", id)
      .executeTakeFirst();
    const category = await executor
      .selectFrom("catalog.category_attributes")
      .select("category_id")
      .where("attribute_id", "=", id)
      .executeTakeFirst();
    if (product || category)
      fail(
        409,
        "ATTRIBUTE_IN_USE",
        "Attribute in use",
        "An attribute used by products or categories cannot be archived.",
      );
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
    const canonicalSku = normalizeVariantSku(sku);
    let query = executor
      .selectFrom("catalog.product_variants as variant")
      .leftJoin(
        "catalog.products as product",
        "product.id",
        "variant.product_id",
      )
      .select([
        "variant.id as variantId",
        "variant.sku as existingSku",
        "variant.status as status",
        "product.reference as productReference",
        "product.name as productName",
      ])
      .where(sql<boolean>`upper(btrim(variant.sku)) = ${canonicalSku}`);
    if (id) query = query.where("variant.id", "!=", id);
    const existing = await query.executeTakeFirst();
    if (existing) {
      const productLabel = existing.productReference
        ? ` du produit « ${existing.productReference} »`
        : "";
      const archivedLabel =
        existing.status === "archived" ? " (variante archivée)" : "";
      fail(
        409,
        "VARIANT_SKU_CONFLICT",
        "Variant conflict",
        `Le SKU « ${canonicalSku} » est déjà utilisé${productLabel}${archivedLabel}. Choisissez un autre SKU.`,
      );
    }
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
    const attributes = await this.productAttributes(executor, productId);
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
      const imageIds = media
        .filter((item) => item.variant_id === variant.id)
        .map((item) => item.id);
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
        imageIds,
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
      attributes,
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

function publicVariantIssues(row: VariantRow): string[] {
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
  const issues: string[] = [];
  if (typeof colorId !== "string" || colorId.trim().length === 0) {
    issues.push("une couleur doit être sélectionnée");
  }
  if (!positiveDimension(width))
    issues.push("la largeur doit être supérieure à 0 cm");
  if (!positiveDimension(height))
    issues.push("la hauteur doit être supérieure à 0 cm");
  return issues;
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
    imageUrl: row.image_url,
    imageMediaAssetId: row.image_media_asset_id,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    showInNavigation: row.show_in_navigation,
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function hasAttributeValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(hasAttributeValue);
  return typeof value === "object" && Object.keys(value).length > 0;
}

function normalizeAttributeValue(
  valueType: AttributeValueType,
  value: unknown,
  allowedOptions: Set<string> | undefined,
  key: string,
): JsonAttributeValue {
  if (valueType === "text") {
    if (
      typeof value !== "string" ||
      value.trim().length === 0 ||
      value.length > 5000
    )
      fail(
        422,
        "ATTRIBUTE_VALUE_INVALID",
        "Invalid product attribute",
        `The value for '${key}' must be a non-empty text of 5000 characters or less.`,
      );
    return value.trim();
  }
  if (valueType === "number") {
    if (typeof value !== "number" || !Number.isFinite(value))
      fail(
        422,
        "ATTRIBUTE_VALUE_INVALID",
        "Invalid product attribute",
        `The value for '${key}' must be a finite number.`,
      );
    return value;
  }
  if (valueType === "boolean") {
    if (typeof value !== "boolean")
      fail(
        422,
        "ATTRIBUTE_VALUE_INVALID",
        "Invalid product attribute",
        `The value for '${key}' must be boolean.`,
      );
    return value;
  }
  if (valueType === "dimension") {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof (value as Record<string, unknown>).value === "number" &&
      Number.isFinite((value as Record<string, unknown>).value) &&
      (value as Record<string, unknown>).unit !== undefined
    )
      return {
        value: (value as Record<string, unknown>).value as number,
        unit: String((value as Record<string, unknown>).unit),
      };
    fail(
      422,
      "ATTRIBUTE_VALUE_INVALID",
      "Invalid product attribute",
      `The value for '${key}' must be a finite measurement.`,
    );
  }

  const candidates = Array.isArray(value) ? value : [value];
  if (
    candidates.length === 0 ||
    candidates.some(
      (candidate) => typeof candidate !== "string" || !candidate.trim(),
    )
  )
    fail(
      422,
      "ATTRIBUTE_VALUE_INVALID",
      "Invalid product attribute",
      `The value for '${key}' must be one or more non-empty options.`,
    );
  const normalized = [
    ...new Set(candidates.map((candidate) => (candidate as string).trim())),
  ];
  if (!allowedOptions || allowedOptions.size === 0)
    fail(
      422,
      "ATTRIBUTE_OPTIONS_REQUIRED",
      "Attribute options missing",
      `The attribute '${key}' has no active options configured.`,
    );
  const invalid = normalized.find(
    (candidate) => !allowedOptions.has(candidate),
  );
  if (invalid)
    fail(
      422,
      "ATTRIBUTE_OPTION_INVALID",
      "Invalid product attribute option",
      `The option '${invalid}' is not active for '${key}'.`,
    );
  const first = normalized[0];
  if (!first)
    fail(
      422,
      "ATTRIBUTE_VALUE_INVALID",
      "Invalid product attribute",
      `The value for '${key}' is empty.`,
    );
  return Array.isArray(value) ? normalized : first;
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
  const prepared = options.map((option, index) => ({
    ...option,
    value: option.value.trim(),
    label: option.label.trim(),
    sortOrder: option.sortOrder ?? index,
  }));
  const seen = new Set<string>();
  for (const option of prepared) {
    if (
      !option.value ||
      !option.label ||
      option.value.length > 160 ||
      option.label.length > 160
    )
      fail(
        422,
        "ATTRIBUTE_OPTION_INVALID",
        "Invalid attribute option",
        "Attribute option values and labels must contain between 1 and 160 characters.",
      );
    if (seen.has(option.value))
      fail(
        409,
        "ATTRIBUTE_OPTION_CONFLICT",
        "Attribute option conflict",
        `The option '${option.value}' is duplicated.`,
      );
    seen.add(option.value);
  }
  const existing = await executor
    .selectFrom("catalog.attribute_options")
    .selectAll()
    .where("attribute_id", "=", attributeId)
    .execute();
  const requestedValues = new Set(prepared.map((option) => option.value));
  for (const option of existing) {
    if (requestedValues.has(option.value)) continue;
    await executor
      .updateTable("catalog.attribute_options")
      .set({ is_active: false })
      .where("id", "=", option.id)
      .executeTakeFirst();
  }
  for (const option of prepared) {
    const current = existing.find((item) => item.value === option.value);
    if (current) {
      await executor
        .updateTable("catalog.attribute_options")
        .set({
          label: option.label,
          sort_order: option.sortOrder,
          hex: option.hex ?? null,
          family: option.family ?? null,
          is_active: option.isActive ?? true,
        })
        .where("id", "=", current.id)
        .executeTakeFirst();
      continue;
    }
    await executor
      .insertInto("catalog.attribute_options")
      .values({
        id: randomUUID(),
        attribute_id: attributeId,
        value: option.value,
        label: option.label,
        sort_order: option.sortOrder,
        hex: option.hex ?? null,
        family: option.family ?? null,
        is_active: option.isActive ?? true,
      })
      .executeTakeFirst();
  }
}

async function replaceAttributeCategories(
  executor: DbExecutor,
  attributeId: string,
  categorySlugs: readonly string[],
): Promise<void> {
  const requested = [
    ...new Set(categorySlugs.map((slug) => slug.trim()).filter(Boolean)),
  ];
  await executor
    .deleteFrom("catalog.category_attributes")
    .where("attribute_id", "=", attributeId)
    .execute();
  if (requested.length === 0) return;

  const categories = await executor
    .selectFrom("catalog.categories")
    .select(["id", "slug"])
    .where("slug", "in", requested)
    .where("status", "!=", "archived")
    .execute();
  const found = new Set(categories.map((category) => category.slug));
  const missing = requested.filter((slug) => !found.has(slug));
  if (missing.length > 0)
    fail(
      422,
      "ATTRIBUTE_CATEGORY_NOT_FOUND",
      "Invalid attribute categories",
      `Unknown category slug(s): ${missing.join(", ")}.`,
    );

  await executor
    .insertInto("catalog.category_attributes")
    .values(
      categories.map((category, index) => ({
        category_id: category.id,
        attribute_id: attributeId,
        is_required: false,
        sort_order: index,
      })),
    )
    .execute();
}
