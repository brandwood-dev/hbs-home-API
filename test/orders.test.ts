import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/environment.js";
import type {
  CreateOrderInput,
  OrderRepository,
  PublicOrder,
  PublicOrderTracking,
} from "../src/orders/order-repository.js";
import {
  FakeAdminAccessRepository,
  FakeAuditRepository,
  FakeDatabaseConnection,
  FakeJwtVerifier,
} from "./support/fakes.js";

const order: PublicOrder = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  orderNumber: "HBS-20260821-ABC123",
  status: "pending_confirmation",
  customer: {
    firstName: "Test",
    lastName: "Client",
    phone: "+21622123456",
  },
  deliveryMethod: "store_pickup",
  paymentMethod: "cash_on_delivery",
  items: [
    {
      productId: "product-1",
      variantId: "variant-1",
      productSlug: "rideau-lin-naturel",
      productName: "Rideau lin naturel",
      productReference: "HBS-RID-LIN-001",
      sku: "HBS-RID-LIN-001-140-250",
      imageUrl: "https://cdn.example.test/rideau.jpg",
      imageAlt: "Rideau lin naturel",
      category: "rideaux",
      selectedOptions: [],
      sellingUnitLabel: "ready_made",
      quantity: 1,
      unitPriceMinor: 18_900,
      lineTotalMinor: 18_900,
    },
  ],
  totals: {
    subtotalMinor: 18_900,
    discountMinor: 0,
    shippingMinor: 0,
    totalMinor: 18_900,
  },
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
  idempotencyKey: "checkout-test-1",
  isDemo: false,
};

class FakeOrderRepository implements OrderRepository {
  readonly creates: CreateOrderInput[] = [];
  trackResult: PublicOrderTracking | null = null;

  create(input: CreateOrderInput): Promise<PublicOrder> {
    this.creates.push(input);
    return Promise.resolve(order);
  }

  getByNumber(): Promise<PublicOrder | null> {
    return Promise.resolve(order);
  }

  track(): Promise<PublicOrderTracking | null> {
    return Promise.resolve(this.trackResult);
  }
}

const environment = loadEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGINS: "http://localhost:3001",
  DOCS_ENABLED: "false",
});

describe("Guest orders API", () => {
  let app: FastifyInstance;
  let repository: FakeOrderRepository;

  beforeEach(async () => {
    repository = new FakeOrderRepository();
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier: new FakeJwtVerifier(),
      adminAccessRepository: new FakeAdminAccessRepository(),
      auditRepository: new FakeAuditRepository(),
      orderRepository: repository,
    });
  });

  afterEach(async () => app.close());

  it("requires an idempotency key and forwards the opaque cart cookie", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: {
        cookie: "hbs_cart_token=cart-token-test-abcdefghijklmnopqrstuvwxyz",
        "idempotency-key": "checkout-test-1",
      },
      payload: {
        customer: order.customer,
        deliveryMethod: "store_pickup",
        paymentMethod: "cash_on_delivery",
        items: [
          {
            productId: "product-1",
            variantId: "variant-1",
            quantity: 1,
            expectedUnitPriceMinor: 18_900,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(repository.creates).toHaveLength(1);
    expect(repository.creates[0]?.cartToken).toBe(
      "cart-token-test-abcdefghijklmnopqrstuvwxyz",
    );
    expect(response.json()).toMatchObject({
      orderNumber: order.orderNumber,
      isDemo: false,
    });
  });

  it("does not reveal whether a tracking number exists without the phone", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders/track",
      payload: { orderNumber: order.orderNumber, phone: "+21655111222" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "ORDER_NOT_FOUND" });
  });
});
