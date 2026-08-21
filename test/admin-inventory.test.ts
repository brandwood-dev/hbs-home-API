import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/environment.js";
import type {
  InventoryRepository,
  InventoryRow,
  StockAdjustmentInput,
  StockMovement,
  StockSettingsInput,
} from "../src/inventory/inventory-repository.js";
import {
  FakeAdminAccessRepository,
  FakeAuditRepository,
  FakeDatabaseConnection,
  FakeJwtVerifier,
} from "./support/fakes.js";

const userId = "11111111-1111-4111-8111-111111111111";
const variantId = "variant-test-1";
const productId = "product-test-1";
const environment = loadEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGINS: "http://localhost:3001",
  DOCS_ENABLED: "false",
});

const inventoryRow: InventoryRow = {
  productId,
  productName: "Rideau test",
  categoryId: "cat-test-1",
  updatedAt: new Date(0).toISOString(),
  variant: {
    id: variantId,
    sku: "TEST-001",
    colorId: "natural",
    colorLabel: "Naturel",
    widthCm: 140,
    heightCm: 250,
    curtainHeader: "Oeillets",
    priceMinor: 18900,
    stock: 8,
    reserved: 0,
    lowStockThreshold: 3,
    availability: "in_stock",
    isActive: true,
    isDefault: true,
    options: {},
    trackInventory: true,
  },
};

class FakeInventoryRepository implements InventoryRepository {
  readonly adjustments: StockAdjustmentInput[] = [];
  readonly settings: StockSettingsInput[] = [];
  readonly movementRows: StockMovement[] = [];

  list(): Promise<readonly InventoryRow[]> {
    return Promise.resolve([inventoryRow]);
  }

  movements(): Promise<readonly StockMovement[]> {
    return Promise.resolve(this.movementRows);
  }

  adjust(input: StockAdjustmentInput): Promise<InventoryRow> {
    this.adjustments.push(input);
    return Promise.resolve(inventoryRow);
  }

  updateSettings(input: StockSettingsInput): Promise<InventoryRow> {
    this.settings.push(input);
    return Promise.resolve(inventoryRow);
  }
}

describe("Admin inventory API", () => {
  let app: FastifyInstance;
  let jwtVerifier: FakeJwtVerifier;
  let accessRepository: FakeAdminAccessRepository;
  let auditRepository: FakeAuditRepository;
  let inventoryRepository: FakeInventoryRepository;

  beforeEach(async () => {
    jwtVerifier = new FakeJwtVerifier();
    accessRepository = new FakeAdminAccessRepository();
    auditRepository = new FakeAuditRepository();
    inventoryRepository = new FakeInventoryRepository();
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier,
      adminAccessRepository: accessRepository,
      auditRepository,
      inventoryRepository,
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
      roles: ["orders_manager"],
      permissions: ["inventory.read", "inventory.adjust"],
    });
  }

  it("requires authentication for stock reads", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/inventory",
    });
    expect(response.statusCode).toBe(401);
  });

  it("lists stock with read permission and no MFA", async () => {
    authorize("aal1");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/inventory",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [inventoryRow] });
  });

  it("requires MFA, passes idempotency and audits an adjustment", async () => {
    authorize("aal1");
    const blocked = await app.inject({
      method: "POST",
      url: "/api/v1/admin/inventory/adjustments",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        productId,
        variantId,
        type: "increase",
        quantity: 2,
        reason: "purchase",
      },
    });
    expect(blocked.statusCode).toBe(403);

    authorize("aal2");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/inventory/adjustments",
      headers: {
        authorization: "Bearer valid-token",
        "idempotency-key": "test-adjustment-1",
      },
      payload: {
        productId,
        variantId,
        type: "increase",
        quantity: 2,
        reason: "purchase",
        note: "Réception fournisseur",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(inventoryRepository.adjustments[0]).toMatchObject({
      operationKey: "test-adjustment-1",
      actorUserId: userId,
    });
    expect(auditRepository.events).toContainEqual(
      expect.objectContaining({
        action: "inventory.adjusted",
        outcome: "success",
      }),
    );
  });

  it("rejects an oversized idempotency key before touching the repository", async () => {
    authorize("aal2");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/inventory/adjustments",
      headers: {
        authorization: "Bearer valid-token",
        "idempotency-key": "x".repeat(161),
      },
      payload: {
        productId,
        variantId,
        type: "increase",
        quantity: 1,
        reason: "purchase",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(inventoryRepository.adjustments).toHaveLength(0);
  });
});
