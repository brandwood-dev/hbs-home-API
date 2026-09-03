import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Selectable, type Transaction } from "kysely";
import type { DatabaseSchema } from "../database/schema.js";
import { AppError } from "../http/problem.js";

type MediaRow = Selectable<DatabaseSchema["content.media_assets"]>;
type PageRow = Selectable<DatabaseSchema["content.editorial_pages"]>;
type DbExecutor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;
export type MediaAssetStatus = "draft" | "active" | "archived";
export type MediaAssetMimeType =
  "image/jpeg" | "image/png" | "image/webp" | "image/avif";

export interface AdminMediaAsset {
  id: string;
  storagePath: string;
  publicUrl: string;
  name: string;
  alt: string;
  width: number | null;
  height: number | null;
  mimeType: MediaAssetMimeType;
  status: MediaAssetStatus;
  usage: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAssetInput {
  storagePath?: string;
  publicUrl: string;
  name: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  mimeType: MediaAssetMimeType;
  status?: MediaAssetStatus;
  usage?: string;
}

export interface MediaAssetPatch {
  name?: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
  status?: MediaAssetStatus;
  usage?: string;
}

export type EditorialPageStatus = "draft" | "published" | "archived";

export interface EditorialPageBlock {
  id: string;
  sortOrder: number;
  blockType: string;
  payload: Record<string, unknown>;
  media: { id: string; publicUrl: string; alt: string } | null;
}

export interface AdminEditorialPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
  status: EditorialPageStatus;
  version: number;
  publishedAt: string | null;
  updatedAt: string;
  blocks: readonly EditorialPageBlock[];
}

export interface EditorialPageBlockInput {
  sortOrder: number;
  blockType: string;
  payload: Record<string, unknown>;
  mediaAssetId?: string | null;
}

export interface EditorialPageInput {
  slug: string;
  title: string;
  body?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  blocks?: readonly EditorialPageBlockInput[];
}

export interface EditorialPagePatch {
  slug?: string;
  title?: string;
  body?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  blocks?: readonly EditorialPageBlockInput[];
  expectedVersion?: number;
}

export interface AdminContentRepository {
  listMedia(): Promise<readonly AdminMediaAsset[]>;
  listMediaPage?(options: {
    limit: number;
    offset: number;
    query?: string;
  }): Promise<{
    items: readonly AdminMediaAsset[];
    total: number;
    limit: number;
    offset: number;
  }>;
  createMedia(
    input: MediaAssetInput,
    actorUserId: string,
  ): Promise<AdminMediaAsset>;
  updateMedia(
    id: string,
    patch: MediaAssetPatch,
    actorUserId: string,
  ): Promise<AdminMediaAsset>;
  listPages(includeArchived?: boolean): Promise<readonly AdminEditorialPage[]>;
  getPage(id: string): Promise<AdminEditorialPage | null>;
  createPage(
    input: EditorialPageInput,
    actorUserId: string,
  ): Promise<AdminEditorialPage>;
  updatePage(
    id: string,
    patch: EditorialPagePatch,
    actorUserId: string,
  ): Promise<AdminEditorialPage>;
  publishPage(id: string, actorUserId: string): Promise<AdminEditorialPage>;
  archivePage(id: string, actorUserId: string): Promise<AdminEditorialPage>;
  getPublishedPageBySlug(slug: string): Promise<AdminEditorialPage | null>;
}

function fail(
  statusCode: number,
  code: string,
  title: string,
  detail: string,
): never {
  throw new AppError({ statusCode, code, title, detail });
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    fail(
      400,
      "MEDIA_VALIDATION_ERROR",
      "Invalid media asset",
      `${field} must contain at least one non-whitespace character.`,
    );
  }
  return normalized;
}

function validateDimensions(width: number | null, height: number | null): void {
  if ((width === null) !== (height === null)) {
    fail(
      400,
      "MEDIA_VALIDATION_ERROR",
      "Invalid media asset",
      "Width and height must be provided together or both be null.",
    );
  }
  if (
    (width !== null && (!Number.isInteger(width) || width < 1)) ||
    (height !== null && (!Number.isInteger(height) || height < 1))
  ) {
    fail(
      400,
      "MEDIA_VALIDATION_ERROR",
      "Invalid media asset",
      "Width and height must be positive integers.",
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function mediaRecord(row: MediaRow): AdminMediaAsset {
  return {
    id: row.id,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    name: row.name,
    alt: row.alt,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type,
    status: row.status,
    usage: row.usage,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function pageText(value: string | null | undefined, field: string): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    fail(
      400,
      "EDITORIAL_PAGE_VALIDATION_ERROR",
      "Invalid editorial page",
      `${field} must contain at least one non-whitespace character.`,
    );
  }
  return normalized;
}

function pageSlug(value: string): string {
  const slug = pageText(value, "slug").toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail(
      400,
      "EDITORIAL_PAGE_VALIDATION_ERROR",
      "Invalid editorial page",
      "slug must contain lowercase letters, numbers and single hyphens only.",
    );
  }
  return slug;
}

function nullablePageText(
  value: string | null | undefined,
  field: string,
): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (!normalized) {
    fail(
      400,
      "EDITORIAL_PAGE_VALIDATION_ERROR",
      "Invalid editorial page",
      `${field} must be null or contain at least one non-whitespace character.`,
    );
  }
  return normalized;
}

function blockInputs(
  blocks: readonly EditorialPageBlockInput[] | undefined,
): EditorialPageBlockInput[] {
  const items = [...(blocks ?? [])].map((block) => {
    const blockType = pageText(block.blockType, "blockType").toLowerCase();
    if (!/^[a-z][a-z0-9_-]{0,79}$/.test(blockType)) {
      fail(
        400,
        "EDITORIAL_PAGE_VALIDATION_ERROR",
        "Invalid editorial page",
        "blockType must be a stable lowercase identifier.",
      );
    }
    if (!Number.isInteger(block.sortOrder) || block.sortOrder < 0) {
      fail(
        400,
        "EDITORIAL_PAGE_VALIDATION_ERROR",
        "Invalid editorial page",
        "sortOrder must be a non-negative integer.",
      );
    }
    if (Array.isArray(block.payload) || typeof block.payload !== "object") {
      fail(
        400,
        "EDITORIAL_PAGE_VALIDATION_ERROR",
        "Invalid editorial page",
        "Block payload must be a JSON object.",
      );
    }
    if (JSON.stringify(block.payload).length > 64_000) {
      fail(
        400,
        "EDITORIAL_PAGE_VALIDATION_ERROR",
        "Invalid editorial page",
        "Each block payload must be smaller than 64 KiB.",
      );
    }
    return {
      sortOrder: block.sortOrder,
      blockType,
      payload: block.payload,
      mediaAssetId: block.mediaAssetId ?? null,
    };
  });
  const orders = new Set<number>();
  for (const block of items) {
    if (orders.has(block.sortOrder)) {
      fail(
        400,
        "EDITORIAL_PAGE_VALIDATION_ERROR",
        "Invalid editorial page",
        "Block sortOrder values must be unique.",
      );
    }
    orders.add(block.sortOrder);
  }
  return items.sort((left, right) => left.sortOrder - right.sortOrder);
}

function pageRecord(
  row: PageRow,
  blocks: readonly EditorialPageBlock[],
): AdminEditorialPage {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    status: row.status,
    version: row.version,
    publishedAt: row.published_at ? iso(row.published_at) : null,
    updatedAt: iso(row.updated_at),
    blocks,
  };
}

export class PostgresAdminContentRepository implements AdminContentRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async listMedia(): Promise<readonly AdminMediaAsset[]> {
    const rows = await this.database
      .selectFrom("content.media_assets")
      .selectAll()
      .where("status", "!=", "archived")
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .execute();
    return rows.map(mediaRecord);
  }

  async listMediaPage(options: {
    limit: number;
    offset: number;
    query?: string;
  }): Promise<{
    items: readonly AdminMediaAsset[];
    total: number;
    limit: number;
    offset: number;
  }> {
    let countQuery = this.database
      .selectFrom("content.media_assets")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("status", "!=", "archived");
    let rowsQuery = this.database
      .selectFrom("content.media_assets")
      .selectAll()
      .where("status", "!=", "archived");
    if (options.query?.trim()) {
      const needle = `%${options.query.trim().replace(/[\\%_]/g, "\\$&")}%`;
      countQuery = countQuery.where((eb) =>
        eb.or([
          eb("name", "ilike", needle),
          eb("alt", "ilike", needle),
          eb("usage", "ilike", needle),
        ]),
      );
      rowsQuery = rowsQuery.where((eb) =>
        eb.or([
          eb("name", "ilike", needle),
          eb("alt", "ilike", needle),
          eb("usage", "ilike", needle),
        ]),
      );
    }
    const totalRow = await countQuery.executeTakeFirstOrThrow();
    const rows = await rowsQuery
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(options.limit)
      .offset(options.offset)
      .execute();
    return {
      items: rows.map(mediaRecord),
      total: Number.parseInt(String(totalRow.count), 10),
      limit: options.limit,
      offset: options.offset,
    };
  }

  async createMedia(
    input: MediaAssetInput,
    actorUserId: string,
  ): Promise<AdminMediaAsset> {
    const storagePath = input.storagePath?.trim() ?? `external/${randomUUID()}`;
    const name = requiredText(input.name, "name");
    const alt = requiredText(input.alt, "alt");
    const usage = requiredText(input.usage?.trim() ?? "unassigned", "usage");
    const width = input.width ?? null;
    const height = input.height ?? null;
    validateDimensions(width, height);
    const duplicate = await this.database
      .selectFrom("content.media_assets")
      .select("id")
      .where("storage_path", "=", storagePath)
      .executeTakeFirst();
    if (duplicate)
      fail(
        409,
        "MEDIA_PATH_CONFLICT",
        "Media conflict",
        "A media asset already exists for this storage path.",
      );

    let row: MediaRow;
    try {
      row = await this.database
        .insertInto("content.media_assets")
        .values({
          storage_path: storagePath,
          public_url: input.publicUrl.trim(),
          name,
          alt,
          width,
          height,
          mime_type: input.mimeType,
          status: input.status ?? "draft",
          usage,
          created_by: actorUserId,
          updated_by: actorUserId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (isUniqueViolation(error))
        fail(
          409,
          "MEDIA_PATH_CONFLICT",
          "Media conflict",
          "A media asset already exists for this storage path.",
        );
      throw error;
    }
    return mediaRecord(row);
  }

  async updateMedia(
    id: string,
    patch: MediaAssetPatch,
    actorUserId: string,
  ): Promise<AdminMediaAsset> {
    const current = await this.database
      .selectFrom("content.media_assets")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!current)
      fail(
        404,
        "MEDIA_NOT_FOUND",
        "Media not found",
        "The requested media asset does not exist.",
      );

    const width = patch.width === undefined ? current.width : patch.width;
    const height = patch.height === undefined ? current.height : patch.height;
    validateDimensions(width, height);

    const row = await this.database
      .updateTable("content.media_assets")
      .set({
        ...(patch.name === undefined
          ? {}
          : { name: requiredText(patch.name, "name") }),
        ...(patch.alt === undefined
          ? {}
          : { alt: requiredText(patch.alt, "alt") }),
        ...(patch.width === undefined ? {} : { width: patch.width }),
        ...(patch.height === undefined ? {} : { height: patch.height }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
        ...(patch.usage === undefined
          ? {}
          : { usage: requiredText(patch.usage, "usage") }),
        updated_by: actorUserId,
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return mediaRecord(row);
  }

  private async pageBlocks(
    executor: DbExecutor,
    pageRows: readonly PageRow[],
  ): Promise<Map<string, EditorialPageBlock[]>> {
    const byPage = new Map<string, EditorialPageBlock[]>();
    if (pageRows.length === 0) return byPage;
    const blockRows = await executor
      .selectFrom("content.editorial_page_blocks as blocks")
      .leftJoin(
        "content.media_assets as media",
        "media.id",
        "blocks.media_asset_id",
      )
      .select([
        "blocks.id as id",
        "blocks.page_id as page_id",
        "blocks.sort_order as sort_order",
        "blocks.block_type as block_type",
        "blocks.payload as payload",
        "media.id as media_id",
        "media.public_url as media_url",
        "media.alt as media_alt",
        "media.status as media_status",
      ])
      .where(
        "blocks.page_id",
        "in",
        pageRows.map((page) => page.id),
      )
      .orderBy("blocks.sort_order", "asc")
      .orderBy("blocks.id", "asc")
      .execute();
    for (const row of blockRows) {
      const blocks = byPage.get(row.page_id) ?? [];
      blocks.push({
        id: row.id,
        sortOrder: row.sort_order,
        blockType: row.block_type,
        payload: row.payload,
        media:
          row.media_id &&
          row.media_url &&
          row.media_alt &&
          row.media_status === "active"
            ? { id: row.media_id, publicUrl: row.media_url, alt: row.media_alt }
            : null,
      });
      byPage.set(row.page_id, blocks);
    }
    return byPage;
  }

  private async pageRecordById(
    executor: DbExecutor,
    id: string,
  ): Promise<AdminEditorialPage | null> {
    const row = await executor
      .selectFrom("content.editorial_pages")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row) return null;
    const blocks = await this.pageBlocks(executor, [row]);
    return pageRecord(row, blocks.get(row.id) ?? []);
  }

  async listPages(
    includeArchived = false,
  ): Promise<readonly AdminEditorialPage[]> {
    const query = this.database
      .selectFrom("content.editorial_pages")
      .selectAll()
      .$if(!includeArchived, (builder) =>
        builder.where("status", "!=", "archived"),
      )
      .orderBy("updated_at", "desc")
      .orderBy("id", "desc");
    const rows = await query.execute();
    const blocks = await this.pageBlocks(this.database, rows);
    return rows.map((row) => pageRecord(row, blocks.get(row.id) ?? []));
  }

  async getPage(id: string): Promise<AdminEditorialPage | null> {
    return this.pageRecordById(this.database, id);
  }

  private async assertBlockMedia(
    executor: DbExecutor,
    blocks: readonly EditorialPageBlockInput[],
    requireActive = false,
  ): Promise<void> {
    const mediaIds = blocks
      .map((block) => block.mediaAssetId)
      .filter((id): id is string => Boolean(id));
    if (mediaIds.length === 0) return;
    const rows = await executor
      .selectFrom("content.media_assets")
      .select(["id", "status"])
      .where("id", "in", mediaIds)
      .execute();
    const allowed = new Set(
      rows
        .filter((row) =>
          requireActive ? row.status === "active" : row.status !== "archived",
        )
        .map((row) => row.id),
    );
    if (allowed.size !== new Set(mediaIds).size) {
      fail(
        400,
        "EDITORIAL_MEDIA_INVALID",
        "Invalid editorial media",
        "Every linked media asset must exist and not be archived.",
      );
    }
  }

  private async replaceBlocks(
    executor: DbExecutor,
    pageId: string,
    blocks: readonly EditorialPageBlockInput[],
  ): Promise<void> {
    await this.assertBlockMedia(executor, blocks);
    await executor
      .deleteFrom("content.editorial_page_blocks")
      .where("page_id", "=", pageId)
      .execute();
    if (blocks.length === 0) return;
    await executor
      .insertInto("content.editorial_page_blocks")
      .values(
        blocks.map((block) => ({
          page_id: pageId,
          sort_order: block.sortOrder,
          block_type: block.blockType,
          payload: block.payload,
          media_asset_id: block.mediaAssetId ?? null,
        })),
      )
      .execute();
  }

  async createPage(
    input: EditorialPageInput,
    actorUserId: string,
  ): Promise<AdminEditorialPage> {
    const slug = pageSlug(input.slug);
    const title = pageText(input.title, "title");
    const body = input.body ?? "";
    if (body.length > 200_000) {
      fail(
        400,
        "EDITORIAL_PAGE_VALIDATION_ERROR",
        "Invalid editorial page",
        "body is too long.",
      );
    }
    const blocks = blockInputs(input.blocks);
    const seoTitle = nullablePageText(input.seoTitle, "seoTitle");
    const seoDescription = nullablePageText(
      input.seoDescription,
      "seoDescription",
    );
    try {
      return await this.database.transaction().execute(async (trx) => {
        const row = await trx
          .insertInto("content.editorial_pages")
          .values({
            slug,
            title,
            body,
            seo_title: seoTitle,
            seo_description: seoDescription,
            status: "draft",
            version: 1,
            published_at: null,
            created_by: actorUserId,
            updated_by: actorUserId,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await this.replaceBlocks(trx, row.id, blocks);
        const page = await this.pageRecordById(trx, row.id);
        if (!page)
          throw new Error("Editorial page disappeared during creation.");
        return page;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        fail(
          409,
          "EDITORIAL_SLUG_CONFLICT",
          "Editorial page conflict",
          "A page already exists for this slug.",
        );
      throw error;
    }
  }

  async updatePage(
    id: string,
    patch: EditorialPagePatch,
    actorUserId: string,
  ): Promise<AdminEditorialPage> {
    const current = await this.database
      .selectFrom("content.editorial_pages")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!current)
      fail(
        404,
        "EDITORIAL_PAGE_NOT_FOUND",
        "Editorial page not found",
        "The requested page does not exist.",
      );
    if (current.status === "published") {
      fail(
        409,
        "EDITORIAL_PUBLISH_EDIT_FORBIDDEN",
        "Published page cannot be edited",
        "Archive the published page and create a new draft before replacing its public content.",
      );
    }
    if (
      patch.expectedVersion !== undefined &&
      patch.expectedVersion !== current.version
    ) {
      fail(
        409,
        "EDITORIAL_VERSION_CONFLICT",
        "Editorial page conflict",
        "The page changed since it was loaded. Reload before saving.",
      );
    }
    const slug = patch.slug === undefined ? current.slug : pageSlug(patch.slug);
    const title =
      patch.title === undefined
        ? current.title
        : pageText(patch.title, "title");
    const body = patch.body ?? current.body;
    if (body.length > 200_000) {
      fail(
        400,
        "EDITORIAL_PAGE_VALIDATION_ERROR",
        "Invalid editorial page",
        "body is too long.",
      );
    }
    const blocks =
      patch.blocks === undefined ? undefined : blockInputs(patch.blocks);
    const seoTitle =
      patch.seoTitle === undefined
        ? current.seo_title
        : nullablePageText(patch.seoTitle, "seoTitle");
    const seoDescription =
      patch.seoDescription === undefined
        ? current.seo_description
        : nullablePageText(patch.seoDescription, "seoDescription");
    try {
      return await this.database.transaction().execute(async (trx) => {
        const row = await trx
          .updateTable("content.editorial_pages")
          .set({
            slug,
            title,
            body,
            seo_title: seoTitle,
            seo_description: seoDescription,
            version: current.version + 1,
            updated_by: actorUserId,
          })
          .where("id", "=", id)
          .where("version", "=", current.version)
          .returningAll()
          .executeTakeFirst();
        if (!row)
          fail(
            409,
            "EDITORIAL_VERSION_CONFLICT",
            "Editorial page conflict",
            "The page changed since it was loaded. Reload before saving.",
          );
        if (blocks !== undefined) await this.replaceBlocks(trx, id, blocks);
        const page = await this.pageRecordById(trx, id);
        if (!page) throw new Error("Editorial page disappeared during update.");
        return page;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        fail(
          409,
          "EDITORIAL_SLUG_CONFLICT",
          "Editorial page conflict",
          "A page already exists for this slug.",
        );
      throw error;
    }
  }

  async publishPage(
    id: string,
    actorUserId: string,
  ): Promise<AdminEditorialPage> {
    return this.transitionPage(id, "published", actorUserId);
  }

  async archivePage(
    id: string,
    actorUserId: string,
  ): Promise<AdminEditorialPage> {
    return this.transitionPage(id, "archived", actorUserId);
  }

  private async transitionPage(
    id: string,
    status: "published" | "archived",
    actorUserId: string,
  ): Promise<AdminEditorialPage> {
    if (status === "published") {
      const current = await this.database
        .selectFrom("content.editorial_pages")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      if (!current)
        fail(
          404,
          "EDITORIAL_PAGE_NOT_FOUND",
          "Editorial page not found",
          "The requested page does not exist.",
        );
      const blocks = await this.database
        .selectFrom("content.editorial_page_blocks")
        .select(["media_asset_id"])
        .where("page_id", "=", id)
        .execute();
      await this.assertBlockMedia(
        this.database,
        blocks.map((block) => ({
          sortOrder: 0,
          blockType: "validation",
          payload: {},
          mediaAssetId: block.media_asset_id,
        })),
        true,
      );
    }
    const row = await this.database
      .updateTable("content.editorial_pages")
      .set({
        status,
        published_at: status === "published" ? new Date() : null,
        version: sql`version + 1`,
        updated_by: actorUserId,
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
    if (!row)
      fail(
        404,
        "EDITORIAL_PAGE_NOT_FOUND",
        "Editorial page not found",
        "The requested page does not exist.",
      );
    const page = await this.pageRecordById(this.database, id);
    if (!page) throw new Error("Editorial page disappeared during transition.");
    return page;
  }

  async getPublishedPageBySlug(
    slug: string,
  ): Promise<AdminEditorialPage | null> {
    const normalized = pageSlug(slug);
    const row = await this.database
      .selectFrom("content.editorial_pages")
      .selectAll()
      .where("slug", "=", normalized)
      .where("status", "=", "published")
      .executeTakeFirst();
    if (!row) return null;
    const blocks = await this.pageBlocks(this.database, [row]);
    return pageRecord(row, blocks.get(row.id) ?? []);
  }
}
