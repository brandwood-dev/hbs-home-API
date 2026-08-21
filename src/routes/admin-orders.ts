import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createAdminGuard,
  type AdminPrincipal,
  type AdminGuardDependencies,
} from "../auth/admin-guard.js";
import type {
  AdminOrderListParams,
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
const AdminOrder = Type.Object(
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
    notes: Type.Array(Type.Unknown()),
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
    "list" | "getById" | "updateStatus"
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
): Promise<void> {
  if (actor.permissions.includes(permission)) return;
  try {
    await dependencies.auditRepository.append({
      requestId: request.id,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: "order.status_update_denied",
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
}
