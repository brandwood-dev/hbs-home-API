import { type Kysely, type Selectable, type Transaction } from "kysely";
import type { DatabaseSchema } from "../database/schema.js";
import { AppError } from "../http/problem.js";

type RevisionRow = Selectable<DatabaseSchema["content.home_revisions"]>;
type DbExecutor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

export type HomeRevisionStatus = "draft" | "published" | "archived";
export type HomeSectionKey = "hero" | "promo_banner" | "shop_the_look";

export const HOME_PROMO_BANNER_MAX_MESSAGES = 20;
const HOME_PROMO_BANNER_MAX_TEXT_LENGTH = 240;
const HOME_PROMO_BANNER_MAX_LABEL_LENGTH = 80;
const HOME_PROMO_BANNER_MAX_HREF_LENGTH = 2048;

export interface HomePromoBannerMessage {
  id: string;
  label?: string;
  text: string;
  href?: string;
  isEnabled: boolean;
  sortOrder: number;
}

export interface HomePromoBannerPayload {
  messages: HomePromoBannerMessage[];
}

export interface HomeMediaReference {
  id: string;
  publicUrl: string;
  alt: string;
}

export interface HomeProductReference {
  id: string;
  slug: string;
  name: string;
}

export interface HomeHotspot {
  id: string;
  productId: string;
  xPercent: number;
  yPercent: number;
  label: string | null;
  sortOrder: number;
  product: HomeProductReference | null;
}

export interface HomeSection {
  id: string;
  sectionKey: HomeSectionKey;
  sortOrder: number;
  isEnabled: boolean;
  payload: Record<string, unknown>;
  media: HomeMediaReference | null;
  mobileMedia: HomeMediaReference | null;
  hotspots: readonly HomeHotspot[];
}

export interface AdminHomeRevision {
  id: string;
  status: HomeRevisionStatus;
  version: number;
  publishedAt: string | null;
  updatedAt: string;
  sections: readonly HomeSection[];
}

export interface AdminHomeContent {
  draft: AdminHomeRevision | null;
  published: AdminHomeRevision | null;
}

export interface PublicHomeContent {
  version: number;
  publishedAt: string;
  sections: readonly PublicHomeSection[];
}

export interface PublicHomeMediaReference {
  publicUrl: string;
  alt: string;
}

export interface PublicHomeHotspot {
  productId: string;
  xPercent: number;
  yPercent: number;
  label: string | null;
  sortOrder: number;
  product: HomeProductReference | null;
}

export interface PublicHomeSection {
  sectionKey: HomeSectionKey;
  sortOrder: number;
  isEnabled: boolean;
  payload: Record<string, unknown>;
  media: PublicHomeMediaReference | null;
  mobileMedia: PublicHomeMediaReference | null;
  hotspots: readonly PublicHomeHotspot[];
}

export interface HomeHotspotInput {
  productId: string;
  xPercent: number;
  yPercent: number;
  label?: string | null;
  sortOrder: number;
}

export interface HomeSectionInput {
  sectionKey: HomeSectionKey;
  sortOrder: number;
  isEnabled?: boolean;
  payload?: Record<string, unknown>;
  mediaAssetId?: string | null;
  mobileMediaAssetId?: string | null;
  hotspots?: readonly HomeHotspotInput[];
}

function sectionInputFromRecord(section: HomeSection): HomeSectionInput {
  return {
    sectionKey: section.sectionKey,
    sortOrder: section.sortOrder,
    isEnabled: section.isEnabled,
    payload: section.payload,
    mediaAssetId: section.media?.id ?? null,
    mobileMediaAssetId: section.mobileMedia?.id ?? null,
    hotspots: section.hotspots.map((hotspot) => ({
      productId: hotspot.productId,
      xPercent: hotspot.xPercent,
      yPercent: hotspot.yPercent,
      label: hotspot.label,
      sortOrder: hotspot.sortOrder,
    })),
  };
}

export interface HomeDraftInput {
  sections: readonly HomeSectionInput[];
  expectedVersion?: number;
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
  // The postgres driver normally returns timestamptz columns as Date objects,
  // but deployments using a string parser can return a SQL timestamp string
  // (for example `2026-08-24 01:08:05.146+00`). Fastify's `date-time`
  // response schema only accepts RFC 3339, so normalize both representations
  // at the repository boundary.
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * PostgreSQL numeric columns are returned as strings by the default `pg`
 * type parser. Normalize them at the repository boundary so the API contract
 * (and Fastify's response serializer) always receives JSON numbers.
 */
function numeric(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return parsed;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function sectionKey(value: string): HomeSectionKey {
  if (
    value !== "hero" &&
    value !== "promo_banner" &&
    value !== "shop_the_look"
  ) {
    fail(
      400,
      "HOME_SECTION_INVALID",
      "Invalid home section",
      "sectionKey must be hero, promo_banner or shop_the_look.",
    );
  }
  return value;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
  messageIndex: number,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(
      400,
      "HOME_PROMO_INVALID",
      "Invalid promotional banner",
      `Message ${String(messageIndex + 1)} requires a non-empty ${field}.`,
    );
  }
  const text = value.trim();
  if (text.length > maxLength) {
    fail(
      400,
      "HOME_PROMO_INVALID",
      "Invalid promotional banner",
      `${field} must not exceed ${String(maxLength)} characters.`,
    );
  }
  return text;
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
  messageIndex: number,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    fail(
      400,
      "HOME_PROMO_INVALID",
      "Invalid promotional banner",
      `Message ${String(messageIndex + 1)} has an invalid ${field}.`,
    );
  }
  const text = value.trim();
  if (!text) return undefined;
  if (text.length > maxLength) {
    fail(
      400,
      "HOME_PROMO_INVALID",
      "Invalid promotional banner",
      `${field} must not exceed ${String(maxLength)} characters.`,
    );
  }
  return text;
}

function safePromoHref(
  value: unknown,
  messageIndex: number,
): string | undefined {
  const href = optionalText(
    value,
    "href",
    HOME_PROMO_BANNER_MAX_HREF_LENGTH,
    messageIndex,
  );
  if (!href) return undefined;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const parsed = new URL(href);
    if (parsed.protocol === "http:" || parsed.protocol === "https:")
      return parsed.toString();
  } catch {
    // Fall through to the same validation error below.
  }
  fail(
    400,
    "HOME_PROMO_INVALID",
    "Invalid promotional banner",
    `Message ${String(messageIndex + 1)} has an invalid href. Use a relative path or an HTTP(S) URL.`,
  );
}

/**
 * Convert the legacy { label, text, href } payload and validate the current
 * multi-message payload before it is persisted or exposed publicly.
 */
export function normalizePromoBannerPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const rawMessages = payload.messages;
  const source =
    rawMessages === undefined
      ? payload.text === undefined
        ? []
        : [
            {
              id: "legacy-promo",
              label: payload.label,
              text: payload.text,
              href: payload.href,
              isEnabled: true,
              sortOrder: 0,
            },
          ]
      : rawMessages;
  if (!Array.isArray(source)) {
    fail(
      400,
      "HOME_PROMO_INVALID",
      "Invalid promotional banner",
      "messages must be an array.",
    );
  }
  if (source.length > HOME_PROMO_BANNER_MAX_MESSAGES) {
    fail(
      400,
      "HOME_PROMO_INVALID",
      "Invalid promotional banner",
      `A promotional banner cannot contain more than ${String(HOME_PROMO_BANNER_MAX_MESSAGES)} messages.`,
    );
  }

  const ids = new Set<string>();
  const orders = new Set<number>();
  const messages = source.map((value, index) => {
    const row = objectRecord(value);
    if (!row) {
      fail(
        400,
        "HOME_PROMO_INVALID",
        "Invalid promotional banner",
        `Message ${String(index + 1)} must be an object.`,
      );
    }
    const id =
      optionalText(row.id, "id", 120, index) ?? `promo-${String(index + 1)}`;
    if (ids.has(id)) {
      fail(
        400,
        "HOME_PROMO_INVALID",
        "Invalid promotional banner",
        "Message ids must be unique.",
      );
    }
    const rawOrder = row.sortOrder;
    const sortOrder =
      rawOrder === undefined
        ? index
        : typeof rawOrder === "number" &&
            Number.isInteger(rawOrder) &&
            rawOrder >= 0
          ? rawOrder
          : (() => {
              fail(
                400,
                "HOME_PROMO_INVALID",
                "Invalid promotional banner",
                `Message ${String(index + 1)} has an invalid sortOrder.`,
              );
            })();
    if (orders.has(sortOrder)) {
      fail(
        400,
        "HOME_PROMO_INVALID",
        "Invalid promotional banner",
        "Message sortOrder values must be unique.",
      );
    }
    const enabled = row.isEnabled === undefined ? true : row.isEnabled;
    if (typeof enabled !== "boolean") {
      fail(
        400,
        "HOME_PROMO_INVALID",
        "Invalid promotional banner",
        `Message ${String(index + 1)} has an invalid isEnabled value.`,
      );
    }
    ids.add(id);
    orders.add(sortOrder);
    const label = optionalText(
      row.label,
      "label",
      HOME_PROMO_BANNER_MAX_LABEL_LENGTH,
      index,
    );
    const href = safePromoHref(row.href, index);
    return {
      id,
      ...(label ? { label } : {}),
      text: requiredText(
        row.text,
        "text",
        HOME_PROMO_BANNER_MAX_TEXT_LENGTH,
        index,
      ),
      ...(href ? { href } : {}),
      isEnabled: enabled,
      sortOrder,
    } satisfies HomePromoBannerMessage;
  });
  messages.sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    messages: messages.map((message, index) => ({
      ...message,
      sortOrder: index,
    })),
  } satisfies HomePromoBannerPayload;
}

function validateSections(
  sections: readonly HomeSectionInput[],
): HomeSectionInput[] {
  if (sections.length > 20) {
    fail(
      400,
      "HOME_SECTION_INVALID",
      "Invalid home sections",
      "A home revision cannot contain more than 20 sections.",
    );
  }
  const normalized = sections.map((section) => ({
    ...section,
    sectionKey: sectionKey(section.sectionKey),
    sortOrder: section.sortOrder,
    isEnabled: section.isEnabled ?? true,
    payload:
      section.sectionKey === "promo_banner"
        ? normalizePromoBannerPayload(section.payload ?? {})
        : (section.payload ?? {}),
    hotspots: section.hotspots ?? [],
  }));
  const keys = new Set<string>();
  const orders = new Set<number>();
  for (const section of normalized) {
    if (!Number.isInteger(section.sortOrder) || section.sortOrder < 0) {
      fail(
        400,
        "HOME_SECTION_INVALID",
        "Invalid home section",
        "sortOrder must be a non-negative integer.",
      );
    }
    if (keys.has(section.sectionKey) || orders.has(section.sortOrder)) {
      fail(
        400,
        "HOME_SECTION_INVALID",
        "Invalid home sections",
        "sectionKey and sortOrder must be unique within a revision.",
      );
    }
    keys.add(section.sectionKey);
    orders.add(section.sortOrder);
    if (section.sectionKey !== "shop_the_look" && section.hotspots.length > 0) {
      fail(
        400,
        "HOME_HOTSPOT_INVALID",
        "Invalid Shop the Look hotspots",
        "Hotspots are only allowed on the shop_the_look section.",
      );
    }
    const hotspotOrders = new Set<number>();
    const hotspotProducts = new Set<string>();
    for (const hotspot of section.hotspots) {
      if (
        !Number.isFinite(hotspot.xPercent) ||
        hotspot.xPercent < 0 ||
        hotspot.xPercent > 100 ||
        !Number.isFinite(hotspot.yPercent) ||
        hotspot.yPercent < 0 ||
        hotspot.yPercent > 100
      ) {
        fail(
          400,
          "HOME_HOTSPOT_INVALID",
          "Invalid Shop the Look hotspot",
          "Hotspot coordinates must be between 0 and 100 percent.",
        );
      }
      if (!Number.isInteger(hotspot.sortOrder) || hotspot.sortOrder < 0) {
        fail(
          400,
          "HOME_HOTSPOT_INVALID",
          "Invalid Shop the Look hotspot",
          "Hotspot sortOrder must be a non-negative integer.",
        );
      }
      if (
        hotspotOrders.has(hotspot.sortOrder) ||
        hotspotProducts.has(hotspot.productId)
      ) {
        fail(
          400,
          "HOME_HOTSPOT_INVALID",
          "Invalid Shop the Look hotspots",
          "Hotspot sortOrder and productId must be unique within the section.",
        );
      }
      hotspotOrders.add(hotspot.sortOrder);
      hotspotProducts.add(hotspot.productId);
    }
    if (section.hotspots.length > 20) {
      fail(
        400,
        "HOME_HOTSPOT_INVALID",
        "Invalid Shop the Look hotspots",
        "A Shop the Look section cannot contain more than 20 hotspots.",
      );
    }
  }
  return normalized;
}

export function normalizeHomeDraftInput(input: HomeDraftInput): HomeDraftInput {
  return {
    ...input,
    sections: validateSections(input.sections),
  };
}

function mediaReference(
  row: {
    id: string | null;
    public_url: string | null;
    alt: string | null;
    status: string | null;
  },
  publicOnly: boolean,
): HomeMediaReference | null {
  if (!row.id || !row.public_url || !row.alt) return null;
  if (publicOnly && row.status !== "active") {
    return null;
  }
  return { id: row.id, publicUrl: row.public_url, alt: row.alt };
}

function revisionRecord(
  row: RevisionRow,
  sections: readonly HomeSection[],
): AdminHomeRevision {
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    publishedAt: iso(row.published_at),
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
    sections,
  };
}

export interface HomeContentRepository {
  getAdminHome(): Promise<AdminHomeContent>;
  getAdminHomeSection(sectionKey: HomeSectionKey): Promise<AdminHomeContent>;
  updateDraft(
    input: HomeDraftInput,
    actorUserId: string,
  ): Promise<AdminHomeRevision>;
  updateDraftSection(
    input: HomeSectionInput & { expectedVersion?: number },
    actorUserId: string,
  ): Promise<AdminHomeRevision>;
  publishDraft(actorUserId: string): Promise<AdminHomeRevision>;
  publishDraftSection(
    sectionKey: HomeSectionKey,
    actorUserId: string,
  ): Promise<AdminHomeRevision>;
  archivePublished(actorUserId: string): Promise<AdminHomeRevision>;
  archivePublishedSection(
    sectionKey: HomeSectionKey,
    actorUserId: string,
  ): Promise<AdminHomeRevision>;
  getPublishedHome(): Promise<PublicHomeContent | null>;
}

export class PostgresHomeContentRepository implements HomeContentRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  private async sectionRecords(
    executor: DbExecutor,
    revisions: readonly RevisionRow[],
    publicOnly: boolean,
  ): Promise<Map<string, HomeSection[]>> {
    const result = new Map<string, HomeSection[]>();
    if (revisions.length === 0) return result;
    const rows = await executor
      .selectFrom("content.home_sections as sections")
      .leftJoin(
        "content.media_assets as media",
        "media.id",
        "sections.media_asset_id",
      )
      .leftJoin(
        "content.media_assets as mobile_media",
        "mobile_media.id",
        "sections.mobile_media_asset_id",
      )
      .select([
        "sections.id as id",
        "sections.revision_id as revision_id",
        "sections.section_key as section_key",
        "sections.sort_order as sort_order",
        "sections.is_enabled as is_enabled",
        "sections.payload as payload",
        "media.id as media_id",
        "media.public_url as media_url",
        "media.alt as media_alt",
        "media.status as media_status",
        "mobile_media.id as mobile_media_id",
        "mobile_media.public_url as mobile_media_url",
        "mobile_media.alt as mobile_media_alt",
        "mobile_media.status as mobile_media_status",
      ])
      .where(
        "sections.revision_id",
        "in",
        revisions.map((revision) => revision.id),
      )
      .orderBy("sections.sort_order", "asc")
      .orderBy("sections.id", "asc")
      .execute();
    const hotspots = await this.hotspotRecords(
      executor,
      rows.map((row) => row.id),
      publicOnly,
    );
    for (const row of rows) {
      const sections = result.get(row.revision_id) ?? [];
      sections.push({
        id: row.id,
        sectionKey: sectionKey(row.section_key),
        sortOrder: row.sort_order,
        isEnabled: row.is_enabled,
        payload:
          row.section_key === "promo_banner"
            ? normalizePromoBannerPayload(row.payload)
            : row.payload,
        media: mediaReference(
          {
            id: row.media_id,
            public_url: row.media_url,
            alt: row.media_alt,
            status: row.media_status,
          },
          publicOnly,
        ),
        mobileMedia: mediaReference(
          {
            id: row.mobile_media_id,
            public_url: row.mobile_media_url,
            alt: row.mobile_media_alt,
            status: row.mobile_media_status,
          },
          publicOnly,
        ),
        hotspots: hotspots.get(row.id) ?? [],
      });
      result.set(row.revision_id, sections);
    }
    return result;
  }

  private async hotspotRecords(
    executor: DbExecutor,
    sectionIds: readonly string[],
    publicOnly: boolean,
  ): Promise<Map<string, HomeHotspot[]>> {
    const result = new Map<string, HomeHotspot[]>();
    if (sectionIds.length === 0) return result;
    const query = executor
      .selectFrom("content.home_shop_the_look_hotspots as hotspots")
      .leftJoin(
        "catalog.products as products",
        "products.id",
        "hotspots.product_id",
      )
      .select([
        "hotspots.id as id",
        "hotspots.section_id as section_id",
        "hotspots.product_id as product_id",
        "hotspots.x_percent as x_percent",
        "hotspots.y_percent as y_percent",
        "hotspots.label as label",
        "hotspots.sort_order as sort_order",
        "products.id as product_ref_id",
        "products.slug as product_slug",
        "products.name as product_name",
        "products.status as product_status",
        "products.is_published as product_is_published",
      ])
      .where("hotspots.section_id", "in", sectionIds)
      .$if(publicOnly, (builder) =>
        builder
          .where("products.status", "=", "active")
          .where("products.is_published", "=", true),
      )
      .orderBy("hotspots.sort_order", "asc")
      .orderBy("hotspots.id", "asc");
    const rows = await query.execute();
    for (const row of rows) {
      const items = result.get(row.section_id) ?? [];
      items.push({
        id: row.id,
        productId: row.product_id,
        xPercent: numeric(row.x_percent),
        yPercent: numeric(row.y_percent),
        label: row.label,
        sortOrder: row.sort_order,
        product:
          row.product_ref_id && row.product_slug && row.product_name
            ? {
                id: row.product_ref_id,
                slug: row.product_slug,
                name: row.product_name,
              }
            : null,
      });
      result.set(row.section_id, items);
    }
    return result;
  }

  private async hydrateRevisions(
    executor: DbExecutor,
    rows: readonly RevisionRow[],
    publicOnly: boolean,
  ): Promise<AdminHomeRevision[]> {
    const sections = await this.sectionRecords(executor, rows, publicOnly);
    return rows.map((row) => revisionRecord(row, sections.get(row.id) ?? []));
  }

  private async revisionRecords(
    executor: DbExecutor,
    statuses: readonly HomeRevisionStatus[],
    publicOnly = false,
  ): Promise<AdminHomeRevision[]> {
    const rows = await executor
      .selectFrom("content.home_revisions")
      .selectAll()
      .where("status", "in", statuses)
      .orderBy("updated_at", "desc")
      .execute();
    return this.hydrateRevisions(executor, rows, publicOnly);
  }

  async getAdminHome(): Promise<AdminHomeContent> {
    const revisions = await this.revisionRecords(this.database, [
      "draft",
      "published",
    ]);
    return {
      draft: revisions.find((revision) => revision.status === "draft") ?? null,
      published:
        revisions.find((revision) => revision.status === "published") ?? null,
    };
  }

  async getAdminHomeSection(
    sectionKey: HomeSectionKey,
  ): Promise<AdminHomeContent> {
    const content = await this.getAdminHome();
    const narrow = (revision: AdminHomeRevision | null) =>
      revision
        ? {
            ...revision,
            sections: revision.sections.filter(
              (section) => section.sectionKey === sectionKey,
            ),
          }
        : null;
    return {
      draft: narrow(content.draft),
      published: narrow(content.published),
    };
  }

  private async cloneRevision(
    executor: DbExecutor,
    source: RevisionRow,
    status: "draft" | "published",
    actorUserId: string,
    version = source.version,
  ): Promise<RevisionRow> {
    const revision = await executor
      .insertInto("content.home_revisions")
      .values({
        status,
        version,
        published_at: status === "published" ? new Date() : null,
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const sections = await executor
      .selectFrom("content.home_sections")
      .selectAll()
      .where("revision_id", "=", source.id)
      .orderBy("sort_order", "asc")
      .execute();
    const sectionIds = new Map<string, string>();
    for (const section of sections) {
      const next = await executor
        .insertInto("content.home_sections")
        .values({
          revision_id: revision.id,
          section_key: section.section_key,
          sort_order: section.sort_order,
          is_enabled: section.is_enabled,
          payload: section.payload,
          media_asset_id: section.media_asset_id,
          mobile_media_asset_id: section.mobile_media_asset_id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      sectionIds.set(section.id, next.id);
    }
    const hotspotRows = sections.length
      ? await executor
          .selectFrom("content.home_shop_the_look_hotspots")
          .selectAll()
          .where(
            "section_id",
            "in",
            sections.map((section) => section.id),
          )
          .execute()
      : [];
    if (hotspotRows.length > 0) {
      await executor
        .insertInto("content.home_shop_the_look_hotspots")
        .values(
          hotspotRows.map((hotspot) => {
            const sectionId = sectionIds.get(hotspot.section_id);
            if (!sectionId) {
              fail(
                500,
                "HOME_REVISION_CLONE_FAILED",
                "Home revision clone failed",
                "A homepage hotspot references a section that could not be cloned.",
              );
            }
            return {
              section_id: sectionId,
              product_id: hotspot.product_id,
              x_percent: hotspot.x_percent,
              y_percent: hotspot.y_percent,
              label: hotspot.label,
              sort_order: hotspot.sort_order,
            };
          }),
        )
        .execute();
    }
    return revision;
  }

  private async replaceRevisionSection(
    executor: DbExecutor,
    revisionId: string,
    input: HomeSectionInput,
  ): Promise<void> {
    const existing = await executor
      .selectFrom("content.home_sections")
      .select(["id"])
      .where("revision_id", "=", revisionId)
      .where("section_key", "=", input.sectionKey)
      .executeTakeFirst();
    if (existing) {
      await executor
        .deleteFrom("content.home_sections")
        .where("id", "=", existing.id)
        .execute();
    }
    const row = await executor
      .insertInto("content.home_sections")
      .values({
        revision_id: revisionId,
        section_key: input.sectionKey,
        sort_order: input.sortOrder,
        is_enabled: input.isEnabled ?? true,
        payload: input.payload ?? {},
        media_asset_id: input.mediaAssetId ?? null,
        mobile_media_asset_id: input.mobileMediaAssetId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    if (input.hotspots && input.hotspots.length > 0) {
      await executor
        .insertInto("content.home_shop_the_look_hotspots")
        .values(
          input.hotspots.map((hotspot) => ({
            section_id: row.id,
            product_id: hotspot.productId,
            x_percent: hotspot.xPercent,
            y_percent: hotspot.yPercent,
            label: hotspot.label ?? null,
            sort_order: hotspot.sortOrder,
          })),
        )
        .execute();
    }
  }

  private async ensureDraft(
    executor: DbExecutor,
    actorUserId: string,
  ): Promise<RevisionRow> {
    const current = await executor
      .selectFrom("content.home_revisions")
      .selectAll()
      .where("status", "=", "draft")
      .executeTakeFirst();
    if (current) return current;
    const published = await executor
      .selectFrom("content.home_revisions")
      .selectAll()
      .where("status", "=", "published")
      .executeTakeFirst();
    if (published)
      return this.cloneRevision(executor, published, "draft", actorUserId);
    return executor
      .insertInto("content.home_revisions")
      .values({
        status: "draft",
        version: 1,
        published_at: null,
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateDraftSection(
    input: HomeSectionInput & { expectedVersion?: number },
    actorUserId: string,
  ): Promise<AdminHomeRevision> {
    const { expectedVersion, ...rawSection } = input;
    const section = validateSections([rawSection])[0];
    if (!section) {
      fail(
        400,
        "HOME_SECTION_INVALID",
        "Invalid home section",
        "A section is required.",
      );
    }
    try {
      return await this.database.transaction().execute(async (trx) => {
        const current = await this.ensureDraft(trx, actorUserId);
        if (
          expectedVersion !== undefined &&
          expectedVersion !== current.version
        ) {
          fail(
            409,
            "HOME_VERSION_CONFLICT",
            "Home content conflict",
            "The homepage draft changed since it was loaded. Reload before saving.",
          );
        }
        await this.assertMedia(trx, [section], false);
        await this.assertProducts(trx, [section], false);
        const row = await trx
          .updateTable("content.home_revisions")
          .set({
            version: current.version + 1,
            updated_by: actorUserId,
          })
          .where("id", "=", current.id)
          .where("version", "=", current.version)
          .returningAll()
          .executeTakeFirst();
        if (!row) {
          fail(
            409,
            "HOME_VERSION_CONFLICT",
            "Home content conflict",
            "The homepage draft changed since it was loaded. Reload before saving.",
          );
        }
        await this.replaceRevisionSection(trx, current.id, section);
        const records = await this.hydrateRevisions(trx, [row], false);
        return records[0] ?? revisionRecord(row, []);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        fail(
          409,
          "HOME_SECTION_CONFLICT",
          "Home content conflict",
          "A section or hotspot order is duplicated.",
        );
      }
      throw error;
    }
  }

  private async assertMedia(
    executor: DbExecutor,
    sections: readonly HomeSectionInput[],
    requireActive: boolean,
  ): Promise<void> {
    const mediaIds = sections.flatMap((section) =>
      [section.mediaAssetId, section.mobileMediaAssetId].filter(
        (id): id is string => Boolean(id),
      ),
    );
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
        "HOME_MEDIA_INVALID",
        "Invalid home media",
        "Every linked home image must exist and not be archived.",
      );
    }
  }

  private async assertProducts(
    executor: DbExecutor,
    sections: readonly HomeSectionInput[],
    requirePublished: boolean,
  ): Promise<void> {
    const productIds = sections.flatMap(
      (section) => section.hotspots?.map((hotspot) => hotspot.productId) ?? [],
    );
    if (productIds.length === 0) return;
    const rows = await executor
      .selectFrom("catalog.products")
      .select(["id", "status", "is_published"])
      .where("id", "in", productIds)
      .execute();
    const allowed = new Set(
      rows
        .filter((row) =>
          requirePublished
            ? row.status === "active" && row.is_published
            : // A private draft may temporarily keep a link to an archived
              // product while an administrator edits another homepage section.
              // Publication still enforces the stricter active + published
              // invariant above, so an archived link can never leak publicly.
              true,
        )
        .map((row) => row.id),
    );
    if (allowed.size !== new Set(productIds).size) {
      fail(
        400,
        "HOME_PRODUCT_INVALID",
        "Invalid Shop the Look product",
        "Every linked product must exist; publication also requires an active, published product.",
      );
    }
  }

  private async replaceDraftSections(
    executor: DbExecutor,
    revisionId: string,
    sections: readonly HomeSectionInput[],
  ): Promise<void> {
    await executor
      .deleteFrom("content.home_sections")
      .where("revision_id", "=", revisionId)
      .execute();
    for (const section of sections) {
      const row = await executor
        .insertInto("content.home_sections")
        .values({
          revision_id: revisionId,
          section_key: section.sectionKey,
          sort_order: section.sortOrder,
          is_enabled: section.isEnabled ?? true,
          payload: section.payload ?? {},
          media_asset_id: section.mediaAssetId ?? null,
          mobile_media_asset_id: section.mobileMediaAssetId ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      if (section.hotspots && section.hotspots.length > 0) {
        await executor
          .insertInto("content.home_shop_the_look_hotspots")
          .values(
            section.hotspots.map((hotspot) => ({
              section_id: row.id,
              product_id: hotspot.productId,
              x_percent: hotspot.xPercent,
              y_percent: hotspot.yPercent,
              label: hotspot.label ?? null,
              sort_order: hotspot.sortOrder,
            })),
          )
          .execute();
      }
    }
  }

  async updateDraft(
    input: HomeDraftInput,
    actorUserId: string,
  ): Promise<AdminHomeRevision> {
    const sections = validateSections(input.sections);
    try {
      return await this.database.transaction().execute(async (trx) => {
        const current = await this.ensureDraft(trx, actorUserId);
        if (
          input.expectedVersion !== undefined &&
          input.expectedVersion !== current.version
        ) {
          fail(
            409,
            "HOME_VERSION_CONFLICT",
            "Home content conflict",
            "The homepage draft changed since it was loaded. Reload before saving.",
          );
        }
        await this.assertMedia(trx, sections, false);
        await this.assertProducts(trx, sections, false);
        const row = await trx
          .updateTable("content.home_revisions")
          .set({
            version: current.version + 1,
            updated_by: actorUserId,
          })
          .where("id", "=", current.id)
          .where("version", "=", current.version)
          .returningAll()
          .executeTakeFirst();
        if (!row) {
          fail(
            409,
            "HOME_VERSION_CONFLICT",
            "Home content conflict",
            "The homepage draft changed since it was loaded. Reload before saving.",
          );
        }
        await this.replaceDraftSections(trx, current.id, sections);
        const records = await this.hydrateRevisions(trx, [row], false);
        return records[0] ?? revisionRecord(row, []);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        fail(
          409,
          "HOME_SECTION_CONFLICT",
          "Home content conflict",
          "A section or hotspot order is duplicated.",
        );
      }
      throw error;
    }
  }

  async publishDraft(actorUserId: string): Promise<AdminHomeRevision> {
    return this.database.transaction().execute(async (trx) => {
      const draft = await trx
        .selectFrom("content.home_revisions")
        .selectAll()
        .where("status", "=", "draft")
        .executeTakeFirst();
      if (!draft) {
        fail(
          404,
          "HOME_DRAFT_NOT_FOUND",
          "Home draft not found",
          "Create and save a homepage draft before publishing.",
        );
      }
      const draftRevision = (
        await this.hydrateRevisions(trx, [draft], false)
      )[0];
      const sections = draftRevision?.sections ?? [];
      const inputs: HomeSectionInput[] = sections.map(sectionInputFromRecord);
      await this.assertMedia(trx, inputs, true);
      await this.assertProducts(trx, inputs, true);
      await trx
        .updateTable("content.home_revisions")
        .set({
          status: "archived",
          published_at: null,
          updated_by: actorUserId,
        })
        .where("status", "=", "published")
        .execute();
      const published = await this.cloneRevision(
        trx,
        draft,
        "published",
        actorUserId,
      );
      return revisionRecord(
        published,
        (await this.hydrateRevisions(trx, [published], false))[0]?.sections ??
          [],
      );
    });
  }

  async publishDraftSection(
    sectionKey: HomeSectionKey,
    actorUserId: string,
  ): Promise<AdminHomeRevision> {
    return this.database.transaction().execute(async (trx) => {
      const draftRow = await trx
        .selectFrom("content.home_revisions")
        .selectAll()
        .where("status", "=", "draft")
        .executeTakeFirst();
      if (!draftRow) {
        fail(
          404,
          "HOME_DRAFT_NOT_FOUND",
          "Home draft not found",
          "Create and save a homepage section draft before publishing.",
        );
      }
      const draftRevision = (
        await this.hydrateRevisions(trx, [draftRow], false)
      )[0];
      const draftSection = draftRevision?.sections.find(
        (section) => section.sectionKey === sectionKey,
      );
      if (!draftSection) {
        fail(
          404,
          "HOME_SECTION_NOT_FOUND",
          "Home section not found",
          `The ${sectionKey} section is not configured in the draft.`,
        );
      }
      const sectionInput = sectionInputFromRecord(draftSection);
      await this.assertMedia(trx, [sectionInput], true);
      await this.assertProducts(trx, [sectionInput], true);

      const publishedRow = await trx
        .selectFrom("content.home_revisions")
        .selectAll()
        .where("status", "=", "published")
        .executeTakeFirst();
      if (!publishedRow) {
        const published = await this.cloneRevision(
          trx,
          draftRow,
          "published",
          actorUserId,
          draftRow.version,
        );
        return revisionRecord(
          published,
          (await this.hydrateRevisions(trx, [published], false))[0]?.sections ??
            [],
        );
      }

      await trx
        .updateTable("content.home_revisions")
        .set({
          status: "archived",
          published_at: null,
          updated_by: actorUserId,
        })
        .where("id", "=", publishedRow.id)
        .execute();
      const published = await this.cloneRevision(
        trx,
        publishedRow,
        "published",
        actorUserId,
        publishedRow.version + 1,
      );
      await this.replaceRevisionSection(trx, published.id, sectionInput);
      return revisionRecord(
        published,
        (await this.hydrateRevisions(trx, [published], false))[0]?.sections ??
          [],
      );
    });
  }

  async archivePublished(actorUserId: string): Promise<AdminHomeRevision> {
    const row = await this.database
      .updateTable("content.home_revisions")
      .set({ status: "archived", published_at: null, updated_by: actorUserId })
      .where("status", "=", "published")
      .returningAll()
      .executeTakeFirst();
    if (!row) {
      fail(
        404,
        "HOME_PUBLISHED_NOT_FOUND",
        "Published home not found",
        "There is no published homepage configuration to archive.",
      );
    }
    return revisionRecord(
      row,
      (await this.hydrateRevisions(this.database, [row], false))[0]?.sections ??
        [],
    );
  }

  async archivePublishedSection(
    sectionKey: HomeSectionKey,
    actorUserId: string,
  ): Promise<AdminHomeRevision> {
    return this.database.transaction().execute(async (trx) => {
      const publishedRow = await trx
        .selectFrom("content.home_revisions")
        .selectAll()
        .where("status", "=", "published")
        .executeTakeFirst();
      if (!publishedRow) {
        fail(
          404,
          "HOME_PUBLISHED_NOT_FOUND",
          "Published home not found",
          "There is no published homepage configuration to archive.",
        );
      }
      const publishedRevision = (
        await this.hydrateRevisions(trx, [publishedRow], false)
      )[0];
      const currentSection = publishedRevision?.sections.find(
        (section) => section.sectionKey === sectionKey,
      );
      if (!currentSection) {
        fail(
          404,
          "HOME_SECTION_NOT_FOUND",
          "Home section not found",
          `The ${sectionKey} section is not published.`,
        );
      }
      await trx
        .updateTable("content.home_revisions")
        .set({
          status: "archived",
          published_at: null,
          updated_by: actorUserId,
        })
        .where("id", "=", publishedRow.id)
        .execute();
      const archived = await this.cloneRevision(
        trx,
        publishedRow,
        "published",
        actorUserId,
        publishedRow.version + 1,
      );
      await this.replaceRevisionSection(trx, archived.id, {
        ...sectionInputFromRecord(currentSection),
        isEnabled: false,
      });
      return revisionRecord(
        archived,
        (await this.hydrateRevisions(trx, [archived], false))[0]?.sections ??
          [],
      );
    });
  }

  async getPublishedHome(): Promise<PublicHomeContent | null> {
    const revisions = await this.revisionRecords(
      this.database,
      ["published"],
      true,
    );
    const revision = revisions[0];
    if (!revision?.publishedAt) return null;
    return {
      version: revision.version,
      publishedAt: revision.publishedAt,
      sections: revision.sections
        .filter((section) => section.isEnabled)
        .map((section) => ({
          sectionKey: section.sectionKey,
          sortOrder: section.sortOrder,
          isEnabled: section.isEnabled,
          payload:
            section.sectionKey === "promo_banner"
              ? normalizePromoBannerPayload(section.payload)
              : section.payload,
          media: section.media
            ? { publicUrl: section.media.publicUrl, alt: section.media.alt }
            : null,
          mobileMedia: section.mobileMedia
            ? {
                publicUrl: section.mobileMedia.publicUrl,
                alt: section.mobileMedia.alt,
              }
            : null,
          hotspots: section.hotspots.map((hotspot) => ({
            productId: hotspot.productId,
            xPercent: hotspot.xPercent,
            yPercent: hotspot.yPercent,
            label: hotspot.label,
            sortOrder: hotspot.sortOrder,
            product: hotspot.product,
          })),
        })),
    };
  }
}
