import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/environment.js";
import {
  FakeAdminAccessRepository,
  FakeAdminContentRepository,
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

describe("Admin content media API", () => {
  let app: FastifyInstance;
  let jwtVerifier: FakeJwtVerifier;
  let accessRepository: FakeAdminAccessRepository;
  let auditRepository: FakeAuditRepository;
  let contentRepository: FakeAdminContentRepository;

  beforeEach(async () => {
    jwtVerifier = new FakeJwtVerifier();
    accessRepository = new FakeAdminAccessRepository();
    auditRepository = new FakeAuditRepository();
    contentRepository = new FakeAdminContentRepository();
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier,
      adminAccessRepository: accessRepository,
      auditRepository,
      adminContentRepository: contentRepository,
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

  it("requires the media read permission", async () => {
    authorize("aal1", []);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/media",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("lists media with read permission without MFA", async () => {
    authorize("aal1", ["media.read"]);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/media",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [] });
  });

  it("requires aal2 to create and archive a media asset", async () => {
    authorize("aal1", ["media.write"]);
    const blocked = await app.inject({
      method: "POST",
      url: "/api/v1/admin/media",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        storagePath: "editorial/home/hero.webp",
        publicUrl:
          "https://example.test/storage/v1/object/public/editorial-media/editorial/home/hero.webp",
        name: "Hero accueil",
        alt: "Rideaux HBS HOME dans un salon lumineux",
        width: 1600,
        height: 900,
        mimeType: "image/webp",
      },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({ code: "MFA_REQUIRED" });

    authorize("aal2", ["media.write"]);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/media",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        storagePath: "editorial/home/hero.webp",
        publicUrl:
          "https://example.test/storage/v1/object/public/editorial-media/editorial/home/hero.webp",
        name: "Hero accueil",
        alt: "Rideaux HBS HOME dans un salon lumineux",
        width: 1600,
        height: 900,
        mimeType: "image/webp",
        status: "active",
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      status: "active",
      mimeType: "image/webp",
    });

    const archived = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/media/media-test-1",
      headers: { authorization: "Bearer valid-token" },
      payload: { status: "archived" },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toMatchObject({ status: "archived" });
    expect(
      auditRepository.events
        .map((event) => event.action)
        .filter((action) => action.startsWith("content.")),
    ).toEqual(["content.media_created", "content.media_updated"]);
  });
});
