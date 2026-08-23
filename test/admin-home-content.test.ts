import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/environment.js";
import {
  FakeAdminAccessRepository,
  FakeAuditRepository,
  FakeDatabaseConnection,
  FakeHomeContentRepository,
  FakeJwtVerifier,
} from "./support/fakes.js";

const userId = "11111111-1111-4111-8111-111111111111";
const environment = loadEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGINS: "http://localhost:3001",
  DOCS_ENABLED: "false",
});

describe("Admin homepage content API", () => {
  let app: FastifyInstance;
  let jwtVerifier: FakeJwtVerifier;
  let accessRepository: FakeAdminAccessRepository;
  let auditRepository: FakeAuditRepository;
  let homeRepository: FakeHomeContentRepository;

  beforeEach(async () => {
    jwtVerifier = new FakeJwtVerifier();
    accessRepository = new FakeAdminAccessRepository();
    auditRepository = new FakeAuditRepository();
    homeRepository = new FakeHomeContentRepository();
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier,
      adminAccessRepository: accessRepository,
      auditRepository,
      homeContentRepository: homeRepository,
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
      roles: ["content_editor"],
      permissions,
    });
  }

  it("keeps the public homepage unavailable until publication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/content/home",
    });
    expect(response.statusCode).toBe(404);
    expect(response.headers["cache-control"]).toBe("public, max-age=30");
    expect(response.json()).toMatchObject({ code: "HOME_CONTENT_NOT_FOUND" });
  });

  it("requires read permission for the Admin homepage", async () => {
    authorize("aal1", []);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/content/home",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "PERMISSION_DENIED" });

    authorize("aal1", ["content.read"]);
    const allowed = await app.inject({
      method: "GET",
      url: "/api/v1/admin/content/home",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers["cache-control"]).toBe("no-store");
  });

  it("requires MFA and validates hotspot coordinates when saving a draft", async () => {
    authorize("aal1", ["content.write"]);
    const mfaBlocked = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/content/home",
      headers: { authorization: "Bearer valid-token" },
      payload: { sections: [] },
    });
    expect(mfaBlocked.statusCode).toBe(403);
    expect(mfaBlocked.json()).toMatchObject({ code: "MFA_REQUIRED" });

    authorize("aal2", ["content.write"]);
    const invalid = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/content/home",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        sections: [
          {
            sectionKey: "shop_the_look",
            sortOrder: 0,
            hotspots: [
              {
                productId: "product-1",
                xPercent: 101,
                yPercent: 50,
                sortOrder: 0,
              },
            ],
          },
        ],
      },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it("publishes a homepage snapshot and strips internal identifiers publicly", async () => {
    authorize("aal2", ["content.write"]);
    const saved = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/content/home",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        sections: [
          {
            sectionKey: "hero",
            sortOrder: 0,
            payload: { eyebrow: "HBS HOME" },
          },
          {
            sectionKey: "shop_the_look",
            sortOrder: 1,
            hotspots: [
              {
                productId: "product-1",
                xPercent: 24.5,
                yPercent: 70,
                label: "Rideau lin",
                sortOrder: 0,
              },
            ],
          },
        ],
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ status: "draft", version: 1 });

    authorize("aal2", ["content.publish"]);
    const published = await app.inject({
      method: "POST",
      url: "/api/v1/admin/content/home/publish",
      headers: { authorization: "Bearer valid-token" },
      payload: {},
    });
    expect(published.statusCode).toBe(200);
    expect(published.json()).toMatchObject({ status: "published" });

    const publicResponse = await app.inject({
      method: "GET",
      url: "/api/v1/content/home",
    });
    expect(publicResponse.statusCode).toBe(200);
    expect(publicResponse.headers["cache-control"]).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
    expect(publicResponse.json()).toMatchObject({
      sections: [
        { sectionKey: "hero" },
        {
          sectionKey: "shop_the_look",
          hotspots: [{ productId: "product-1", xPercent: 24.5 }],
        },
      ],
    });
    expect(publicResponse.json()).not.toHaveProperty("id");
    const publicBody = publicResponse.json<{
      sections: ({ hotspots: Record<string, unknown>[] } & Record<
        string,
        unknown
      >)[];
    }>();
    expect(publicBody.sections[0]).not.toHaveProperty("id");
    const shopTheLook = publicBody.sections[1];
    expect(shopTheLook).toBeDefined();
    if (!shopTheLook) throw new Error("Expected Shop the Look section.");
    const hotspot = shopTheLook.hotspots[0];
    expect(hotspot).toBeDefined();
    if (!hotspot) throw new Error("Expected Shop the Look hotspot.");
    expect(hotspot).not.toHaveProperty("id");
    expect(auditRepository.events.map((event) => event.action)).toEqual([
      "content.home_updated",
      "content.home_published",
    ]);
  });

  it("archives the public snapshot", async () => {
    homeRepository.published = {
      id: "home-published-test-1",
      status: "published",
      version: 1,
      publishedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      sections: [],
    };
    authorize("aal2", ["content.publish"]);
    const archived = await app.inject({
      method: "POST",
      url: "/api/v1/admin/content/home/archive",
      headers: { authorization: "Bearer valid-token" },
      payload: {},
    });
    expect(archived.statusCode).toBe(200);
    const publicResponse = await app.inject({
      method: "GET",
      url: "/api/v1/content/home",
    });
    expect(publicResponse.statusCode).toBe(404);
  });
});
