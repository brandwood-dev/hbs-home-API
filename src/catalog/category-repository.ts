import type { Kysely, Selectable } from "kysely";
import type { DatabaseSchema } from "../database/schema.js";

type CategoryRow = Selectable<DatabaseSchema["catalog.categories"]>;
type AttributeRow = Selectable<DatabaseSchema["catalog.attributes"]>;

export interface PublicCategoryAttributeOption {
  value: string;
  label: string;
  sortOrder: number;
  hex: string | null;
  family: string | null;
}

export interface PublicCategoryAttribute {
  key: string;
  name: string;
  valueType: AttributeRow["value_type"];
  isRequired: boolean;
  sortOrder: number;
  options: readonly PublicCategoryAttributeOption[];
}

/** Lightweight product preview used by the desktop mega-menu. */
export interface PublicCategoryLatestProduct {
  slug: string;
  name: string;
  imageUrl: string;
  imageAlt: string;
  createdAt: string;
}

export interface PublicCategory {
  slug: string;
  name: string;
  description: string | null;
  parentSlug: string | null;
  path: string;
  imageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  attributes: readonly PublicCategoryAttribute[];
  latestProduct: PublicCategoryLatestProduct | null;
  children: readonly PublicCategory[];
}

export interface PublicCategoryRepository {
  listCategories(options?: {
    navigationOnly?: boolean;
  }): Promise<readonly PublicCategory[]>;
  getCategory(slug: string): Promise<PublicCategory | null>;
}

function pathFor(
  row: CategoryRow,
  byId: ReadonlyMap<string, CategoryRow>,
): string {
  const segments: string[] = [];
  let current: CategoryRow | undefined = row;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    segments.unshift(current.slug);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return `/${segments.join("/")}`;
}

interface LatestProductRow {
  categoryId: string;
  slug: string;
  name: string;
  imageAlt: string | null;
  payload: Record<string, unknown>;
  createdAt: Date | string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function isoDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString();
}

function latestProductPreview(
  row: LatestProductRow,
): PublicCategoryLatestProduct | null {
  const payload = asRecord(row.payload);
  const images = Array.isArray(payload.images)
    ? payload.images.map(asRecord)
    : [];
  const image =
    images.find(
      (candidate) =>
        asNonEmptyString(candidate.type) === "front" &&
        asNonEmptyString(candidate.url),
    ) ?? images.find((candidate) => asNonEmptyString(candidate.url));
  const imageUrl = asNonEmptyString(image?.url);

  // Legacy products may only carry media on their default variant.
  const variants = Array.isArray(payload.variants)
    ? payload.variants.map(asRecord)
    : [];
  const fallbackVariant = variants.find((variant) =>
    asNonEmptyString(variant.imageUrl ?? variant.image_url),
  );
  const resolvedImageUrl =
    imageUrl ??
    asNonEmptyString(fallbackVariant?.imageUrl ?? fallbackVariant?.image_url);
  if (!resolvedImageUrl) return null;

  return {
    slug: row.slug,
    name: row.name,
    imageUrl: resolvedImageUrl,
    imageAlt:
      asNonEmptyString(image?.alt) ??
      asNonEmptyString(row.imageAlt) ??
      `Produit ${row.name}`,
    createdAt: isoDate(row.createdAt),
  };
}

export class PostgresPublicCategoryRepository implements PublicCategoryRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async listCategories(
    options: { navigationOnly?: boolean } = {},
  ): Promise<readonly PublicCategory[]> {
    const rows = await this.database
      .selectFrom("catalog.categories")
      .selectAll()
      .where("status", "=", "active")
      .orderBy("sort_order")
      .orderBy("name")
      .orderBy("id")
      .execute();

    if (rows.length === 0) return [];

    const mediaAssetIds = [
      ...new Set(
        rows
          .map((row) => row.image_media_asset_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const mediaUrls =
      mediaAssetIds.length === 0
        ? []
        : await this.database
            .selectFrom("content.media_assets")
            .select(["id", "public_url as publicUrl"])
            .where("id", "in", mediaAssetIds)
            .where("status", "=", "active")
            .execute();
    const publicUrlByMediaId = new Map(
      mediaUrls.map((asset) => [asset.id, asset.publicUrl]),
    );

    const categoryIds = rows.map((row) => row.id);
    // Fetch the newest published product with usable media for every
    // category in one query. The frontend can then build its two menu cards
    // without issuing one request per sub-category.
    const latestProductRows = await this.database
      .selectFrom("catalog.product_categories as productCategory")
      .innerJoin(
        "catalog.products as product",
        "product.id",
        "productCategory.product_id",
      )
      .select([
        "productCategory.category_id as categoryId",
        "product.slug as slug",
        "product.name as name",
        "product.image_alt as imageAlt",
        "product.product as payload",
        "product.created_at as createdAt",
      ])
      .where("productCategory.category_id", "in", categoryIds)
      .where("product.status", "=", "active")
      .where("product.is_published", "=", true)
      .orderBy("product.created_at", "desc")
      .orderBy("product.id", "desc")
      .execute();
    const latestProductByCategory = new Map<
      string,
      PublicCategoryLatestProduct
    >();
    for (const row of latestProductRows as LatestProductRow[]) {
      if (latestProductByCategory.has(row.categoryId)) continue;
      const preview = latestProductPreview(row);
      if (preview) latestProductByCategory.set(row.categoryId, preview);
    }

    const attributeRows = await this.database
      .selectFrom("catalog.category_attributes as categoryAttribute")
      .innerJoin(
        "catalog.attributes as attribute",
        "attribute.id",
        "categoryAttribute.attribute_id",
      )
      .select([
        "categoryAttribute.category_id as categoryId",
        "categoryAttribute.is_required as isRequired",
        "categoryAttribute.sort_order as sortOrder",
        "attribute.key as key",
        "attribute.name as name",
        "attribute.value_type as valueType",
      ])
      .where("categoryAttribute.category_id", "in", categoryIds)
      .where("attribute.status", "=", "active")
      .where("attribute.is_filterable", "=", true)
      .orderBy("categoryAttribute.sort_order")
      .orderBy("attribute.name")
      .execute();

    const attributeIds = [...new Set(attributeRows.map((row) => row.key))];
    const optionsByAttribute = new Map<
      string,
      PublicCategoryAttributeOption[]
    >();
    if (attributeIds.length > 0) {
      const optionRows = await this.database
        .selectFrom("catalog.attribute_options as option")
        .innerJoin(
          "catalog.attributes as attribute",
          "attribute.id",
          "option.attribute_id",
        )
        .select([
          "attribute.key as attributeKey",
          "option.value as value",
          "option.label as label",
          "option.sort_order as sortOrder",
          "option.hex as hex",
          "option.family as family",
        ])
        .where("attribute.key", "in", attributeIds)
        .where("option.is_active", "=", true)
        .orderBy("option.sort_order")
        .orderBy("option.label")
        .execute();

      for (const row of optionRows) {
        const list = optionsByAttribute.get(row.attributeKey) ?? [];
        list.push({
          value: row.value,
          label: row.label,
          sortOrder: row.sortOrder,
          hex: row.hex,
          family: row.family,
        });
        optionsByAttribute.set(row.attributeKey, list);
      }
    }

    const byId = new Map(rows.map((row) => [row.id, row]));
    const attributesByCategory = new Map<string, PublicCategoryAttribute[]>();
    for (const row of attributeRows) {
      const list = attributesByCategory.get(row.categoryId) ?? [];
      list.push({
        key: row.key,
        name: row.name,
        valueType: row.valueType,
        isRequired: row.isRequired,
        sortOrder: row.sortOrder,
        options: optionsByAttribute.get(row.key) ?? [],
      });
      attributesByCategory.set(row.categoryId, list);
    }

    const publicById = new Map<string, PublicCategory>();
    for (const row of rows) {
      publicById.set(row.id, {
        slug: row.slug,
        name: row.name,
        description: row.description,
        parentSlug: row.parent_id
          ? (byId.get(row.parent_id)?.slug ?? null)
          : null,
        path: pathFor(row, byId),
        imageUrl:
          row.image_url ??
          (row.image_media_asset_id
            ? (publicUrlByMediaId.get(row.image_media_asset_id) ?? null)
            : null),
        seoTitle: row.seo_title,
        seoDescription: row.seo_description,
        attributes: attributesByCategory.get(row.id) ?? [],
        latestProduct: latestProductByCategory.get(row.id) ?? null,
        children: [],
      });
    }

    const roots: PublicCategory[] = [];
    for (const row of rows) {
      const category = publicById.get(row.id);
      if (!category) continue;
      const parent = row.parent_id ? publicById.get(row.parent_id) : undefined;
      if (parent) {
        (parent.children as PublicCategory[]).push(category);
      } else {
        roots.push(category);
      }
    }

    if (!options.navigationOnly) return roots;

    const visibleBySlug = new Map(
      rows.map((row) => [row.slug, row.show_in_navigation]),
    );
    const filterNavigation = (
      items: readonly PublicCategory[],
    ): PublicCategory[] =>
      items.flatMap((item) => {
        if (!visibleBySlug.get(item.slug)) return [];
        return [
          {
            ...item,
            children: filterNavigation(item.children),
          },
        ];
      });
    return filterNavigation(roots);
  }

  async getCategory(slug: string): Promise<PublicCategory | null> {
    const normalized = slug.trim().toLowerCase();
    if (!normalized) return null;
    const categories = await this.listCategories();
    const stack = [...categories];
    while (stack.length > 0) {
      const category = stack.shift();
      if (!category) continue;
      if (category.slug === normalized) return category;
      stack.push(...category.children);
    }
    return null;
  }
}
