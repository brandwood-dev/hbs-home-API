import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type {
  FavoriteItem,
  FavoritesRepository,
  FavoritesSession,
  FavoritesView,
} from "../src/favorites/favorites-repository.js";
import type { Product } from "../src/catalog/product-repository.js";
import { loadEnvironment } from "../src/config/environment.js";
import {
  FakeAdminAccessRepository,
  FakeAuditRepository,
  FakeDatabaseConnection,
  FakeJwtVerifier,
} from "./support/fakes.js";

const product = {
  id: "product-1",
  slug: "rideau-lin",
  name: "Rideau lin naturel",
  reference: "HBS-RID-LIN-001",
  category: "rideaux",
  material: "lin",
  sellingMode: "ready_made",
  isLargeWidth: false,
  shortDescription: "Rideau",
  longDescription: "Rideau",
  imageAlt: "Rideau lin naturel",
  images: [],
  variants: [],
  colors: [],
  details: {},
  attributes: {},
  seo: { title: "Rideau", description: "Rideau" },
  isThermal: false,
  isNew: true,
  isBestSeller: false,
  isFeatured: false,
  createdAt: "2026-08-22T00:00:00.000Z",
  recommendationScore: 1,
  isDemo: false,
} as unknown as Product;

const environment = loadEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGINS: "http://localhost:3001",
  DOCS_ENABLED: "false",
});

function view(items: FavoriteItem[] = []): FavoritesView {
  return { items, removedProductIds: [], count: items.length };
}

class FakeFavoritesRepository implements FavoritesRepository {
  private current: FavoriteItem[] = [];
  readonly calls: string[] = [];

  private session(): FavoritesSession {
    return {
      token: "favorites-token-abcdefghijklmnopqrstuvwxyz",
      favorites: view(this.current),
    };
  }

  get(token: string | null): Promise<FavoritesSession> {
    this.calls.push(`get:${token ?? "new"}`);
    return Promise.resolve(this.session());
  }

  add(token: string | null, productId: string): Promise<FavoritesSession> {
    this.calls.push(`add:${token ?? "new"}:${productId}`);
    if (!this.current.some((item) => item.productId === productId)) {
      this.current = [
        {
          productId,
          addedAt: "2026-08-22T00:00:00.000Z",
          product,
          isAvailable: true,
        },
      ];
    }
    return Promise.resolve(this.session());
  }

  remove(token: string | null, productId: string): Promise<FavoritesSession> {
    this.calls.push(`remove:${token ?? "new"}:${productId}`);
    this.current = this.current.filter((item) => item.productId !== productId);
    return Promise.resolve(this.session());
  }

  clear(token: string | null): Promise<FavoritesSession> {
    this.calls.push(`clear:${token ?? "new"}`);
    this.current = [];
    return Promise.resolve(this.session());
  }
}

describe("Guest favorites API", () => {
  let app: FastifyInstance;
  let repository: FakeFavoritesRepository;

  beforeEach(async () => {
    repository = new FakeFavoritesRepository();
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier: new FakeJwtVerifier(),
      adminAccessRepository: new FakeAdminAccessRepository(),
      auditRepository: new FakeAuditRepository(),
      favoritesRepository: repository,
    });
  });

  afterEach(async () => app.close());

  it("creates an opaque HttpOnly cookie on first read", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/favorites",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["set-cookie"]).toContain("hbs_favorites_token=");
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(repository.calls).toEqual(["get:new"]);
  });

  it("accepts the cookie for add, remove and clear", async () => {
    const cookie =
      "hbs_favorites_token=favorites-token-abcdefghijklmnopqrstuvwxyz";
    const add = await app.inject({
      method: "POST",
      url: "/api/v1/favorites/items",
      headers: { cookie },
      payload: { productId: "product-1" },
    });
    expect(add.statusCode).toBe(200);
    expect(add.json()).toMatchObject({ count: 1 });

    const remove = await app.inject({
      method: "DELETE",
      url: "/api/v1/favorites/items/product-1",
      headers: { cookie },
    });
    expect(remove.statusCode).toBe(200);
    expect(remove.json()).toMatchObject({ count: 0 });

    const clear = await app.inject({
      method: "DELETE",
      url: "/api/v1/favorites",
      headers: { cookie },
    });
    expect(clear.statusCode).toBe(200);
    expect(repository.calls).toEqual([
      "add:favorites-token-abcdefghijklmnopqrstuvwxyz:product-1",
      "remove:favorites-token-abcdefghijklmnopqrstuvwxyz:product-1",
      "clear:favorites-token-abcdefghijklmnopqrstuvwxyz",
    ]);
  });
});
