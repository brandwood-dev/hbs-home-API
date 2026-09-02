import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Selectable, type Transaction } from "kysely";
import type { DatabaseSchema } from "../database/schema.js";
import { AppError } from "../http/problem.js";

type DbExecutor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;
type CategoryRow = Selectable<DatabaseSchema["content.article_categories"]>;
type ArticleRow = Selectable<DatabaseSchema["content.articles"]>;
type RevisionRow = Selectable<DatabaseSchema["content.article_revisions"]>;
type MediaRow = Selectable<DatabaseSchema["content.media_assets"]>;

export type ArticleStatus = "draft" | "published" | "archived";
export type ArticleBlock = Record<string, unknown>;

export interface ArticleCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
}

export interface PublicArticleSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: ArticleCategory;
  cover: {
    publicUrl: string;
    alt: string;
    width: number | null;
    height: number | null;
  } | null;
  readingTimeMinutes: number;
  authorName: string;
  publishedAt: string;
  updatedAt: string;
  isFeatured: boolean;
}

export interface PublicArticle extends PublicArticleSummary {
  bodyBlocks: readonly ArticleBlock[];
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface PublicArticleList {
  items: readonly PublicArticleSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ArticleRevision {
  id: string;
  status: ArticleStatus;
  version: number;
  title: string;
  excerpt: string;
  bodyBlocks: readonly ArticleBlock[];
  cover: {
    id: string;
    publicUrl: string;
    alt: string;
    width: number | null;
    height: number | null;
  } | null;
  readingTimeMinutes: number;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminArticle {
  id: string;
  slug: string;
  status: ArticleStatus;
  category: ArticleCategory;
  isFeatured: boolean;
  homeSortOrder: number;
  authorName: string;
  publishedAt: string | null;
  updatedAt: string;
  version: number;
  draft: ArticleRevision | null;
  published: ArticleRevision | null;
}

export interface AdminArticleInput {
  slug: string;
  categoryId: string;
  title: string;
  excerpt: string;
  bodyBlocks: readonly ArticleBlock[];
  coverMediaAssetId: string | null;
  readingTimeMinutes?: number;
  seoTitle?: string | null;
  seoDescription?: string | null;
  isFeatured?: boolean;
  homeSortOrder?: number;
  authorName?: string;
}

export type AdminArticlePatch = Partial<AdminArticleInput> & {
  expectedVersion?: number;
};

export interface AdminArticleRepository {
  list(input: {
    query?: string;
    status?: ArticleStatus;
    categoryId?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: readonly AdminArticle[]; total: number }>;
  get(id: string): Promise<AdminArticle | null>;
  create(input: AdminArticleInput, actorUserId: string): Promise<AdminArticle>;
  update(
    id: string,
    patch: AdminArticlePatch,
    actorUserId: string,
  ): Promise<AdminArticle>;
  publish(id: string, actorUserId: string): Promise<AdminArticle>;
  archive(id: string, actorUserId: string): Promise<AdminArticle>;
  delete(id: string, actorUserId: string): Promise<void>;
  duplicate(id: string, actorUserId: string): Promise<AdminArticle>;
  listCategories(activeOnly?: boolean): Promise<readonly ArticleCategory[]>;
}

export interface ArticleRepository extends AdminArticleRepository {
  listPublic(input: {
    query?: string;
    category?: string;
    featured?: boolean;
    page: number;
    pageSize: number;
  }): Promise<PublicArticleList>;
  getPublicBySlug(slug: string): Promise<PublicArticle | null>;
}

function fail(
  statusCode: number,
  code: string,
  title: string,
  detail: string,
): never {
  throw new AppError({ statusCode, code, title, detail });
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function requiredIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function requiredText(
  value: string | undefined,
  field: string,
  min = 1,
  max = 240,
): string {
  const normalized = value?.trim() ?? "";
  if (normalized.length < min || normalized.length > max) {
    fail(
      400,
      "ARTICLE_VALIDATION_ERROR",
      "Invalid article",
      `${field} must contain ${String(min)} to ${String(max)} characters.`,
    );
  }
  return normalized;
}

function normalizeSlug(value: string | undefined): string {
  const slug = requiredText(value, "slug", 1, 160).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail(
      400,
      "ARTICLE_VALIDATION_ERROR",
      "Invalid article",
      "slug must contain lowercase letters, numbers and single hyphens only.",
    );
  }
  return slug;
}

function nullableText(
  value: string | null | undefined,
  field: string,
  max: number,
): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (!normalized)
    fail(
      400,
      "ARTICLE_VALIDATION_ERROR",
      "Invalid article",
      `${field} must be null or non-empty.`,
    );
  if (normalized.length > max)
    fail(
      400,
      "ARTICLE_VALIDATION_ERROR",
      "Invalid article",
      `${field} is too long.`,
    );
  return normalized;
}

function isSafeArticleUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value.startsWith("/") || value.startsWith("https://"))
  );
}

function blocks(value: readonly ArticleBlock[] | undefined): ArticleBlock[] {
  const items = [...(value ?? [])];
  if (items.length === 0)
    fail(
      400,
      "ARTICLE_VALIDATION_ERROR",
      "Invalid article",
      "bodyBlocks must contain at least one block.",
    );
  if (items.length > 100)
    fail(
      400,
      "ARTICLE_VALIDATION_ERROR",
      "Invalid article",
      "bodyBlocks cannot contain more than 100 blocks.",
    );
  return items.map((block, index) => {
    if (Array.isArray(block) || typeof block !== "object") {
      fail(
        400,
        "ARTICLE_VALIDATION_ERROR",
        "Invalid article",
        `bodyBlocks[${String(index)}] must be a JSON object.`,
      );
    }
    const type = block.type;
    if (
      typeof type !== "string" ||
      !/^(heading|paragraph|image|quote|product_link|product_grid|cta)$/.test(
        type,
      )
    ) {
      fail(
        400,
        "ARTICLE_VALIDATION_ERROR",
        "Invalid article",
        `bodyBlocks[${String(index)}].type is not supported.`,
      );
    }
    if (JSON.stringify(block).length > 64_000) {
      fail(
        400,
        "ARTICLE_VALIDATION_ERROR",
        "Invalid article",
        `bodyBlocks[${String(index)}] is too large.`,
      );
    }
    if (type === "image" && !isSafeArticleUrl(block.src)) {
      fail(
        400,
        "ARTICLE_VALIDATION_ERROR",
        "Invalid article",
        `bodyBlocks[${String(index)}].src must be a relative or HTTPS URL.`,
      );
    }
    if (
      (type === "cta" || type === "product_link") &&
      !isSafeArticleUrl(block.href)
    ) {
      fail(
        400,
        "ARTICLE_VALIDATION_ERROR",
        "Invalid article",
        `bodyBlocks[${String(index)}].href must be a relative or HTTPS URL.`,
      );
    }
    return { ...block };
  });
}

function categoryRecord(row: CategoryRow): ArticleCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
  };
}

function mediaRecord(row: MediaRow | null): ArticleRevision["cover"] {
  if (!row || row.status === "archived") return null;
  return {
    id: row.id,
    publicUrl: row.public_url,
    alt: row.alt,
    width: row.width,
    height: row.height,
  };
}

function revisionRecord(
  row: RevisionRow,
  media: MediaRow | null,
): ArticleRevision {
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    title: row.title,
    excerpt: row.excerpt,
    bodyBlocks: row.body_blocks,
    cover: mediaRecord(media),
    readingTimeMinutes: row.reading_time_minutes,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    createdAt: requiredIso(row.created_at),
    updatedAt: requiredIso(row.updated_at),
  };
}

interface ArticleBundle {
  article: ArticleRow;
  category: CategoryRow;
  draft: RevisionRow | null;
  published: RevisionRow | null;
  draftMedia: MediaRow | null;
  publishedMedia: MediaRow | null;
}

function adminRecord(bundle: ArticleBundle): AdminArticle {
  return {
    id: bundle.article.id,
    slug: bundle.article.slug,
    status: bundle.article.status,
    category: categoryRecord(bundle.category),
    isFeatured: bundle.article.is_featured,
    homeSortOrder: bundle.article.home_sort_order,
    authorName: bundle.article.author_name,
    publishedAt: iso(bundle.article.published_at),
    updatedAt: requiredIso(bundle.article.updated_at),
    version: bundle.draft?.version ?? bundle.published?.version ?? 1,
    draft: bundle.draft
      ? revisionRecord(bundle.draft, bundle.draftMedia)
      : null,
    published: bundle.published
      ? revisionRecord(bundle.published, bundle.publishedMedia)
      : null,
  };
}

function requireBundle(bundle: ArticleBundle | null): ArticleBundle {
  if (!bundle) throw new Error("Article disappeared during the transaction.");
  return bundle;
}

function publicRecord(bundle: ArticleBundle): PublicArticle | null {
  if (
    bundle.article.status !== "published" ||
    !bundle.published ||
    !bundle.article.published_at
  )
    return null;
  const revision = bundle.published;
  return {
    id: bundle.article.id,
    slug: bundle.article.slug,
    title: revision.title,
    excerpt: revision.excerpt,
    category: categoryRecord(bundle.category),
    cover: mediaRecord(bundle.publishedMedia),
    readingTimeMinutes: revision.reading_time_minutes,
    authorName: bundle.article.author_name,
    publishedAt: requiredIso(bundle.article.published_at),
    updatedAt: requiredIso(bundle.article.updated_at),
    isFeatured: bundle.article.is_featured,
    bodyBlocks: revision.body_blocks,
    seoTitle: revision.seo_title,
    seoDescription: revision.seo_description,
  };
}

export class PostgresAdminArticleRepository implements ArticleRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async listCategories(activeOnly = true): Promise<readonly ArticleCategory[]> {
    const query = this.database
      .selectFrom("content.article_categories")
      .selectAll();
    const rows = await (
      activeOnly ? query.where("is_active", "=", true) : query
    )
      .orderBy("sort_order", "asc")
      .orderBy("name", "asc")
      .execute();
    return rows.map(categoryRecord);
  }

  private async bundle(
    executor: DbExecutor,
    id: string,
  ): Promise<ArticleBundle | null> {
    const article = await executor
      .selectFrom("content.articles")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!article) return null;
    const category = await executor
      .selectFrom("content.article_categories")
      .selectAll()
      .where("id", "=", article.category_id)
      .executeTakeFirst();
    if (!category) return null;
    const revisions = await executor
      .selectFrom("content.article_revisions")
      .selectAll()
      .where("article_id", "=", id)
      .where("status", "in", ["draft", "published"])
      .execute();
    const mediaIds = revisions
      .map((revision) => revision.cover_media_asset_id)
      .filter((value): value is string => Boolean(value));
    const media =
      mediaIds.length === 0
        ? []
        : await executor
            .selectFrom("content.media_assets")
            .selectAll()
            .where("id", "in", mediaIds)
            .execute();
    const mediaById = new Map(media.map((row) => [row.id, row]));
    const draft =
      revisions.find((revision) => revision.status === "draft") ?? null;
    const published =
      revisions.find((revision) => revision.status === "published") ?? null;
    return {
      article,
      category,
      draft,
      published,
      draftMedia: draft?.cover_media_asset_id
        ? (mediaById.get(draft.cover_media_asset_id) ?? null)
        : null,
      publishedMedia: published?.cover_media_asset_id
        ? (mediaById.get(published.cover_media_asset_id) ?? null)
        : null,
    };
  }

  async list(input: {
    query?: string;
    status?: ArticleStatus;
    categoryId?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: readonly AdminArticle[]; total: number }> {
    let filtered = this.database.selectFrom("content.articles");
    if (input.status) filtered = filtered.where("status", "=", input.status);
    if (input.categoryId)
      filtered = filtered.where("category_id", "=", input.categoryId);
    if (input.query?.trim()) {
      const query = `%${input.query.trim().replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      filtered = filtered.where((eb) =>
        eb.or([
          eb("slug", "ilike", query),
          eb.exists(
            eb
              .selectFrom("content.article_revisions as search_revisions")
              .select("search_revisions.id")
              .whereRef(
                "search_revisions.article_id",
                "=",
                "content.articles.id",
              )
              .where("search_revisions.title", "ilike", query),
          ),
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
    const bundles = await Promise.all(
      rows.map((row) => this.bundle(this.database, row.id)),
    );
    return {
      total: Number.parseInt(String(count.count), 10),
      items: bundles
        .filter((item): item is ArticleBundle => item !== null)
        .map(adminRecord),
    };
  }

  async get(id: string): Promise<AdminArticle | null> {
    const item = await this.bundle(this.database, id);
    return item ? adminRecord(item) : null;
  }

  private async category(
    executor: DbExecutor,
    id: string,
  ): Promise<CategoryRow> {
    const row = await executor
      .selectFrom("content.article_categories")
      .selectAll()
      .where("id", "=", id)
      .where("is_active", "=", true)
      .executeTakeFirst();
    if (!row)
      fail(
        400,
        "ARTICLE_CATEGORY_INVALID",
        "Invalid article category",
        "The selected category does not exist or is inactive.",
      );
    return row;
  }

  private async media(
    executor: DbExecutor,
    id: string | null,
  ): Promise<MediaRow | null> {
    if (!id) return null;
    const row = await executor
      .selectFrom("content.media_assets")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row || row.status === "archived")
      fail(
        400,
        "ARTICLE_MEDIA_INVALID",
        "Invalid article media",
        "The cover media asset does not exist or is archived.",
      );
    return row;
  }

  private validateInput(
    input: AdminArticleInput | AdminArticlePatch,
    current?: { article: ArticleRow; draft: RevisionRow | null },
  ): {
    slug: string;
    categoryId: string;
    title: string;
    excerpt: string;
    bodyBlocks: ArticleBlock[];
    coverMediaAssetId: string | null;
    readingTimeMinutes: number;
    seoTitle: string | null;
    seoDescription: string | null;
    isFeatured: boolean;
    homeSortOrder: number;
    authorName: string;
  } {
    const draft = current?.draft ?? null;
    const article = current?.article;
    const slug = normalizeSlug(input.slug ?? article?.slug);
    const categoryId = input.categoryId ?? article?.category_id;
    if (!categoryId)
      fail(
        400,
        "ARTICLE_VALIDATION_ERROR",
        "Invalid article",
        "categoryId is required.",
      );
    const title = requiredText(input.title ?? draft?.title, "title", 1, 240);
    const excerpt = requiredText(
      input.excerpt ?? draft?.excerpt,
      "excerpt",
      1,
      600,
    );
    const bodyBlocks =
      input.bodyBlocks === undefined
        ? blocks(draft?.body_blocks)
        : blocks(input.bodyBlocks);
    const coverMediaAssetId =
      input.coverMediaAssetId === undefined
        ? (draft?.cover_media_asset_id ?? null)
        : input.coverMediaAssetId;
    const readingTimeMinutes =
      input.readingTimeMinutes ??
      draft?.reading_time_minutes ??
      Math.max(1, Math.ceil(JSON.stringify(bodyBlocks).length / 1200));
    if (
      !Number.isInteger(readingTimeMinutes) ||
      readingTimeMinutes < 1 ||
      readingTimeMinutes > 120
    )
      fail(
        400,
        "ARTICLE_VALIDATION_ERROR",
        "Invalid article",
        "readingTimeMinutes must be between 1 and 120.",
      );
    const homeSortOrder = input.homeSortOrder ?? article?.home_sort_order ?? 0;
    if (!Number.isInteger(homeSortOrder) || homeSortOrder < 0)
      fail(
        400,
        "ARTICLE_VALIDATION_ERROR",
        "Invalid article",
        "homeSortOrder must be a non-negative integer.",
      );
    return {
      slug,
      categoryId,
      title,
      excerpt,
      bodyBlocks,
      coverMediaAssetId,
      readingTimeMinutes,
      seoTitle: nullableText(
        input.seoTitle === undefined ? draft?.seo_title : input.seoTitle,
        "seoTitle",
        160,
      ),
      seoDescription: nullableText(
        input.seoDescription === undefined
          ? draft?.seo_description
          : input.seoDescription,
        "seoDescription",
        320,
      ),
      isFeatured: input.isFeatured ?? article?.is_featured ?? false,
      homeSortOrder,
      authorName: requiredText(
        input.authorName ?? article?.author_name ?? "HBS HOME",
        "authorName",
        1,
        120,
      ),
    };
  }

  private async createDraft(
    executor: DbExecutor,
    articleId: string,
    input: ReturnType<PostgresAdminArticleRepository["validateInput"]>,
    actorUserId: string,
    version: number,
  ): Promise<void> {
    await this.category(executor, input.categoryId);
    await this.media(executor, input.coverMediaAssetId);
    await executor
      .insertInto("content.article_revisions")
      .values({
        article_id: articleId,
        status: "draft",
        version,
        title: input.title,
        excerpt: input.excerpt,
        // PostgreSQL does not infer JSONB from a JavaScript object/array
        // binding reliably through pg. Bind an explicit JSONB expression so
        // article creation and updates work with the same contract as the
        // other JSONB-backed repositories.
        body_blocks:
          sql`cast(${JSON.stringify(input.bodyBlocks)} as jsonb)` as unknown as readonly Record<
            string,
            unknown
          >[],
        cover_media_asset_id: input.coverMediaAssetId,
        reading_time_minutes: input.readingTimeMinutes,
        seo_title: input.seoTitle,
        seo_description: input.seoDescription,
        created_by: actorUserId,
      })
      .execute();
  }

  async create(
    input: AdminArticleInput,
    actorUserId: string,
  ): Promise<AdminArticle> {
    const values = this.validateInput(input);
    try {
      return await this.database.transaction().execute(async (trx) => {
        await this.category(trx, values.categoryId);
        const article = await trx
          .insertInto("content.articles")
          .values({
            slug: values.slug,
            category_id: values.categoryId,
            status: "draft",
            is_featured: values.isFeatured,
            home_sort_order: values.homeSortOrder,
            author_name: values.authorName,
            published_at: null,
            created_by: actorUserId,
            updated_by: actorUserId,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await this.createDraft(trx, article.id, values, actorUserId, 1);
        return adminRecord(requireBundle(await this.bundle(trx, article.id)));
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "23505"
      )
        fail(
          409,
          "ARTICLE_SLUG_CONFLICT",
          "Article conflict",
          "An article already exists for this slug.",
        );
      throw error;
    }
  }

  async update(
    id: string,
    patch: AdminArticlePatch,
    actorUserId: string,
  ): Promise<AdminArticle> {
    return this.database.transaction().execute(async (trx) => {
      const current = await this.bundle(trx, id);
      if (!current)
        fail(
          404,
          "ARTICLE_NOT_FOUND",
          "Article not found",
          "The requested article does not exist.",
        );
      if (!current.draft)
        fail(
          409,
          "ARTICLE_DRAFT_REQUIRED",
          "Draft required",
          "Duplicate the published article before editing it.",
        );
      if (
        patch.expectedVersion !== undefined &&
        patch.expectedVersion !== current.draft.version
      )
        fail(
          409,
          "ARTICLE_VERSION_CONFLICT",
          "Article conflict",
          "The article changed since it was loaded. Reload before saving.",
        );
      const values = this.validateInput(patch, current);
      await this.category(trx, values.categoryId);
      await this.media(trx, values.coverMediaAssetId);
      const nextVersion = current.draft.version + 1;
      await trx
        .updateTable("content.articles")
        .set({
          slug: values.slug,
          category_id: values.categoryId,
          is_featured: values.isFeatured,
          home_sort_order: values.homeSortOrder,
          author_name: values.authorName,
          updated_by: actorUserId,
        })
        .where("id", "=", id)
        .execute();
      await trx
        .updateTable("content.article_revisions")
        .set({ status: "archived" })
        .where("id", "=", current.draft.id)
        .execute();
      await this.createDraft(trx, id, values, actorUserId, nextVersion);
      return adminRecord(requireBundle(await this.bundle(trx, id)));
    });
  }

  async publish(id: string, actorUserId: string): Promise<AdminArticle> {
    return this.database.transaction().execute(async (trx) => {
      const current = await this.bundle(trx, id);
      if (!current)
        fail(
          404,
          "ARTICLE_NOT_FOUND",
          "Article not found",
          "The requested article does not exist.",
        );
      if (!current.draft)
        fail(
          409,
          "ARTICLE_DRAFT_REQUIRED",
          "Draft required",
          "Create a draft before publishing.",
        );
      await this.category(trx, current.article.category_id);
      if (!current.draft.cover_media_asset_id)
        fail(
          400,
          "ARTICLE_COVER_REQUIRED",
          "Article cover required",
          "A published article must have an active cover media asset.",
        );
      await this.media(trx, current.draft.cover_media_asset_id);
      await trx
        .updateTable("content.article_revisions")
        .set({ status: "archived" })
        .where("article_id", "=", id)
        .where("status", "=", "published")
        .execute();
      await trx
        .updateTable("content.article_revisions")
        .set({ status: "published" })
        .where("id", "=", current.draft.id)
        .execute();
      await trx
        .updateTable("content.articles")
        .set({
          status: "published",
          published_at: new Date(),
          updated_by: actorUserId,
        })
        .where("id", "=", id)
        .execute();
      return adminRecord(requireBundle(await this.bundle(trx, id)));
    });
  }

  async archive(id: string, actorUserId: string): Promise<AdminArticle> {
    const row = await this.database
      .updateTable("content.articles")
      .set({ status: "archived", is_featured: false, updated_by: actorUserId })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
    if (!row)
      fail(
        404,
        "ARTICLE_NOT_FOUND",
        "Article not found",
        "The requested article does not exist.",
      );
    return adminRecord(requireBundle(await this.bundle(this.database, id)));
  }

  async delete(id: string): Promise<void> {
    await this.database.transaction().execute(async (trx) => {
      const article = await trx
        .selectFrom("content.articles")
        .select(["id", "status"])
        .where("id", "=", id)
        .executeTakeFirst();
      if (!article)
        fail(
          404,
          "ARTICLE_NOT_FOUND",
          "Article not found",
          "The requested article does not exist.",
        );
      if (article.status !== "archived")
        fail(
          409,
          "ARTICLE_ARCHIVE_REQUIRED",
          "Archive required",
          "Only archived articles can be permanently deleted.",
        );
      await trx.deleteFrom("content.articles").where("id", "=", id).execute();
    });
  }

  async duplicate(id: string, actorUserId: string): Promise<AdminArticle> {
    return this.database.transaction().execute(async (trx) => {
      const current = await this.bundle(trx, id);
      if (!current)
        fail(
          404,
          "ARTICLE_NOT_FOUND",
          "Article not found",
          "The requested article does not exist.",
        );
      const source = current.draft ?? current.published;
      if (!source)
        fail(
          409,
          "ARTICLE_CONTENT_MISSING",
          "Article content missing",
          "The article has no content to duplicate.",
        );
      const slug = `${current.article.slug}-copie-${randomUUID().slice(0, 8)}`;
      const article = await trx
        .insertInto("content.articles")
        .values({
          slug,
          category_id: current.article.category_id,
          status: "draft",
          is_featured: false,
          home_sort_order: current.article.home_sort_order,
          author_name: current.article.author_name,
          published_at: null,
          created_by: actorUserId,
          updated_by: actorUserId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("content.article_revisions")
        .values({
          article_id: article.id,
          status: "draft",
          version: 1,
          title: source.title,
          excerpt: source.excerpt,
          body_blocks:
            sql`cast(${JSON.stringify(source.body_blocks)} as jsonb)` as unknown as readonly Record<
              string,
              unknown
            >[],
          cover_media_asset_id: source.cover_media_asset_id,
          reading_time_minutes: source.reading_time_minutes,
          seo_title: source.seo_title,
          seo_description: source.seo_description,
          created_by: actorUserId,
        })
        .execute();
      return adminRecord(requireBundle(await this.bundle(trx, article.id)));
    });
  }

  async listPublic(input: {
    query?: string;
    category?: string;
    featured?: boolean;
    page: number;
    pageSize: number;
  }): Promise<PublicArticleList> {
    let filtered = this.database
      .selectFrom("content.articles as articles")
      .innerJoin(
        "content.article_categories as categories",
        "categories.id",
        "articles.category_id",
      )
      .innerJoin("content.article_revisions as revisions", (join) =>
        join
          .onRef("revisions.article_id", "=", "articles.id")
          .on("revisions.status", "=", "published"),
      )
      .where("articles.status", "=", "published")
      .where("categories.is_active", "=", true);
    if (input.category)
      filtered = filtered.where("categories.slug", "=", input.category);
    if (input.featured !== undefined)
      filtered = filtered.where("articles.is_featured", "=", input.featured);
    if (input.query?.trim()) {
      const query = `%${input.query.trim().replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      filtered = filtered.where((eb) =>
        eb.or([
          eb("revisions.title", "ilike", query),
          eb("revisions.excerpt", "ilike", query),
          eb("categories.name", "ilike", query),
        ]),
      );
    }
    const count = await filtered
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    const rows = await filtered
      .select(["articles.id"])
      .orderBy("articles.is_featured", "desc")
      .orderBy("articles.home_sort_order", "asc")
      .orderBy("articles.published_at", "desc")
      .orderBy("articles.id", "desc")
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize)
      .execute();
    const bundles = await Promise.all(
      rows.map((row) => this.bundle(this.database, row.id)),
    );
    const items = bundles
      .filter((item): item is ArticleBundle => item !== null)
      .map(publicRecord)
      .filter((item): item is PublicArticle => item !== null)
      .map((item) => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        excerpt: item.excerpt,
        category: item.category,
        cover: item.cover,
        readingTimeMinutes: item.readingTimeMinutes,
        authorName: item.authorName,
        publishedAt: item.publishedAt,
        updatedAt: item.updatedAt,
        isFeatured: item.isFeatured,
      }));
    const total = Number.parseInt(String(count.count), 10);
    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
    };
  }

  async getPublicBySlug(slug: string): Promise<PublicArticle | null> {
    const article = await this.database
      .selectFrom("content.articles")
      .select("id")
      .where("slug", "=", slug.trim().toLowerCase())
      .where("status", "=", "published")
      .executeTakeFirst();
    if (!article) return null;
    const bundle = await this.bundle(this.database, article.id);
    return bundle ? publicRecord(bundle) : null;
  }
}
