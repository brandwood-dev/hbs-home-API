import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/environment.js";
import type {
  ArticleRepository,
  PublicArticle,
  PublicArticleList,
} from "../src/content/article-repository.js";
import {
  FakeAdminAccessRepository,
  FakeAuditRepository,
  FakeDatabaseConnection,
  FakeJwtVerifier,
} from "./support/fakes.js";

const environment = loadEnvironment({
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: "3000",
  LOG_LEVEL: "silent",
  CORS_ORIGINS: "http://localhost:3001",
  DOCS_ENABLED: "true",
  API_PUBLIC_URL: "http://localhost:3000",
  RELEASE_VERSION: "0.5.0-test",
  GIT_SHA: "test-sha",
  BUILD_TIME: "2026-08-24T00:00:00.000Z",
});

const article: PublicArticle = {
  id: "7d4c4d3a-c6a7-4a47-b7dc-4c20a7e4a4bb",
  slug: "mesurer-une-fenetre",
  title: "Mesurer une fenêtre",
  excerpt: "Les repères pour choisir les bonnes dimensions.",
  category: {
    id: "117b3a34-6520-4ea4-a6f7-f5f00b5b14b1",
    slug: "conseils",
    name: "Conseils",
    description: "",
    sortOrder: 10,
  },
  cover: {
    publicUrl: "https://images.example.test/window.webp",
    alt: "Fenêtre",
    width: 800,
    height: 600,
  },
  readingTimeMinutes: 4,
  authorName: "HBS HOME",
  publishedAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  isFeatured: true,
  bodyBlocks: [{ type: "paragraph", text: "Mesurez simplement." }],
  seoTitle: "Mesurer une fenêtre — HBS HOME",
  seoDescription: "Guide de mesure.",
};

const articleRepository: ArticleRepository = {
  listPublic(): Promise<PublicArticleList> {
    return Promise.resolve({
      items: [
        {
          id: article.id,
          slug: article.slug,
          title: article.title,
          excerpt: article.excerpt,
          category: article.category,
          cover: article.cover,
          readingTimeMinutes: article.readingTimeMinutes,
          authorName: article.authorName,
          publishedAt: article.publishedAt,
          updatedAt: article.updatedAt,
          isFeatured: article.isFeatured,
        },
      ],
      page: 1,
      pageSize: 12,
      total: 1,
      totalPages: 1,
    });
  },
  getPublicBySlug(slug) {
    return Promise.resolve(slug === article.slug ? article : null);
  },
  listCategories() {
    return Promise.resolve([article.category]);
  },
  list() {
    return Promise.resolve({ items: [], total: 0 });
  },
  get() {
    return Promise.resolve(null);
  },
  create() {
    return Promise.reject(new Error("not used"));
  },
  update() {
    return Promise.reject(new Error("not used"));
  },
  publish() {
    return Promise.reject(new Error("not used"));
  },
  archive() {
    return Promise.reject(new Error("not used"));
  },
  delete() {
    return Promise.reject(new Error("not used"));
  },
  duplicate() {
    return Promise.reject(new Error("not used"));
  },
};

describe("dynamic inspiration articles", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier: new FakeJwtVerifier(),
      adminAccessRepository: new FakeAdminAccessRepository(),
      auditRepository: new FakeAuditRepository(),
      articleRepository,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("lists published article summaries without body internals", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/content/articles?featured=true",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("s-maxage=60");
    expect(response.json()).toMatchObject({
      total: 1,
      items: [
        {
          slug: article.slug,
          title: article.title,
          cover: { publicUrl: article.cover?.publicUrl },
        },
      ],
    });
    const payload: unknown = response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("items" in payload) ||
      !Array.isArray(payload.items)
    ) {
      throw new Error("Article list response is invalid.");
    }
    expect(payload.items[0]).not.toHaveProperty("bodyBlocks");
  });

  it("returns a published article detail and hides missing slugs", async () => {
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/content/articles/${article.slug}`,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      slug: article.slug,
      bodyBlocks: article.bodyBlocks,
    });
    const missing = await app.inject({
      method: "GET",
      url: "/api/v1/content/articles/not-published",
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "ARTICLE_NOT_FOUND" });
  });

  it("protects article Admin routes", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/content/articles",
    });
    expect(response.statusCode).toBe(401);

    const deletion = await app.inject({
      method: "DELETE",
      url: "/api/v1/admin/content/articles/1205aaa4-509d-41fa-ad0b-a4a961077b0a",
    });
    expect(deletion.statusCode).toBe(401);
  });
});
