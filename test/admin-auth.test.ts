import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/environment.js";
import type {
  AdminOrder,
  AdminOrderStatusUpdateInput,
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

function orderFixture(status: AdminOrder["status"] = "confirmed"): AdminOrder {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    orderNumber: "HBS-20260821-ABC123",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    status,
    paymentStatus: "pending",
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
    items: [],
    subtotalMinor: 18_900,
    shippingMinor: 7_000,
    discountMinor: 0,
    totalMinor: 25_900,
    timeline: [],
    notes: [],
    shipment: { shippingStatus: "calculated", shippingFeeMinor: 7_000 },
  };
}

describe("Admin Auth, MFA and RBAC", () => {
  let app: FastifyInstance;
  let jwtVerifier: FakeJwtVerifier;
  let accessRepository: FakeAdminAccessRepository;
  let auditRepository: FakeAuditRepository;

  beforeEach(async () => {
    jwtVerifier = new FakeJwtVerifier();
    accessRepository = new FakeAdminAccessRepository();
    auditRepository = new FakeAuditRepository();
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier,
      adminAccessRepository: accessRepository,
      auditRepository,
    });
  });

  afterEach(async () => app.close());

  function authorize(
    assuranceLevel: "aal1" | "aal2",
    permissions: readonly string[] = ["admin.session_read", "audit.read"],
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
      roles: ["super_admin"],
      permissions,
    });
  }

  it("rejects an anonymous Admin request", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/session",
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("protects persisted Admin orders with authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/orders",
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("protects persisted Admin customers with authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/customers",
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("protects Admin order status mutations with authentication", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/orders/11111111-1111-4111-8111-111111111111/status",
      payload: { status: "confirmed" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("requires the order confirmation permission for status mutations", async () => {
    authorize("aal2", ["admin.session_read", "orders.read"]);
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/orders/11111111-1111-4111-8111-111111111111/status",
      headers: { authorization: "Bearer valid-token" },
      payload: { status: "confirmed" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "PERMISSION_DENIED" });
    expect(auditRepository.events).toContainEqual(
      expect.objectContaining({ action: "order.status_update_denied" }),
    );
  });

  it("updates an order status and records the actor audit event", async () => {
    await app.close();
    const order: AdminOrder = {
      id: "33333333-3333-4333-8333-333333333333",
      orderNumber: "HBS-20260821-ABC123",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      status: "pending_confirmation",
      paymentStatus: "pending",
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
      items: [],
      subtotalMinor: 18_900,
      shippingMinor: 7_000,
      discountMinor: 0,
      totalMinor: 25_900,
      timeline: [],
      notes: [],
      shipment: { shippingStatus: "calculated", shippingFeeMinor: 7_000 },
    };
    let received: AdminOrderStatusUpdateInput | null = null;
    const adminOrderRepository = {
      list: () =>
        Promise.resolve({
          items: [order],
          total: 1,
          page: 1,
          pageSize: 20,
          pageCount: 1,
          counters: {
            total: 1,
            pendingConfirmation: 1,
            confirmed: 0,
            preparing: 0,
            shipped: 0,
            delivered: 0,
            cancelled: 0,
            shippingToConfirm: 0,
            paymentPending: 1,
          },
          governorates: ["Bizerte"],
        }),
      getById: () => Promise.resolve(order),
      updateStatus: (input: AdminOrderStatusUpdateInput) => {
        received = input;
        return Promise.resolve({ ...order, status: input.status });
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
    });
    authorize("aal2", ["admin.session_read", "orders.read", "orders.confirm"]);

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/orders/${order.id}/status`,
      headers: { authorization: "Bearer valid-token" },
      payload: { status: "confirmed", note: "Client confirmé" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: order.id,
      status: "confirmed",
    });
    expect(received).toMatchObject({
      orderId: order.id,
      status: "confirmed",
      actorUserId: userId,
      note: "Client confirmé",
    });
    expect(auditRepository.events).toContainEqual(
      expect.objectContaining({
        action: "order.status_updated",
        resourceId: order.id,
        outcome: "success",
      }),
    );
  });

  it("updates payment state only with the payment permission", async () => {
    const order = orderFixture();
    let received: unknown;
    const adminOrderRepository = {
      list: () =>
        Promise.resolve({
          items: [order],
          total: 1,
          page: 1,
          pageSize: 20,
          pageCount: 1,
          counters: {
            total: 1,
            pendingConfirmation: 0,
            confirmed: 1,
            preparing: 0,
            shipped: 0,
            delivered: 0,
            cancelled: 0,
            shippingToConfirm: 0,
            paymentPending: 1,
          },
          governorates: ["Bizerte"],
        }),
      getById: () => Promise.resolve(order),
      updateStatus: () => Promise.resolve(order),
      updatePaymentStatus: (input: unknown) => {
        received = input;
        return Promise.resolve({
          ...order,
          paymentStatus: "collected" as const,
        });
      },
      updateShipping: () => Promise.resolve(order),
      addNote: () => Promise.resolve(order),
      cancelOrder: () => Promise.resolve(order),
    } as unknown as PostgresAdminOrderRepository;
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier,
      adminAccessRepository: accessRepository,
      auditRepository,
      adminOrderRepository,
    });
    authorize("aal2", ["admin.session_read", "orders.read", "orders.ship"]);

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/orders/${order.id}/payment`,
      headers: { authorization: "Bearer valid-token" },
      payload: { paymentStatus: "collected" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ paymentStatus: "collected" });
    expect(received).toMatchObject({
      orderId: order.id,
      paymentStatus: "collected",
      actorUserId: userId,
    });
  });

  it("persists a private Admin note through the API", async () => {
    const order = orderFixture();
    let received: unknown;
    const adminOrderRepository = {
      list: () =>
        Promise.resolve({
          items: [order],
          total: 1,
          page: 1,
          pageSize: 20,
          pageCount: 1,
          counters: {
            total: 1,
            pendingConfirmation: 0,
            confirmed: 1,
            preparing: 0,
            shipped: 0,
            delivered: 0,
            cancelled: 0,
            shippingToConfirm: 0,
            paymentPending: 1,
          },
          governorates: ["Bizerte"],
        }),
      getById: () => Promise.resolve(order),
      updateStatus: () => Promise.resolve(order),
      updatePaymentStatus: () => Promise.resolve(order),
      updateShipping: () => Promise.resolve(order),
      addNote: (input: unknown) => {
        received = input;
        return Promise.resolve({
          ...order,
          notes: [
            {
              id: "55555555-5555-4555-8555-555555555555",
              at: new Date(0).toISOString(),
              author: "HBS HOME Admin",
              userId,
              body: "Client rappelé",
            },
          ],
        });
      },
      cancelOrder: () => Promise.resolve(order),
    } as unknown as PostgresAdminOrderRepository;
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier,
      adminAccessRepository: accessRepository,
      auditRepository,
      adminOrderRepository,
    });
    authorize("aal2", ["admin.session_read", "orders.read", "orders.confirm"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/admin/orders/${order.id}/notes`,
      headers: { authorization: "Bearer valid-token" },
      payload: { text: "Client rappelé" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      notes: [{ body: "Client rappelé" }],
    });
    expect(received).toMatchObject({
      orderId: order.id,
      actorUserId: userId,
      text: "Client rappelé",
    });
  });

  it("uses the cancellation permission and forwards stock restoration", async () => {
    const order = orderFixture();
    let received: unknown;
    const adminOrderRepository = {
      list: () =>
        Promise.resolve({
          items: [order],
          total: 1,
          page: 1,
          pageSize: 20,
          pageCount: 1,
          counters: {
            total: 1,
            pendingConfirmation: 0,
            confirmed: 1,
            preparing: 0,
            shipped: 0,
            delivered: 0,
            cancelled: 0,
            shippingToConfirm: 0,
            paymentPending: 1,
          },
          governorates: ["Bizerte"],
        }),
      getById: () => Promise.resolve(order),
      updateStatus: () => Promise.resolve(order),
      updatePaymentStatus: () => Promise.resolve(order),
      updateShipping: () => Promise.resolve(order),
      addNote: () => Promise.resolve(order),
      cancelOrder: (input: unknown) => {
        received = input;
        return Promise.resolve({ ...order, status: "cancelled" as const });
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
    });
    authorize("aal2", ["admin.session_read", "orders.read", "orders.cancel"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/admin/orders/${order.id}/cancel`,
      headers: { authorization: "Bearer valid-token" },
      payload: { reason: "Client indisponible", restoreStock: true },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "cancelled" });
    expect(received).toMatchObject({
      orderId: order.id,
      actorUserId: userId,
      restoreStock: true,
      refundPayment: false,
    });
  });

  it("protects and forwards contact and address updates with their scoped permissions", async () => {
    const order = orderFixture();
    const received: unknown[] = [];
    const adminOrderRepository = {
      list: () =>
        Promise.resolve({
          items: [order],
          total: 1,
          page: 1,
          pageSize: 20,
          pageCount: 1,
          counters: {
            total: 1,
            pendingConfirmation: 0,
            confirmed: 1,
            preparing: 0,
            shipped: 0,
            delivered: 0,
            cancelled: 0,
            shippingToConfirm: 0,
            paymentPending: 1,
          },
          governorates: ["Bizerte"],
        }),
      getById: () => Promise.resolve(order),
      updateStatus: () => Promise.resolve(order),
      updatePaymentStatus: () => Promise.resolve(order),
      updateShipping: () => Promise.resolve(order),
      updateContact: (input: unknown) => {
        received.push(input);
        return Promise.resolve(order);
      },
      updateAddress: (input: unknown) => {
        received.push(input);
        return Promise.resolve(order);
      },
      addNote: () => Promise.resolve(order),
      cancelOrder: () => Promise.resolve(order),
      returnOrder: () => Promise.resolve(order),
    } as unknown as PostgresAdminOrderRepository;
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier,
      adminAccessRepository: accessRepository,
      auditRepository,
      adminOrderRepository,
    });

    authorize("aal2", [
      "admin.session_read",
      "orders.read",
      "customers.write",
      "orders.confirm",
    ]);
    const contact = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/orders/${order.id}/contact`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        customerName: "Client Test",
        customerPhone: "+21620123456",
        customerEmail: "client@example.com",
      },
    });
    const address = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/orders/${order.id}/address`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        governorate: "Bizerte",
        city: "Bizerte",
        addressLine: "2 rue de test",
      },
    });

    expect(contact.statusCode).toBe(200);
    expect(address.statusCode).toBe(200);
    expect(received).toEqual([
      expect.objectContaining({
        orderId: order.id,
        actorUserId: userId,
        customerName: "Client Test",
      }),
      expect.objectContaining({
        orderId: order.id,
        actorUserId: userId,
        addressLine: "2 rue de test",
      }),
    ]);
  });

  it("requires refund permission and forwards the return workflow", async () => {
    const order = orderFixture("delivered");
    let received: unknown;
    const adminOrderRepository = {
      list: () =>
        Promise.resolve({
          items: [order],
          total: 1,
          page: 1,
          pageSize: 20,
          pageCount: 1,
          counters: {
            total: 1,
            pendingConfirmation: 0,
            confirmed: 0,
            preparing: 0,
            shipped: 0,
            delivered: 1,
            cancelled: 0,
            shippingToConfirm: 0,
            paymentPending: 1,
          },
          governorates: ["Bizerte"],
        }),
      getById: () => Promise.resolve(order),
      updateStatus: () => Promise.resolve(order),
      updatePaymentStatus: () => Promise.resolve(order),
      updateShipping: () => Promise.resolve(order),
      updateContact: () => Promise.resolve(order),
      updateAddress: () => Promise.resolve(order),
      addNote: () => Promise.resolve(order),
      cancelOrder: () => Promise.resolve(order),
      returnOrder: (input: unknown) => {
        received = input;
        return Promise.resolve({ ...order, returnInfo: null });
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
    });

    authorize("aal2", ["admin.session_read", "orders.read", "orders.cancel"]);
    const denied = await app.inject({
      method: "POST",
      url: `/api/v1/admin/orders/${order.id}/return`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        action: "accept",
        reason: "Remboursement demandé",
        refundPayment: true,
      },
    });
    expect(denied.statusCode).toBe(403);
    expect(received).toBeUndefined();

    authorize("aal2", [
      "admin.session_read",
      "orders.read",
      "orders.cancel",
      "orders.refund",
    ]);
    const accepted = await app.inject({
      method: "POST",
      url: `/api/v1/admin/orders/${order.id}/return`,
      headers: { authorization: "Bearer valid-token" },
      payload: { action: "request", reason: "Produit endommagé" },
    });
    expect(accepted.statusCode).toBe(200);
    expect(received).toMatchObject({
      orderId: order.id,
      actorUserId: userId,
      action: "request",
      refundPayment: false,
    });
  });

  it("rejects an invalid bearer token without leaking verification details", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/session",
      headers: { authorization: "Bearer invalid-token" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "INVALID_ACCESS_TOKEN" });
  });

  it("rejects an authenticated user without an active Admin profile", async () => {
    jwtVerifier.add("valid-token", {
      userId,
      email: "visitor@example.com",
      assuranceLevel: "aal2",
      sessionId: null,
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/session",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "ADMIN_ACCESS_DENIED" });
  });

  it("returns the Admin session at aal1 and requires MFA", async () => {
    authorize("aal1");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/session",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: { id: userId, email: "hhometn@gmail.com" },
      assuranceLevel: "aal1",
      mfaRequired: true,
      roles: ["super_admin"],
    });
    expect(accessRepository.lastSeen.has(userId)).toBe(true);
    expect(auditRepository.events).toContainEqual(
      expect.objectContaining({ action: "auth.admin_session_checked" }),
    );
  });

  it("blocks sensitive resources until a TOTP challenge reaches aal2", async () => {
    authorize("aal1");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/audit-events",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "MFA_REQUIRED" });
    const denial = auditRepository.events.find(
      (event) => event.action === "auth.admin_access_denied",
    );
    expect(denial?.metadata).toMatchObject({ reason: "mfa_required" });
  });

  it("enforces granular permissions even at aal2", async () => {
    authorize("aal2", ["admin.session_read"]);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/audit-events",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("allows an aal2 Admin with audit.read", async () => {
    authorize("aal2");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/audit-events?limit=10",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
    });
  });
});
