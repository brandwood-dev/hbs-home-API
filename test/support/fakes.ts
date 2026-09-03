import type { Kysely } from "kysely";
import type {
  AuditEventInput,
  AuditEventRecord,
  AuditRepository,
} from "../../src/audit/audit-repository.js";
import {
  InvalidAccessTokenError,
  type JwtVerifier,
  type VerifiedAuthToken,
} from "../../src/auth/jwt-verifier.js";
import type { DatabaseConnection } from "../../src/database/connection.js";
import type { DatabaseSchema } from "../../src/database/schema.js";
import type {
  AdminAccess,
  AdminAccessRepository,
} from "../../src/identity/admin-access.js";
import type {
  AdminAttribute,
  AdminCatalogRepository,
  AdminCategory,
  AdminProduct,
  AttributeInput,
  AttributePatch,
  CategoryInput,
  CategoryPatch,
  ProductInput,
  ProductPatch,
  VariantInput,
  VariantPatch,
} from "../../src/catalog/admin-catalog-repository.js";
import type {
  AdminPromotion,
  AdminPromotionInput,
  AdminPromotionPatch,
  AdminPromotionRepository,
} from "../../src/promotions/admin-promotion-repository.js";
import type {
  AdminContentRepository,
  AdminEditorialPage,
  AdminMediaAsset,
  EditorialPageInput,
  EditorialPagePatch,
  MediaAssetInput,
  MediaAssetPatch,
} from "../../src/content/admin-content-repository.js";
import type {
  AdminHomeContent,
  AdminHomeRevision,
  HomeContentRepository,
  HomeDraftInput,
  HomeSectionInput,
  HomeSectionKey,
  PublicHomeContent,
} from "../../src/content/home-content-repository.js";

export class FakeDatabaseConnection implements DatabaseConnection {
  readonly client = undefined as unknown as Kysely<DatabaseSchema>;

  constructor(private healthy = true) {}

  checkHealth(): Promise<boolean> {
    return Promise.resolve(this.healthy);
  }

  destroy(): Promise<void> {
    return Promise.resolve();
  }

  setHealthy(healthy: boolean): void {
    this.healthy = healthy;
  }
}

export class FakeJwtVerifier implements JwtVerifier {
  private readonly tokens = new Map<string, VerifiedAuthToken>();

  add(token: string, claims: VerifiedAuthToken): void {
    this.tokens.set(token, claims);
  }

  verify(token: string): Promise<VerifiedAuthToken> {
    const claims = this.tokens.get(token);
    if (!claims) {
      return Promise.reject(new InvalidAccessTokenError("Invalid test token."));
    }
    return Promise.resolve(claims);
  }
}

export class FakeAdminAccessRepository implements AdminAccessRepository {
  private readonly accessByUserId = new Map<string, AdminAccess>();
  readonly lastSeen = new Set<string>();

  set(access: AdminAccess): void {
    this.accessByUserId.set(access.userId, access);
  }

  findByUserId(userId: string): Promise<AdminAccess | null> {
    return Promise.resolve(this.accessByUserId.get(userId) ?? null);
  }

  markLastSeen(userId: string): Promise<void> {
    this.lastSeen.add(userId);
    return Promise.resolve();
  }
}

export class FakeAuditRepository implements AuditRepository {
  readonly events: AuditEventInput[] = [];

  append(event: AuditEventInput): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  listRecent(limit: number): Promise<readonly AuditEventRecord[]> {
    return this.listRecentPage(limit, 0).then((page) => page.items);
  }

  listRecentPage(
    limit: number,
    offset: number,
  ): Promise<{
    items: readonly AuditEventRecord[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const records = this.events.map((event, index) => ({
        ...event,
        id: String(index + 1),
        occurredAt: new Date(0).toISOString(),
        resourceId: event.resourceId ?? null,
        sourceIp: event.sourceIp ?? null,
        userAgent: event.userAgent ?? null,
        metadata: event.metadata ?? {},
      }));
    return Promise.resolve({
      items: records.slice(offset, offset + limit),
      total: records.length,
      limit,
      offset,
    });
  }
}

export class FakeAdminCatalogRepository implements AdminCatalogRepository {
  readonly categories: AdminCategory[] = [];
  readonly attributes: AdminAttribute[] = [];
  readonly products: AdminProduct[] = [];

  listCategories(): Promise<readonly AdminCategory[]> {
    return Promise.resolve(this.categories);
  }
  createCategory(input: CategoryInput): Promise<AdminCategory> {
    const item: AdminCategory = {
      id: "cat-test-1",
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      parentId: input.parentId ?? null,
      status: input.status ?? "draft",
      sortOrder: input.sortOrder ?? 0,
      imageUrl: input.imageUrl ?? null,
      imageMediaAssetId: input.imageMediaAssetId ?? null,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      showInNavigation: input.showInNavigation ?? true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    this.categories.push(item);
    return Promise.resolve(item);
  }
  updateCategory(id: string, patch: CategoryPatch): Promise<AdminCategory> {
    const current = this.categories.find((item) => item.id === id);
    if (!current) return Promise.reject(new Error("missing category"));
    const item = {
      ...current,
      ...patch,
      parentId: patch.parentId ?? current.parentId,
    };
    return Promise.resolve(item);
  }
  reorderCategory(
    id: string,
    direction: "up" | "down",
  ): Promise<AdminCategory> {
    void direction;
    const current = this.categories.find((item) => item.id === id);
    return current
      ? Promise.resolve(current)
      : Promise.reject(new Error("missing category"));
  }
  listAttributes(): Promise<readonly AdminAttribute[]> {
    return Promise.resolve(this.attributes);
  }
  createAttribute(input: AttributeInput): Promise<AdminAttribute> {
    const item: AdminAttribute = {
      id: "attr-test-1",
      key: input.key,
      name: input.name,
      valueType: input.valueType,
      isFilterable: input.isFilterable ?? false,
      isRequired: input.isRequired ?? false,
      status: input.status ?? "draft",
      isVariantAxis: input.isVariantAxis ?? false,
      sortOrder: input.sortOrder ?? 0,
      isSystem: input.isSystem ?? false,
      categorySlugs: [...(input.categorySlugs ?? [])],
      options: (input.options ?? []).map((option, index) => ({
        id: `option-test-${String(index + 1)}`,
        value: option.value,
        label: option.label,
        sortOrder: option.sortOrder ?? index,
        hex: option.hex ?? null,
        family: option.family ?? null,
        isActive: option.isActive ?? true,
      })),
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    this.attributes.push(item);
    return Promise.resolve(item);
  }
  updateAttribute(id: string, patch: AttributePatch): Promise<AdminAttribute> {
    const current = this.attributes.find((item) => item.id === id);
    if (!current) return Promise.reject(new Error("missing attribute"));
    return Promise.resolve({ ...current, ...patch, options: current.options });
  }
  listProducts(): Promise<{ items: readonly AdminProduct[]; total: number }> {
    return Promise.resolve({
      items: this.products,
      total: this.products.length,
    });
  }
  getProduct(id: string): Promise<AdminProduct> {
    const item = this.products.find((product) => product.id === id);
    return item
      ? Promise.resolve(item)
      : Promise.reject(new Error("missing product"));
  }
  createProduct(input: ProductInput): Promise<AdminProduct> {
    const item: AdminProduct = {
      id: "product-test-1",
      slug: input.slug,
      name: input.name,
      reference: input.reference,
      shortDescription: input.shortDescription ?? null,
      longDescription: input.longDescription ?? null,
      imageAlt: input.imageAlt ?? null,
      status: "draft",
      categoryId: input.categoryId,
      categorySlug: "test",
      material: input.material,
      sellingMode: input.sellingMode,
      isPublished: false,
      publishedAt: null,
      archivedAt: null,
      version: 1,
      isDemo: input.isDemo ?? false,
      attributes: input.attributes ?? {},
      media: [],
      variants: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    this.products.push(item);
    return Promise.resolve(item);
  }
  updateProduct(id: string, patch: ProductPatch): Promise<AdminProduct> {
    const item = this.products.find((product) => product.id === id);
    return item
      ? Promise.resolve({ ...item, ...patch, version: item.version + 1 })
      : Promise.reject(new Error("missing product"));
  }
  publishProduct(id: string): Promise<AdminProduct> {
    const item = this.products.find((product) => product.id === id);
    return item
      ? Promise.resolve({ ...item, status: "active", isPublished: true })
      : Promise.reject(new Error("missing product"));
  }
  archiveProduct(id: string): Promise<AdminProduct> {
    const item = this.products.find((product) => product.id === id);
    return item
      ? Promise.resolve({ ...item, status: "archived", isPublished: false })
      : Promise.reject(new Error("missing product"));
  }
  createVariant(
    productId: string,
    _input: VariantInput,
  ): Promise<{ product: AdminProduct; variantId: string }> {
    void _input;
    return this.getProduct(productId).then((product) => ({
      product,
      variantId: "variant-test-1",
    }));
  }
  updateVariant(
    productId: string,
    _variantId: string,
    _patch: VariantPatch,
  ): Promise<AdminProduct> {
    void _variantId;
    void _patch;
    return this.getProduct(productId);
  }
  archiveVariant(productId: string, _variantId: string): Promise<AdminProduct> {
    void _variantId;
    return this.getProduct(productId);
  }
}

export class FakeAdminContentRepository implements AdminContentRepository {
  readonly media: AdminMediaAsset[] = [];
  readonly pages: AdminEditorialPage[] = [];

  listMedia(): Promise<readonly AdminMediaAsset[]> {
    return Promise.resolve(
      this.media.filter((item) => item.status !== "archived"),
    );
  }

  createMedia(
    input: MediaAssetInput,
    actorUserId: string,
  ): Promise<AdminMediaAsset> {
    void actorUserId;
    const now = new Date(0).toISOString();
    const item: AdminMediaAsset = {
      id: "media-test-1",
      storagePath: input.storagePath ?? "external/media-test-1",
      publicUrl: input.publicUrl,
      name: input.name,
      alt: input.alt,
      width: input.width ?? null,
      height: input.height ?? null,
      mimeType: input.mimeType,
      status: input.status ?? "draft",
      usage: input.usage ?? "unassigned",
      createdAt: now,
      updatedAt: now,
    };
    this.media.push(item);
    return Promise.resolve(item);
  }

  updateMedia(
    id: string,
    patch: MediaAssetPatch,
    actorUserId: string,
  ): Promise<AdminMediaAsset> {
    void actorUserId;
    const item = this.media.find((candidate) => candidate.id === id);
    if (!item) return Promise.reject(new Error("missing media"));
    Object.assign(item, patch, { updatedAt: new Date().toISOString() });
    return Promise.resolve(item);
  }

  listPages(includeArchived = false): Promise<readonly AdminEditorialPage[]> {
    return Promise.resolve(
      this.pages.filter(
        (item) => includeArchived || item.status !== "archived",
      ),
    );
  }

  getPage(id: string): Promise<AdminEditorialPage | null> {
    return Promise.resolve(this.pages.find((item) => item.id === id) ?? null);
  }

  createPage(
    input: EditorialPageInput,
    actorUserId: string,
  ): Promise<AdminEditorialPage> {
    void actorUserId;
    const now = new Date(0).toISOString();
    const page: AdminEditorialPage = {
      id: "page-test-1",
      slug: input.slug,
      title: input.title,
      body: input.body ?? "",
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      status: "draft",
      version: 1,
      publishedAt: null,
      updatedAt: now,
      blocks: (input.blocks ?? []).map((block, index) => ({
        id: `block-test-${String(index + 1)}`,
        sortOrder: block.sortOrder,
        blockType: block.blockType,
        payload: block.payload,
        media: null,
      })),
    };
    this.pages.push(page);
    return Promise.resolve(page);
  }

  updatePage(
    id: string,
    patch: EditorialPagePatch,
    actorUserId: string,
  ): Promise<AdminEditorialPage> {
    void actorUserId;
    const page = this.pages.find((item) => item.id === id);
    if (!page) return Promise.reject(new Error("missing page"));
    Object.assign(page, {
      ...patch,
      ...(patch.blocks
        ? {
            blocks: patch.blocks.map((block, index) => ({
              id: `block-test-${String(index + 1)}`,
              sortOrder: block.sortOrder,
              blockType: block.blockType,
              payload: block.payload,
              media: null,
            })),
          }
        : {}),
      version: page.version + 1,
      updatedAt: new Date().toISOString(),
    });
    return Promise.resolve(page);
  }

  publishPage(id: string, actorUserId: string): Promise<AdminEditorialPage> {
    void actorUserId;
    const page = this.pages.find((item) => item.id === id);
    if (!page) return Promise.reject(new Error("missing page"));
    page.status = "published";
    page.publishedAt = new Date(0).toISOString();
    page.version += 1;
    return Promise.resolve(page);
  }

  archivePage(id: string, actorUserId: string): Promise<AdminEditorialPage> {
    void actorUserId;
    const page = this.pages.find((item) => item.id === id);
    if (!page) return Promise.reject(new Error("missing page"));
    page.status = "archived";
    page.publishedAt = null;
    page.version += 1;
    return Promise.resolve(page);
  }

  getPublishedPageBySlug(slug: string): Promise<AdminEditorialPage | null> {
    return Promise.resolve(
      this.pages.find(
        (item) => item.slug === slug && item.status === "published",
      ) ?? null,
    );
  }
}

export class FakeHomeContentRepository implements HomeContentRepository {
  draft: AdminHomeRevision | null = null;
  published: AdminHomeRevision | null = null;

  getAdminHome(): Promise<AdminHomeContent> {
    return Promise.resolve({ draft: this.draft, published: this.published });
  }

  getAdminHomeSection(sectionKey: HomeSectionKey): Promise<AdminHomeContent> {
    const narrow = (revision: AdminHomeRevision | null) =>
      revision
        ? {
            ...revision,
            sections: revision.sections.filter(
              (section) => section.sectionKey === sectionKey,
            ),
          }
        : null;
    return Promise.resolve({
      draft: narrow(this.draft),
      published: narrow(this.published),
    });
  }

  updateDraft(input: HomeDraftInput): Promise<AdminHomeRevision> {
    const now = new Date(0).toISOString();
    const currentVersion = this.draft?.version ?? this.published?.version ?? 0;
    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== currentVersion
    ) {
      return Promise.reject(new Error("HOME_VERSION_CONFLICT"));
    }
    this.draft = {
      id: this.draft?.id ?? "00000000-0000-4000-8000-000000000001",
      status: "draft",
      version: currentVersion + 1,
      publishedAt: null,
      updatedAt: now,
      sections: input.sections.map((section, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        sectionKey: section.sectionKey,
        sortOrder: section.sortOrder,
        isEnabled: section.isEnabled ?? true,
        payload: section.payload ?? {},
        media: null,
        mobileMedia: null,
        hotspots: (section.hotspots ?? []).map((hotspot, hotspotIndex) => ({
          id: `10000000-0000-4000-8000-${String(hotspotIndex + 1).padStart(12, "0")}`,
          productId: hotspot.productId,
          xPercent: hotspot.xPercent,
          yPercent: hotspot.yPercent,
          label: hotspot.label ?? null,
          sortOrder: hotspot.sortOrder,
          product: null,
        })),
      })),
    };
    return Promise.resolve(this.draft);
  }

  updateDraftSection(
    input: HomeSectionInput & { expectedVersion?: number },
  ): Promise<AdminHomeRevision> {
    const currentSections =
      this.draft?.sections ?? this.published?.sections ?? [];
    const sections = [
      ...currentSections.filter(
        (section) => section.sectionKey !== input.sectionKey,
      ),
      input,
    ];
    return this.updateDraft({
      sections: sections.map((section) => {
        if ("id" in section) {
          return {
            sectionKey: section.sectionKey,
            sortOrder: section.sortOrder,
            isEnabled: section.isEnabled,
            payload: section.payload,
            hotspots: section.hotspots.map((hotspot) => ({
              productId: hotspot.productId,
              xPercent: hotspot.xPercent,
              yPercent: hotspot.yPercent,
              label: hotspot.label,
              sortOrder: hotspot.sortOrder,
            })),
          } satisfies HomeSectionInput;
        }
        return section;
      }),
      ...(input.expectedVersion === undefined
        ? {}
        : { expectedVersion: input.expectedVersion }),
    });
  }

  publishDraft(): Promise<AdminHomeRevision> {
    if (!this.draft) return Promise.reject(new Error("HOME_DRAFT_NOT_FOUND"));
    this.published = {
      ...this.draft,
      id: "00000000-0000-4000-8000-000000000002",
      status: "published",
      publishedAt: new Date(0).toISOString(),
    };
    return Promise.resolve(this.published);
  }

  publishDraftSection(sectionKey: HomeSectionKey): Promise<AdminHomeRevision> {
    if (!this.draft) return Promise.reject(new Error("HOME_DRAFT_NOT_FOUND"));
    const draftSection = this.draft.sections.find(
      (section) => section.sectionKey === sectionKey,
    );
    if (!draftSection)
      return Promise.reject(new Error("HOME_SECTION_NOT_FOUND"));
    const sections = this.published
      ? this.published.sections.map((section) =>
          section.sectionKey === sectionKey ? draftSection : section,
        )
      : this.draft.sections;
    this.published = {
      ...(this.published ?? this.draft),
      id: "00000000-0000-4000-8000-000000000002",
      status: "published",
      version: (this.published?.version ?? this.draft.version) + 1,
      publishedAt: new Date(0).toISOString(),
      sections,
    };
    return Promise.resolve(this.published);
  }

  archivePublished(): Promise<AdminHomeRevision> {
    if (!this.published) {
      return Promise.reject(new Error("HOME_PUBLISHED_NOT_FOUND"));
    }
    this.published = {
      ...this.published,
      status: "archived",
      publishedAt: null,
    };
    return Promise.resolve(this.published);
  }

  archivePublishedSection(
    sectionKey: HomeSectionKey,
  ): Promise<AdminHomeRevision> {
    if (!this.published) {
      return Promise.reject(new Error("HOME_PUBLISHED_NOT_FOUND"));
    }
    this.published = {
      ...this.published,
      version: this.published.version + 1,
      sections: this.published.sections.map((section) =>
        section.sectionKey === sectionKey
          ? { ...section, isEnabled: false }
          : section,
      ),
    };
    return Promise.resolve(this.published);
  }

  getPublishedHome(): Promise<PublicHomeContent | null> {
    if (this.published?.status !== "published") return Promise.resolve(null);
    return Promise.resolve({
      version: this.published.version,
      publishedAt: this.published.publishedAt ?? new Date(0).toISOString(),
      sections: this.published.sections.map((section) => ({
        sectionKey: section.sectionKey,
        sortOrder: section.sortOrder,
        isEnabled: section.isEnabled,
        payload: section.payload,
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
    });
  }
}

export class FakeAdminPromotionRepository implements AdminPromotionRepository {
  readonly promotions: AdminPromotion[] = [];

  list(input: {
    query?: string;
    isActive?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ items: readonly AdminPromotion[]; total: number }> {
    const query = input.query?.trim().toUpperCase();
    const filtered = this.promotions.filter(
      (promotion) =>
        (input.isActive === undefined ||
          promotion.isActive === input.isActive) &&
        (!query ||
          promotion.code.includes(query) ||
          promotion.name.toUpperCase().includes(query)),
    );
    return Promise.resolve({
      total: filtered.length,
      items: filtered.slice(input.offset, input.offset + input.limit),
    });
  }

  get(id: string): Promise<AdminPromotion> {
    const promotion = this.promotions.find((item) => item.id === id);
    return promotion
      ? Promise.resolve(promotion)
      : Promise.reject(new Error("missing promotion"));
  }

  create(input: AdminPromotionInput): Promise<AdminPromotion> {
    const now = new Date(0).toISOString();
    const promotion: AdminPromotion = {
      id: "promo-test-1",
      name: input.name,
      code: input.code.toUpperCase(),
      discountType: input.discountType,
      discountValue: input.discountValue,
      currency: "TND",
      minSubtotalMinor: input.minSubtotalMinor ?? 0,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      maxRedemptions: input.maxRedemptions ?? null,
      redeemedCount: 0,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.promotions.push(promotion);
    return Promise.resolve(promotion);
  }

  update(id: string, patch: AdminPromotionPatch): Promise<AdminPromotion> {
    const current = this.promotions.find((item) => item.id === id);
    if (!current) return Promise.reject(new Error("missing promotion"));
    Object.assign(
      current,
      patch,
      patch.code ? { code: patch.code.toUpperCase() } : {},
    );
    return Promise.resolve(current);
  }

  archive(id: string): Promise<AdminPromotion> {
    const current = this.promotions.find((item) => item.id === id);
    if (!current) return Promise.reject(new Error("missing promotion"));
    current.isActive = false;
    return Promise.resolve(current);
  }
}
