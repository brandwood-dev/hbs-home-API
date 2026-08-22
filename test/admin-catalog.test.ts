import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/environment.js";
import {
  FakeAdminAccessRepository,
  FakeAdminCatalogRepository,
  FakeAuditRepository,
  FakeDatabaseConnection,
  FakeJwtVerifier,
} from "./support/fakes.js";

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

  beforeEach(async () => {
    jwtVerifier = new FakeJwtVerifier();
    accessRepository = new FakeAdminAccessRepository();
    auditRepository = new FakeAuditRepository();
    catalogRepository = new FakeAdminCatalogRepository();
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier,
      adminAccessRepository: accessRepository,
      auditRepository,
      adminCatalogRepository: catalogRepository,
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
});
