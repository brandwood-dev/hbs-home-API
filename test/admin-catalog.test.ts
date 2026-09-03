import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/environment.js";
import {
  FakeAdminAccessRepository,
  FakeAdminCatalogRepository,
  FakeAuditRepository,
  FakeDatabaseConnection,
  FakeAdminContentRepository,
  FakeJwtVerifier,
} from "./support/fakes.js";

class UploadTestContentRepository extends FakeAdminContentRepository {
  override async createMedia(
    input: Parameters<FakeAdminContentRepository["createMedia"]>[0],
    actorUserId: string,
  ) {
    const item = await super.createMedia(input, actorUserId);
    return { ...item, id: "44444444-4444-4444-8444-444444444444" };
  }
}

const userId = "11111111-1111-4111-8111-111111111111";
const environment = loadEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGINS: "http://localhost:3001",
  DOCS_ENABLED: "false",
});

describe("Admin catalogue API", () => {
  let app: FastifyInstance;
  let jwtVerifier: FakeJwtVerifier;
  let accessRepository: FakeAdminAccessRepository;
  let auditRepository: FakeAuditRepository;
  let catalogRepository: FakeAdminCatalogRepository;
  let contentRepository: FakeAdminContentRepository;
  let mediaUploads: {
    bytes: Buffer;
    contentType: "image/jpeg" | "image/png" | "image/webp";
  }[];

  beforeEach(async () => {
    jwtVerifier = new FakeJwtVerifier();
    accessRepository = new FakeAdminAccessRepository();
    auditRepository = new FakeAuditRepository();
    catalogRepository = new FakeAdminCatalogRepository();
    contentRepository = new UploadTestContentRepository();
    mediaUploads = [];
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier,
      adminAccessRepository: accessRepository,
      auditRepository,
      adminCatalogRepository: catalogRepository,
      adminContentRepository: contentRepository,
      categoryMediaStorage: {
        upload: (input) => {
          mediaUploads.push(input);
          return Promise.resolve({
            storagePath: "catalog/categories/uploads/test.webp",
            publicUrl:
              "https://example.test/storage/v1/object/public/catalog-media/catalog/categories/uploads/test.webp",
            mimeType: "image/webp",
            width: 120,
            height: 80,
          });
        },
      },
    });
  });

  afterEach(async () => app.close());

  function authorize(
    assuranceLevel: "aal1" | "aal2",
    permissions: readonly string[],
  ): void {
    jwtVerifier.add("valid-token", {
      userId,
      email: "hhometn@gmail.com",
      assuranceLevel,
      sessionId: "22222222-2222-4222-8222-222222222222",
    });
    accessRepository.set({
      userId,
      email: "hhometn@gmail.com",
      displayName: "HBS HOME Admin",
      status: "active",
      roles: ["catalog_manager"],
      permissions,
    });
  }

  it("requires authentication for Admin catalogue reads", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/categories",
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("allows catalogue reads with the read permission and no MFA", async () => {
    authorize("aal1", ["categories.read"]);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/categories",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [] });
  });

  it("disables caching for an Admin product read", async () => {
    authorize("aal1", ["products.read"]);
    await catalogRepository.createProduct({
      slug: "rideau-test",
      name: "Rideau test",
      reference: "RID-TEST-001",
      categoryId: "cat-test-1",
      material: "lin",
      sellingMode: "ready_made",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/products/product-test-1",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("uploads a category image through the Admin media pipeline", async () => {
    authorize("aal2", ["categories.write"]);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/categories/image",
      headers: {
        authorization: "Bearer valid-token",
        "content-type": "image/png",
        "x-image-name": "Rideaux",
        "x-image-alt": "Rideaux en lin",
      },
      payload: Buffer.from("fake-png"),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      mediaAssetId: "44444444-4444-4444-8444-444444444444",
      mimeType: "image/webp",
      width: 120,
      height: 80,
    });
    expect(mediaUploads).toHaveLength(1);
    expect(mediaUploads[0]).toMatchObject({ contentType: "image/png" });
    expect(auditRepository.events).toContainEqual(
      expect.objectContaining({ action: "catalog.category_image_uploaded" }),
    );

    const encodedMetadata = await app.inject({
      method: "POST",
      url: "/api/v1/admin/categories/image",
      headers: {
        authorization: "Bearer valid-token",
        "content-type": "image/png",
        "x-image-name": encodeURIComponent("Catégorie été"),
        "x-image-alt": encodeURIComponent("Image d’été"),
      },
      payload: Buffer.from("fake-png"),
    });
    expect(encodedMetadata.statusCode).toBe(201);
    expect(contentRepository.media.at(-1)).toMatchObject({
      name: "Catégorie été",
      alt: "Image d’été",
    });

    const unicodeMetadata = `${"a".repeat(239)}😀`;
    const unicodeResponse = await app.inject({
      method: "POST",
      url: "/api/v1/admin/categories/image",
      headers: {
        authorization: "Bearer valid-token",
        "content-type": "image/png",
        "x-image-name": encodeURIComponent(unicodeMetadata),
      },
      payload: Buffer.from("fake-png"),
    });
    expect(unicodeResponse.statusCode).toBe(201);
    expect(contentRepository.media.at(-1)?.name).toBe(unicodeMetadata);

    const unsupported = await app.inject({
      method: "POST",
      url: "/api/v1/admin/categories/image",
      headers: {
        authorization: "Bearer valid-token",
        "content-type": "image/gif",
      },
      payload: Buffer.from("fake-gif"),
    });
    expect(unsupported.statusCode).toBe(400);
    expect(unsupported.json()).toMatchObject({
      code: "MEDIA_TYPE_NOT_ALLOWED",
    });
  });

  it("requires aal2 and records a successful category mutation", async () => {
    authorize("aal1", ["categories.write"]);
    const blocked = await app.inject({
      method: "POST",
      url: "/api/v1/admin/categories",
      headers: { authorization: "Bearer valid-token" },
      payload: { slug: "stores", name: "Stores" },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({ code: "MFA_REQUIRED" });

    authorize("aal2", ["categories.write"]);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/categories",
      headers: { authorization: "Bearer valid-token" },
      payload: { slug: "stores", name: "Stores" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ slug: "stores", name: "Stores" });
    expect(auditRepository.events).toContainEqual(
      expect.objectContaining({
        action: "catalog.category_created",
        outcome: "success",
      }),
    );
  });

  it("accepts and returns the complete Phase 9A category and attribute contract", async () => {
    authorize("aal2", ["categories.write"]);
    const category = await app.inject({
      method: "POST",
      url: "/api/v1/admin/categories",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        slug: "stores",
        name: "Stores",
        description: "Stores HBS HOME",
        imageUrl: "https://cdn.example.test/stores.jpg",
        seoTitle: "Stores HBS HOME",
        seoDescription: "Découvrez nos stores.",
        showInNavigation: false,
        sortOrder: 3,
      },
    });
    expect(category.statusCode).toBe(201);
    expect(category.json()).toMatchObject({
      imageUrl: "https://cdn.example.test/stores.jpg",
      seoTitle: "Stores HBS HOME",
      seoDescription: "Découvrez nos stores.",
      showInNavigation: false,
    });

    const attribute = await app.inject({
      method: "POST",
      url: "/api/v1/admin/attributes",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        key: "color",
        name: "Couleur",
        valueType: "color",
        isFilterable: true,
        isVariantAxis: true,
        sortOrder: 4,
        isSystem: false,
        categorySlugs: ["stores"],
        options: [
          {
            value: "beige",
            label: "Beige",
            sortOrder: 1,
            hex: "#d8c4a8",
            family: "neutres",
            isActive: true,
          },
        ],
      },
    });
    expect(attribute.statusCode).toBe(201);
    expect(attribute.json()).toMatchObject({
      isVariantAxis: true,
      sortOrder: 4,
      categorySlugs: ["stores"],
      options: [
        expect.objectContaining({
          hex: "#d8c4a8",
          family: "neutres",
          isActive: true,
        }),
      ],
    });
  });

  it("protects category reordering with MFA and records the mutation", async () => {
    authorize("aal1", ["categories.write"]);
    const blocked = await app.inject({
      method: "POST",
      url: "/api/v1/admin/categories/cat-test-1/reorder",
      headers: { authorization: "Bearer valid-token" },
      payload: { direction: "down" },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({ code: "MFA_REQUIRED" });

    authorize("aal2", ["categories.write"]);
    catalogRepository.categories.push({
      id: "cat-test-1",
      slug: "rideaux",
      name: "Rideaux",
      description: null,
      parentId: null,
      status: "active",
      sortOrder: 0,
      imageUrl: null,
      imageMediaAssetId: null,
      seoTitle: null,
      seoDescription: null,
      showInNavigation: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/categories/cat-test-1/reorder",
      headers: { authorization: "Bearer valid-token" },
      payload: { direction: "down" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: "cat-test-1" });
    expect(auditRepository.events).toContainEqual(
      expect.objectContaining({
        action: "catalog.category_reordered",
        outcome: "success",
      }),
    );
  });

  it("enforces products.publish separately from products.write", async () => {
    authorize("aal2", ["products.write"]);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/admin/products",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        slug: "roller-blackout",
        name: "Roller Blackout",
        reference: "RB-001",
        categoryId: "cat-test-1",
        material: "polyester",
        sellingMode: "made_to_measure",
      },
    });
    expect(create.statusCode).toBe(201);
    const denied = await app.inject({
      method: "POST",
      url: "/api/v1/admin/products/product-test-1/publish",
      headers: { authorization: "Bearer valid-token" },
      payload: {},
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("accepts product attribute values in the Admin contract", async () => {
    authorize("aal2", ["products.write"]);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/products",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        slug: "rideau-lin",
        name: "Rideau lin",
        reference: "RID-LIN-001",
        categoryId: "cat-test-1",
        material: "lin",
        sellingMode: "ready_made",
        attributes: {
          opacity: "tamisant",
          machine_washable: true,
        },
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      attributes: {
        opacity: "tamisant",
        machine_washable: true,
      },
    });
  });
});
