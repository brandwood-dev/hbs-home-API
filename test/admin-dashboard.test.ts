import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/environment.js";
import type {
  InventoryRepository,
  InventoryRow,
} from "../src/inventory/inventory-repository.js";
import type {
  AdminOrder,
  PostgresAdminOrderRepository,
} from "../src/orders/admin-order-repository.js";
import {
  FakeAdminAccessRepository,
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

function orderFixture(
  status: AdminOrder["status"],
  createdAt: string,
): AdminOrder {
  return {
    id: `${status}-order-1`,
    orderNumber: `HBS-${status}`,
    createdAt,
    updatedAt: createdAt,
    status,
    paymentStatus: "collected",
    paymentMethod: "cash_on_delivery",
    customerId: "44444444-4444-4444-8444-444444444444",
    customerName: "Test Client",
    customerPhone: "+21620123456",
    customerEmail: null,
    deliveryMethod: "home_delivery",
    governorate: "Bizerte",
    city: "Bizerte",
    postalCode: null,
    addressLine: "1 rue de test",
    landmark: null,
    deliveryNote: null,
    items:
      status === "delivered"
        ? [
            {
              productId: "product-1",
              variantId: "variant-1",
              productName: "Rideau test",
              variantLabel: "Naturel",
              sku: "TEST-001",
              quantity: 2,
              unitPriceMinor: 18_900,
              lineTotalMinor: 37_800,
              productReference: "REF-001",
              productSlug: "rideau-test",
              imageUrl: "https://example.test/image.jpg",
              imageAlt: "Rideau test",
              selectedOptions: [],
              sellingUnitLabel: "Unité",
              shippingProfile: "standard",
            },
          ]
        : [],
    subtotalMinor: status === "delivered" ? 37_800 : 10_000,
    shippingMinor: 0,
    discountMinor: 0,
    totalMinor: status === "delivered" ? 37_800 : 10_000,
    timeline: [],
    notes: [],
    shipment: { shippingStatus: "calculated", shippingFeeMinor: 0 },
  };
}

const inventoryRow: InventoryRow = {
  productId: "product-1",
  productName: "Rideau test",
  categoryId: "category-1",
  updatedAt: new Date(0).toISOString(),
  variant: {
    id: "variant-1",
    sku: "TEST-001",
    colorId: "natural",
    colorLabel: "Naturel",
    widthCm: 140,
    heightCm: 250,
    curtainHeader: "Oeillets",
    priceMinor: 18_900,
    stock: 1,
    reserved: 0,
    lowStockThreshold: 3,
    availability: "low_stock",
    isActive: true,
    isDefault: true,
    options: {},
    trackInventory: true,
  },
};

class FakeInventoryRepository implements InventoryRepository {
  list(): Promise<readonly InventoryRow[]> {
    return Promise.resolve([inventoryRow]);
  }
  movements(): never {
    throw new Error("not used");
  }
  adjust(): never {
    throw new Error("not used");
  }
  updateSettings(): never {
    throw new Error("not used");
  }
}

describe("Admin dashboard API", () => {
  let app: FastifyInstance;
  let jwtVerifier: FakeJwtVerifier;
  let accessRepository: FakeAdminAccessRepository;
  let auditRepository: FakeAuditRepository;
  let requestedPeriod: { dateFrom?: string; dateTo?: string } | undefined;

  beforeEach(async () => {
    jwtVerifier = new FakeJwtVerifier();
    accessRepository = new FakeAdminAccessRepository();
    auditRepository = new FakeAuditRepository();
    const orders = [
      orderFixture("delivered", "2026-08-20T10:00:00.000Z"),
      orderFixture("pending_confirmation", "2026-08-21T10:00:00.000Z"),
    ];
    const adminOrderRepository = {
      listAll: (period: { dateFrom?: string; dateTo?: string } = {}) => {
        requestedPeriod = period;
        return Promise.resolve(
          orders.filter((order) => {
            const date = order.createdAt.slice(0, 10);
            return (
              (!period.dateFrom || date >= period.dateFrom) &&
              (!period.dateTo || date <= period.dateTo)
            );
          }),
        );
      },
    } as unknown as PostgresAdminOrderRepository;

    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier,
      adminAccessRepository: accessRepository,
      auditRepository,
      adminOrderRepository,
      inventoryRepository: new FakeInventoryRepository(),
    });
  });

  afterEach(async () => app.close());

  function authorize(assuranceLevel: "aal1" | "aal2"): void {
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
      roles: ["super_admin"],
      permissions: ["orders.read", "inventory.read"],
    });
  }

  it("requires MFA for dashboard metrics", async () => {
    authorize("aal1");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/dashboard",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("returns live aggregated order and stock metrics", async () => {
    authorize("aal2");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/dashboard",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      revenueMinor: 37_800,
      deliveredCount: 1,
      averageOrderValueMinor: 37_800,
      totalOrders: 2,
      pendingConfirmationCount: 1,
      lowStockCount: 1,
      topProducts: [
        { productId: "product-1", quantity: 2, revenueMinor: 37_800 },
      ],
    });
  });

  it("passes an inclusive date range to the order repository", async () => {
    authorize("aal2");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/dashboard?dateFrom=2026-08-21&dateTo=2026-08-21",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(requestedPeriod).toEqual({
      dateFrom: "2026-08-21",
      dateTo: "2026-08-21",
    });
    expect(response.json()).toMatchObject({
      revenueMinor: 0,
      deliveredCount: 0,
      totalOrders: 1,
      pendingConfirmationCount: 1,
    });
  });

  it("rejects an invalid or excessively large date range", async () => {
    authorize("aal2");
    const reversed = await app.inject({
      method: "GET",
      url: "/api/v1/admin/dashboard?dateFrom=2026-08-22&dateTo=2026-08-21",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(reversed.statusCode).toBe(400);

    const tooLarge = await app.inject({
      method: "GET",
      url: "/api/v1/admin/dashboard?dateFrom=2025-01-01&dateTo=2026-08-21",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(tooLarge.statusCode).toBe(400);
  });
});
