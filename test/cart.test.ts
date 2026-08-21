import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import {
  resolveLineImage,
  type CartRepository,
  type CartSession,
} from "../src/cart/cart-repository.js";
import type { Product } from "../src/catalog/product-repository.js";
import { loadEnvironment } from "../src/config/environment.js";
import {
  FakeAdminAccessRepository,
  FakeAuditRepository,
  FakeDatabaseConnection,
  FakeJwtVerifier,
} from "./support/fakes.js";

const cart: CartSession["cart"] = {
  cartId: "33333333-3333-4333-8333-333333333333",
  currency: "TND",
  expiresAt: "2026-09-01T00:00:00.000Z",
  items: [],
  itemCount: 0,
  lineCount: 0,
  totals: {
    subtotalMinor: 0,
    discountMinor: 0,
    shippingMinor: 0,
    totalEstimatedMinor: 0,
    freeShippingThresholdMinor: 200_000,
    amountUntilFreeShippingMinor: 200_000,
    hasFreeShipping: false,
    requiresShippingQuote: false,
  },
  promotion: null,
  hasUnavailableItems: false,
  hasPriceChanges: false,
};

class FakeCartRepository implements CartRepository {
  readonly calls: string[] = [];

  getCart(token: string | null): Promise<CartSession> {
    this.calls.push(`get:${token ?? "new"}`);
    return Promise.resolve({
      token: "cart-token-test-abcdefghijklmnopqrstuvwxyz",
      cart,
    });
  }

  addItem(): Promise<CartSession> {
    this.calls.push("add");
    return Promise.resolve({
      token: "cart-token-test-abcdefghijklmnopqrstuvwxyz",
      cart,
    });
  }

  updateItem(): Promise<CartSession> {
    this.calls.push("update");
    return Promise.resolve({
      token: "cart-token-test-abcdefghijklmnopqrstuvwxyz",
      cart,
    });
  }

  removeItem(): Promise<CartSession> {
    this.calls.push("remove");
    return Promise.resolve({
      token: "cart-token-test-abcdefghijklmnopqrstuvwxyz",
      cart,
    });
  }

  clearCart(): Promise<CartSession> {
    this.calls.push("clear");
    return Promise.resolve({
      token: "cart-token-test-abcdefghijklmnopqrstuvwxyz",
      cart,
    });
  }

  applyPromotion(): Promise<CartSession> {
    this.calls.push("promotion");
    return Promise.resolve({
      token: "cart-token-test-abcdefghijklmnopqrstuvwxyz",
      cart,
    });
  }

  removePromotion(): Promise<CartSession> {
    this.calls.push("remove-promotion");
    return Promise.resolve({
      token: "cart-token-test-abcdefghijklmnopqrstuvwxyz",
      cart,
    });
  }
}

const environment = loadEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGINS: "http://localhost:3001",
  DOCS_ENABLED: "false",
});

describe("Guest cart API", () => {
  let app: FastifyInstance;
  let repository: FakeCartRepository;

  beforeEach(async () => {
    repository = new FakeCartRepository();
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier: new FakeJwtVerifier(),
      adminAccessRepository: new FakeAdminAccessRepository(),
      auditRepository: new FakeAuditRepository(),
      cartRepository: repository,
    });
  });

  afterEach(async () => app.close());

  it("creates an opaque HttpOnly cookie on the first read", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/cart" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["set-cookie"]).toContain("hbs_cart_token=");
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(repository.calls).toEqual(["get:new"]);
  });

  it("accepts the cart cookie for mutations", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cart/items",
      headers: {
        cookie: "hbs_cart_token=cart-token-test-abcdefghijklmnopqrstuvwxyz",
      },
      payload: { productId: "product-1", variantId: "variant-1", quantity: 1 },
    });
    expect(response.statusCode).toBe(200);
    expect(repository.calls).toEqual(["add"]);
  });
});

describe("Cart line media", () => {
  it("falls back to the product front image when the variant has no media ids", () => {
    const product = {
      imageAlt: "Rideau en lin naturel HBS HOME",
      images: [
        {
          id: "front-image",
          url: "https://cdn.example.test/rideau-lin.jpg",
          alt: "Rideau en lin naturel",
          type: "front",
        },
      ],
    } as unknown as Product;
    const variant = {
      imageIds: [],
      imageUrl: "/catalog/rideau-lin-naturel.jpg",
    } as unknown as Product["variants"][number];

    expect(resolveLineImage(product, variant)).toEqual({
      url: "https://cdn.example.test/rideau-lin.jpg",
      alt: "Rideau en lin naturel",
    });
  });
});
