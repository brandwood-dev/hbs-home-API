import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createAdminGuard,
  type AdminPrincipal,
  type AdminGuardDependencies,
} from "../auth/admin-guard.js";
import type {
  AdminOrderListParams,
  AdminOrderCancellationInput,
  AdminOrderNoteInput,
  AdminOrderAddressInput,
  AdminOrderContactInput,
  AdminOrderPaymentUpdateInput,
  AdminOrderReturnInput,
  AdminOrderShippingUpdateInput,
  AdminOrderStatusUpdateInput,
  PostgresAdminOrderRepository,
} from "../orders/admin-order-repository.js";
import { AppError, ProblemDetailSchema } from "../http/problem.js";

const OrderStatus = Type.Union([
  Type.Literal("pending_confirmation"),
  Type.Literal("confirmed"),
  Type.Literal("preparing"),
  Type.Literal("shipped"),
  Type.Literal("delivered"),
  Type.Literal("cancelled"),
]);
const OrderSort = Type.Union([
  Type.Literal("newest"),
  Type.Literal("oldest"),
  Type.Literal("total_desc"),
  Type.Literal("total_asc"),
  Type.Literal("status"),
]);
const OrderListQuery = Type.Object(
  {
    page: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_000 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    status: Type.Optional(Type.String({ maxLength: 200 })),
    governorate: Type.Optional(Type.String({ maxLength: 120 })),
    q: Type.Optional(Type.String({ maxLength: 160 })),
    sort: Type.Optional(OrderSort),
  },
  { additionalProperties: false },
);
type OrderListQueryType = Static<typeof OrderListQuery>;

const OrderIdParams = Type.Object(
  { id: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);
const OrderStatusUpdateBody = Type.Object(
  {
    status: OrderStatus,
    reason: Type.Optional(Type.String({ maxLength: 500 })),
    note: Type.Optional(Type.String({ maxLength: 1_000 })),
    carrierName: Type.Optional(Type.String({ maxLength: 160 })),
    trackingNumber: Type.Optional(Type.String({ maxLength: 160 })),
    shippedAt: Type.Optional(Type.String({ format: "date-time" })),
    deliveredAt: Type.Optional(Type.String({ format: "date-time" })),
  },
  { additionalProperties: false },
);
type OrderStatusUpdateBodyType = Static<typeof OrderStatusUpdateBody>;

const PaymentStatus = Type.Union([
  Type.Literal("pending"),
  Type.Literal("collected"),
  Type.Literal("refunded"),
]);
const PaymentUpdateBody = Type.Object(
  {
    paymentStatus: PaymentStatus,
    reason: Type.Optional(Type.String({ maxLength: 500 })),
    note: Type.Optional(Type.String({ maxLength: 1_000 })),
  },
  { additionalProperties: false },
);
type PaymentUpdateBodyType = Static<typeof PaymentUpdateBody>;
const ShippingUpdateBody = Type.Object(
  {
    shippingFeeMinor: Type.Integer({ minimum: 0, maximum: 2_000_000_000 }),
    carrierName: Type.Optional(Type.String({ maxLength: 160 })),
    note: Type.Optional(Type.String({ maxLength: 1_000 })),
  },
  { additionalProperties: false },
);
type ShippingUpdateBodyType = Static<typeof ShippingUpdateBody>;
const OrderNoteBody = Type.Object(
  { text: Type.String({ minLength: 1, maxLength: 2_000 }) },
  { additionalProperties: false },
);
type OrderNoteBodyType = Static<typeof OrderNoteBody>;
const OrderCancellationBody = Type.Object(
  {
    reason: Type.String({ minLength: 1, maxLength: 500 }),
    note: Type.Optional(Type.String({ maxLength: 1_000 })),
    restoreStock: Type.Boolean(),
    refundPayment: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
type OrderCancellationBodyType = Static<typeof OrderCancellationBody>;

const OrderContactBody = Type.Object(
  {
    customerName: Type.String({ minLength: 1, maxLength: 121 }),
    customerPhone: Type.String({ minLength: 8, maxLength: 20 }),
    customerEmail: Type.Optional(
      Type.Union([Type.String({ maxLength: 255 }), Type.Null()]),
    ),
  },
  { additionalProperties: false },
);
type OrderContactBodyType = Static<typeof OrderContactBody>;
const OrderAddressBody = Type.Object(
  {
    governorate: Type.String({ minLength: 1, maxLength: 120 }),
    city: Type.String({ minLength: 1, maxLength: 120 }),
    postalCode: Type.Optional(
      Type.Union([Type.String({ maxLength: 20 }), Type.Null()]),
    ),
    addressLine: Type.String({ minLength: 1, maxLength: 240 }),
    landmark: Type.Optional(
      Type.Union([Type.String({ maxLength: 160 }), Type.Null()]),
    ),
    deliveryNote: Type.Optional(
      Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    ),
  },
  { additionalProperties: false },
);
type OrderAddressBodyType = Static<typeof OrderAddressBody>;
const OrderReturnBody = Type.Object(
  {
    action: Type.Union([
      Type.Literal("request"),
      Type.Literal("accept"),
      Type.Literal("refuse"),
    ]),
    reason: Type.String({ minLength: 1, maxLength: 500 }),
    note: Type.Optional(Type.String({ maxLength: 1_000 })),
    restock: Type.Optional(Type.Boolean()),
    conditionReason: Type.Optional(Type.String({ maxLength: 500 })),
    refundPayment: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
type OrderReturnBodyType = Static<typeof OrderReturnBody>;

const OrderItemOption = Type.Object(
  { label: Type.String(), value: Type.String() },
  { additionalProperties: false },
);
const OrderItem = Type.Object(
  {
    productId: Type.String(),
    variantId: Type.String(),
    productName: Type.String(),
    variantLabel: Type.String(),
    sku: Type.String(),
    quantity: Type.Integer({ minimum: 1 }),
    unitPriceMinor: Type.Integer({ minimum: 0 }),
    lineTotalMinor: Type.Integer({ minimum: 0 }),
    productReference: Type.String(),
    productSlug: Type.String(),
    imageUrl: Type.String(),
    imageAlt: Type.String(),
    selectedOptions: Type.Array(OrderItemOption),
    sellingUnitLabel: Type.String(),
    shippingProfile: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);
const OrderEvent = Type.Object(
  {
    id: Type.String(),
    at: Type.String({ format: "date-time" }),
    status: OrderStatus,
    label: Type.String(),
    kind: Type.Union([Type.Literal("created"), Type.Literal("status")]),
    reason: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);
const OrderNote = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    at: Type.String({ format: "date-time" }),
    author: Type.String(),
    userId: Type.String({ format: "uuid" }),
    body: Type.String(),
  },
  { additionalProperties: false },
);
const OrderShipment = Type.Object(
  {
    shippingStatus: Type.Union([
      Type.Literal("calculated"),
      Type.Literal("to_confirm"),
    ]),
    shippingFeeMinor: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
const OrderReturnInfo = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    status: Type.Union([
      Type.Literal("requested"),
      Type.Literal("accepted"),
      Type.Literal("refused"),
    ]),
    requestedAt: Type.String({ format: "date-time" }),
    reason: Type.String(),
    note: Type.Union([Type.String(), Type.Null()]),
    resolvedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    resolution: Type.Union([
      Type.Literal("accepted"),
      Type.Literal("refused"),
      Type.Null(),
    ]),
    restocked: Type.Boolean(),
    refundPayment: Type.Boolean(),
    conditionReason: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);
export const AdminOrder = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    orderNumber: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
    status: OrderStatus,
    paymentStatus: Type.Union([
      Type.Literal("pending"),
      Type.Literal("collected"),
      Type.Literal("refunded"),
    ]),
    paymentMethod: Type.Literal("cash_on_delivery"),
    customerId: Type.String({ format: "uuid" }),
    customerName: Type.String(),
    customerPhone: Type.String(),
    customerEmail: Type.Union([Type.String(), Type.Null()]),
    deliveryMethod: Type.Union([
      Type.Literal("home_delivery"),
      Type.Literal("store_pickup"),
    ]),
    governorate: Type.String(),
    city: Type.String(),
    postalCode: Type.Union([Type.String(), Type.Null()]),
    addressLine: Type.String(),
    landmark: Type.Union([Type.String(), Type.Null()]),
    deliveryNote: Type.Union([Type.String(), Type.Null()]),
    items: Type.Array(OrderItem),
    subtotalMinor: Type.Integer({ minimum: 0 }),
    shippingMinor: Type.Integer({ minimum: 0 }),
    discountMinor: Type.Integer({ minimum: 0 }),
    totalMinor: Type.Integer({ minimum: 0 }),
    timeline: Type.Array(OrderEvent),
    notes: Type.Array(OrderNote),
    returnInfo: Type.Optional(Type.Union([OrderReturnInfo, Type.Null()])),
    shipment: OrderShipment,
  },
  { $id: "AdminOrder", additionalProperties: false },
);
const Counters = Type.Object(
  {
    total: Type.Integer({ minimum: 0 }),
    pendingConfirmation: Type.Integer({ minimum: 0 }),
    confirmed: Type.Integer({ minimum: 0 }),
    preparing: Type.Integer({ minimum: 0 }),
    shipped: Type.Integer({ minimum: 0 }),
    delivered: Type.Integer({ minimum: 0 }),
    cancelled: Type.Integer({ minimum: 0 }),
    shippingToConfirm: Type.Integer({ minimum: 0 }),
    paymentPending: Type.Integer({ minimum: 0 }),
  },
  { $id: "AdminOrderCounters", additionalProperties: false },
);
const OrderListResponse = Type.Object(
  {
    items: Type.Array(AdminOrder),
    total: Type.Integer({ minimum: 0 }),
    page: Type.Integer({ minimum: 1 }),
    pageSize: Type.Integer({ minimum: 1 }),
    pageCount: Type.Integer({ minimum: 1 }),
    counters: Counters,
    governorates: Type.Array(Type.String()),
  },
  { $id: "AdminOrderListResponse", additionalProperties: false },
);

export interface AdminOrderRouteDependencies extends AdminGuardDependencies {
  adminOrderRepository: Pick<
    PostgresAdminOrderRepository,
    | "list"
    | "getById"
    | "updateStatus"
    | "updatePaymentStatus"
    | "updateShipping"
    | "updateContact"
    | "updateAddress"
    | "addNote"
    | "cancelOrder"
    | "returnOrder"
  >;
}

function principal(request: {
  adminPrincipal: AdminPrincipal | null;
}): AdminPrincipal {
  if (!request.adminPrincipal)
    throw new Error("Admin guard did not set a principal.");
  return request.adminPrincipal;
}

function requiredStatusPermission(status: Static<typeof OrderStatus>): string {
  if (status === "cancelled") return "orders.cancel";
  if (status === "shipped" || status === "delivered") return "orders.ship";
  return "orders.confirm";
}

async function requireStatusPermission(
  dependencies: AdminOrderRouteDependencies,
  request: Pick<FastifyRequest, "id" | "ip" | "method" | "url" | "headers">,
  actor: AdminPrincipal,
  permission: string,
  orderId: string,
  action = "order.status_update_denied",
): Promise<void> {
  if (actor.permissions.includes(permission)) return;
  try {
    await dependencies.auditRepository.append({
      requestId: request.id,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action,
      resourceType: "order",
      resourceId: orderId,
      outcome: "denied",
      sourceIp: request.ip,
      userAgent: request.headers["user-agent"]?.toString() ?? null,
      metadata: { permission, method: request.method, path: request.url },
    });
  } catch {
    // A missing permission must never be turned into a server error by audit.
  }
  throw new AppError({
    statusCode: 403,
    code: "PERMISSION_DENIED",
    title: "Permission denied",
    detail: "The current Admin role cannot change this order status.",
  });
}

function paymentPermission(status: Static<typeof PaymentStatus>): string {
  return status === "refunded" ? "orders.refund" : "orders.ship";
}

function parseStatuses(
  value: string | undefined,
): AdminOrderListParams["status"] {
  if (!value?.trim()) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(
      (item): item is NonNullable<AdminOrderListParams["status"]>[number] =>
        [
          "pending_confirmation",
          "confirmed",
          "preparing",
          "shipped",
          "delivered",
          "cancelled",
        ].includes(item),
    );
}

export function registerAdminOrderRoutes(
  app: FastifyInstance,
  dependencies: AdminOrderRouteDependencies,
): void {
  app.addSchema(AdminOrder);
  app.addSchema(OrderListResponse);

  app.get<{ Querystring: OrderListQueryType }>(
    "/api/v1/admin/orders",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["orders.read"],
      }),
      schema: {
        operationId: "listAdminOrders",
        summary: "List persisted customer orders for the Admin back-office",
        tags: ["admin-orders"],
        security: [{ bearerAuth: [] }],
        querystring: OrderListQuery,
        response: {
          200: OrderListResponse,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const status = parseStatuses(request.query.status);
      const params: AdminOrderListParams = {
        page: request.query.page ?? 1,
        pageSize: request.query.pageSize ?? 20,
        sort: request.query.sort ?? "newest",
        ...(request.query.governorate
          ? { governorate: request.query.governorate }
          : {}),
        ...(request.query.q ? { search: request.query.q } : {}),
      };
      if (status) params.status = status;
      return dependencies.adminOrderRepository.list(params);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/v1/admin/orders/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["orders.read"],
      }),
      schema: {
        operationId: "getAdminOrder",
        summary: "Read one persisted customer order for the Admin back-office",
        tags: ["admin-orders"],
        security: [{ bearerAuth: [] }],
        params: OrderIdParams,
        response: {
          200: AdminOrder,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const order = await dependencies.adminOrderRepository.getById(
        request.params.id,
      );
      if (!order) {
        return reply.status(404).send({
          type: "https://api.hbs-home.com/problems/order-not-found",
          title: "Order not found",
          status: 404,
          detail: "The requested order does not exist.",
          instance: request.url,
          code: "ORDER_NOT_FOUND",
          requestId: request.id,
        });
      }
      return order;
    },
  );

  app.patch<{
    Params: Static<typeof OrderIdParams>;
    Body: OrderStatusUpdateBodyType;
  }>(
    "/api/v1/admin/orders/:id/status",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["orders.read"],
      }),
      schema: {
        operationId: "updateAdminOrderStatus",
        summary: "Change the status of a persisted customer order",
        tags: ["admin-orders"],
        security: [{ bearerAuth: [] }],
        params: OrderIdParams,
        body: OrderStatusUpdateBody,
        response: {
          200: AdminOrder,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const permission = requiredStatusPermission(request.body.status);
      await requireStatusPermission(
        dependencies,
        request,
        actor,
        permission,
        request.params.id,
      );
      const input: AdminOrderStatusUpdateInput = {
        orderId: request.params.id,
        status: request.body.status,
        actorUserId: actor.userId,
        ...(request.body.reason ? { reason: request.body.reason } : {}),
        ...(request.body.note ? { note: request.body.note } : {}),
        ...(request.body.carrierName
          ? { carrierName: request.body.carrierName }
          : {}),
        ...(request.body.trackingNumber
          ? { trackingNumber: request.body.trackingNumber }
          : {}),
        ...(request.body.shippedAt
          ? { shippedAt: request.body.shippedAt }
          : {}),
        ...(request.body.deliveredAt
          ? { deliveredAt: request.body.deliveredAt }
          : {}),
      };
      const order = await dependencies.adminOrderRepository.updateStatus(input);
      await dependencies.auditRepository.append({
        requestId: request.id,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: "order.status_updated",
        resourceType: "order",
        resourceId: order.id,
        outcome: "success",
        sourceIp: request.ip,
        userAgent: request.headers["user-agent"]?.toString() ?? null,
        metadata: {
          orderNumber: order.orderNumber,
          status: order.status,
          permission,
        },
      });
      return order;
    },
  );

  app.patch<{
    Params: Static<typeof OrderIdParams>;
    Body: PaymentUpdateBodyType;
  }>(
    "/api/v1/admin/orders/:id/payment",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["orders.read"],
      }),
      schema: {
        operationId: "updateAdminOrderPayment",
        summary: "Update the persisted payment state of an Admin order",
        tags: ["admin-orders"],
        security: [{ bearerAuth: [] }],
        params: OrderIdParams,
        body: PaymentUpdateBody,
        response: {
          200: AdminOrder,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const permission = paymentPermission(request.body.paymentStatus);
      await requireStatusPermission(
        dependencies,
        request,
        actor,
        permission,
        request.params.id,
        "order.payment_update_denied",
      );
      const input: AdminOrderPaymentUpdateInput = {
        orderId: request.params.id,
        paymentStatus: request.body.paymentStatus,
        actorUserId: actor.userId,
        ...(request.body.reason ? { reason: request.body.reason } : {}),
        ...(request.body.note ? { note: request.body.note } : {}),
      };
      const order =
        await dependencies.adminOrderRepository.updatePaymentStatus(input);
      await dependencies.auditRepository.append({
        requestId: request.id,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: "order.payment_updated",
        resourceType: "order",
        resourceId: order.id,
        outcome: "success",
        sourceIp: request.ip,
        userAgent: request.headers["user-agent"]?.toString() ?? null,
        metadata: {
          orderNumber: order.orderNumber,
          paymentStatus: order.paymentStatus,
          permission,
        },
      });
      return order;
    },
  );

  app.patch<{
    Params: Static<typeof OrderIdParams>;
    Body: ShippingUpdateBodyType;
  }>(
    "/api/v1/admin/orders/:id/shipping",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["orders.read"],
      }),
      schema: {
        operationId: "updateAdminOrderShipping",
        summary: "Update the persisted delivery fee of an Admin order",
        tags: ["admin-orders"],
        security: [{ bearerAuth: [] }],
        params: OrderIdParams,
        body: ShippingUpdateBody,
        response: {
          200: AdminOrder,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      await requireStatusPermission(
        dependencies,
        request,
        actor,
        "orders.confirm",
        request.params.id,
        "order.shipping_update_denied",
      );
      const input: AdminOrderShippingUpdateInput = {
        orderId: request.params.id,
        shippingFeeMinor: request.body.shippingFeeMinor,
        actorUserId: actor.userId,
        ...(request.body.carrierName
          ? { carrierName: request.body.carrierName }
          : {}),
        ...(request.body.note ? { note: request.body.note } : {}),
      };
      const order =
        await dependencies.adminOrderRepository.updateShipping(input);
      await dependencies.auditRepository.append({
        requestId: request.id,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: "order.shipping_updated",
        resourceType: "order",
        resourceId: order.id,
        outcome: "success",
        sourceIp: request.ip,
        userAgent: request.headers["user-agent"]?.toString() ?? null,
        metadata: {
          orderNumber: order.orderNumber,
          shippingFeeMinor: order.shipment.shippingFeeMinor,
        },
      });
      return order;
    },
  );

  app.post<{
    Params: Static<typeof OrderIdParams>;
    Body: OrderNoteBodyType;
  }>(
    "/api/v1/admin/orders/:id/notes",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["orders.read"],
      }),
      schema: {
        operationId: "addAdminOrderNote",
        summary: "Append a private note to an Admin order",
        tags: ["admin-orders"],
        security: [{ bearerAuth: [] }],
        params: OrderIdParams,
        body: OrderNoteBody,
        response: {
          200: AdminOrder,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      await requireStatusPermission(
        dependencies,
        request,
        actor,
        "orders.confirm",
        request.params.id,
        "order.note_add_denied",
      );
      const input: AdminOrderNoteInput = {
        orderId: request.params.id,
        actorUserId: actor.userId,
        actorName: actor.displayName?.trim() ?? actor.email,
        text: request.body.text,
      };
      const order = await dependencies.adminOrderRepository.addNote(input);
      await dependencies.auditRepository.append({
        requestId: request.id,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: "order.note_added",
        resourceType: "order",
        resourceId: order.id,
        outcome: "success",
        sourceIp: request.ip,
        userAgent: request.headers["user-agent"]?.toString() ?? null,
        metadata: { orderNumber: order.orderNumber },
      });
      return order;
    },
  );

  app.patch<{
    Params: Static<typeof OrderIdParams>;
    Body: OrderContactBodyType;
  }>(
    "/api/v1/admin/orders/:id/contact",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["orders.read"],
      }),
      schema: {
        operationId: "updateAdminOrderContact",
        summary: "Update customer contact details before shipment",
        tags: ["admin-orders"],
        security: [{ bearerAuth: [] }],
        params: OrderIdParams,
        body: OrderContactBody,
        response: {
          200: AdminOrder,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      await requireStatusPermission(
        dependencies,
        request,
        actor,
        "customers.write",
        request.params.id,
        "order.contact_update_denied",
      );
      const input: AdminOrderContactInput = {
        orderId: request.params.id,
        actorUserId: actor.userId,
        customerName: request.body.customerName,
        customerPhone: request.body.customerPhone,
        ...(request.body.customerEmail !== undefined
          ? { customerEmail: request.body.customerEmail }
          : {}),
      };
      const order =
        await dependencies.adminOrderRepository.updateContact(input);
      await dependencies.auditRepository.append({
        requestId: request.id,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: "order.contact_updated",
        resourceType: "order",
        resourceId: order.id,
        outcome: "success",
        sourceIp: request.ip,
        userAgent: request.headers["user-agent"]?.toString() ?? null,
        metadata: { orderNumber: order.orderNumber },
      });
      return order;
    },
  );

  app.patch<{
    Params: Static<typeof OrderIdParams>;
    Body: OrderAddressBodyType;
  }>(
    "/api/v1/admin/orders/:id/address",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["orders.read"],
      }),
      schema: {
        operationId: "updateAdminOrderAddress",
        summary: "Update the delivery address before shipment",
        tags: ["admin-orders"],
        security: [{ bearerAuth: [] }],
        params: OrderIdParams,
        body: OrderAddressBody,
        response: {
          200: AdminOrder,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      await requireStatusPermission(
        dependencies,
        request,
        actor,
        "orders.confirm",
        request.params.id,
        "order.address_update_denied",
      );
      const input: AdminOrderAddressInput = {
        orderId: request.params.id,
        actorUserId: actor.userId,
        governorate: request.body.governorate,
        city: request.body.city,
        addressLine: request.body.addressLine,
        ...(request.body.postalCode !== undefined
          ? { postalCode: request.body.postalCode }
          : {}),
        ...(request.body.landmark !== undefined
          ? { landmark: request.body.landmark }
          : {}),
        ...(request.body.deliveryNote !== undefined
          ? { deliveryNote: request.body.deliveryNote }
          : {}),
      };
      const order =
        await dependencies.adminOrderRepository.updateAddress(input);
      await dependencies.auditRepository.append({
        requestId: request.id,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: "order.address_updated",
        resourceType: "order",
        resourceId: order.id,
        outcome: "success",
        sourceIp: request.ip,
        userAgent: request.headers["user-agent"]?.toString() ?? null,
        metadata: { orderNumber: order.orderNumber },
      });
      return order;
    },
  );

  app.post<{
    Params: Static<typeof OrderIdParams>;
    Body: OrderReturnBodyType;
  }>(
    "/api/v1/admin/orders/:id/return",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["orders.read"],
      }),
      schema: {
        operationId: "returnAdminOrder",
        summary: "Request or resolve a customer return",
        tags: ["admin-orders"],
        security: [{ bearerAuth: [] }],
        params: OrderIdParams,
        body: OrderReturnBody,
        response: {
          200: AdminOrder,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      await requireStatusPermission(
        dependencies,
        request,
        actor,
        "orders.cancel",
        request.params.id,
        "order.return_update_denied",
      );
      if (request.body.refundPayment) {
        await requireStatusPermission(
          dependencies,
          request,
          actor,
          "orders.refund",
          request.params.id,
          "order.return_refund_denied",
        );
      }
      const input: AdminOrderReturnInput = {
        orderId: request.params.id,
        actorUserId: actor.userId,
        action: request.body.action,
        reason: request.body.reason,
        restock: request.body.restock ?? false,
        refundPayment: request.body.refundPayment ?? false,
        ...(request.body.note ? { note: request.body.note } : {}),
        ...(request.body.conditionReason
          ? { conditionReason: request.body.conditionReason }
          : {}),
      };
      const order = await dependencies.adminOrderRepository.returnOrder(input);
      await dependencies.auditRepository.append({
        requestId: request.id,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: `order.return_${request.body.action}`,
        resourceType: "order",
        resourceId: order.id,
        outcome: "success",
        sourceIp: request.ip,
        userAgent: request.headers["user-agent"]?.toString() ?? null,
        metadata: {
          orderNumber: order.orderNumber,
          action: request.body.action,
          restock: input.restock,
          refundPayment: input.refundPayment,
        },
      });
      return order;
    },
  );

  app.post<{
    Params: Static<typeof OrderIdParams>;
    Body: OrderCancellationBodyType;
  }>(
    "/api/v1/admin/orders/:id/cancel",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["orders.read"],
      }),
      schema: {
        operationId: "cancelAdminOrder",
        summary: "Cancel a persisted Admin order and optionally restore stock",
        tags: ["admin-orders"],
        security: [{ bearerAuth: [] }],
        params: OrderIdParams,
        body: OrderCancellationBody,
        response: {
          200: AdminOrder,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      await requireStatusPermission(
        dependencies,
        request,
        actor,
        "orders.cancel",
        request.params.id,
        "order.cancel_denied",
      );
      const input: AdminOrderCancellationInput = {
        orderId: request.params.id,
        actorUserId: actor.userId,
        reason: request.body.reason,
        restoreStock: request.body.restoreStock,
        refundPayment: request.body.refundPayment ?? false,
        ...(request.body.note ? { note: request.body.note } : {}),
      };
      const order = await dependencies.adminOrderRepository.cancelOrder(input);
      await dependencies.auditRepository.append({
        requestId: request.id,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: "order.cancelled",
        resourceType: "order",
        resourceId: order.id,
        outcome: "success",
        sourceIp: request.ip,
        userAgent: request.headers["user-agent"]?.toString() ?? null,
        metadata: {
          orderNumber: order.orderNumber,
          restoreStock: input.restoreStock,
          refundPayment: input.refundPayment,
        },
      });
      return order;
    },
  );
}
