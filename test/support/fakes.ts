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
    return Promise.resolve(
      this.events.slice(-limit).map((event, index) => ({
        ...event,
        id: String(index + 1),
        occurredAt: new Date(0).toISOString(),
        resourceId: event.resourceId ?? null,
        sourceIp: event.sourceIp ?? null,
        userAgent: event.userAgent ?? null,
        metadata: event.metadata ?? {},
      })),
    );
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
      options: [],
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
