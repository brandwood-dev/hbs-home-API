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

    const categoryIds = rows.map((row) => row.id);
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
        imageUrl: row.image_url,
        seoTitle: row.seo_title,
        seoDescription: row.seo_description,
        attributes: attributesByCategory.get(row.id) ?? [],
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
