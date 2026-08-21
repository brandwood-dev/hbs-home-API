import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, ProblemDetailSchema } from "../http/problem.js";
import { cookieToken } from "./cart.js";
import type {
  OrderRepository,
  PublicOrder,
  PublicOrderTracking,
} from "../orders/order-repository.js";

const OrderStatusSchema = Type.Union([
  Type.Literal("pending_confirmation"),
  Type.Literal("confirmed"),
  Type.Literal("preparing"),
  Type.Literal("shipped"),
  Type.Literal("delivered"),
  Type.Literal("cancelled"),
]);

const OrderItemSchema = Type.Object(
  {
    productId: Type.String(),
    variantId: Type.String(),
    productSlug: Type.String(),
    productName: Type.String(),
    productReference: Type.String(),
    sku: Type.String(),
    imageUrl: Type.String(),
    imageAlt: Type.String(),
    category: Type.String(),
    colorLabel: Type.Optional(Type.String()),
    widthCm: Type.Optional(Type.Integer({ minimum: 0 })),
    heightCm: Type.Optional(Type.Integer({ minimum: 0 })),
    curtainHeaderLabel: Type.Optional(Type.String()),
    eyeletColorLabel: Type.Optional(Type.String()),
    liningLabel: Type.Optional(Type.String()),
    selectedOptions: Type.Array(
      Type.Object({ label: Type.String(), value: Type.String() }),
    ),
    sellingUnitLabel: Type.String(),
    shippingProfile: Type.Optional(Type.String()),
    quantity: Type.Integer({ minimum: 1, maximum: 99 }),
    unitPriceMinor: Type.Integer({ minimum: 0 }),
    lineTotalMinor: Type.Integer({ minimum: 0 }),
  },
  { $id: "OrderItemSnapshot", additionalProperties: false },
);

const AddressSchema = Type.Object(
  {
    governorate: Type.String(),
    city: Type.String(),
    postalCode: Type.Optional(Type.String()),
    addressLine: Type.String(),
    landmark: Type.Optional(Type.String()),
    deliveryNote: Type.Optional(Type.String()),
  },
  { $id: "OrderAddress", additionalProperties: false },
);

const CustomerSchema = Type.Object(
  {
    firstName: Type.String(),
    lastName: Type.String(),
    phone: Type.String(),
    email: Type.Optional(Type.String()),
  },
  { $id: "OrderCustomer", additionalProperties: false },
);

const TotalsSchema = Type.Object(
  {
    subtotalMinor: Type.Integer({ minimum: 0 }),
    discountMinor: Type.Integer({ minimum: 0 }),
    shippingMinor: Type.Integer({ minimum: 0 }),
    totalMinor: Type.Integer({ minimum: 0 }),
  },
  { $id: "OrderTotals", additionalProperties: false },
);

const OrderSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    orderNumber: Type.String(),
    status: OrderStatusSchema,
    customer: CustomerSchema,
    deliveryMethod: Type.Union([
      Type.Literal("home_delivery"),
      Type.Literal("store_pickup"),
    ]),
    shippingAddress: Type.Optional(AddressSchema),
    paymentMethod: Type.Literal("cash_on_delivery"),
    items: Type.Array(OrderItemSchema),
    totals: TotalsSchema,
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
    idempotencyKey: Type.String(),
    isDemo: Type.Literal(false),
  },
  { $id: "Order", additionalProperties: false },
);

const OrderItemInputSchema = Type.Object(
  {
    productId: Type.String({ minLength: 1, maxLength: 160 }),
    variantId: Type.String({ minLength: 1, maxLength: 160 }),
    quantity: Type.Integer({ minimum: 1, maximum: 99 }),
    expectedUnitPriceMinor: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

const CreateOrderBody = Type.Object(
  {
    customer: CustomerSchema,
    deliveryMethod: Type.Union([
      Type.Literal("home_delivery"),
      Type.Literal("store_pickup"),
    ]),
    shippingAddress: Type.Optional(AddressSchema),
    paymentMethod: Type.Literal("cash_on_delivery"),
    items: Type.Array(OrderItemInputSchema, { minItems: 1, maxItems: 50 }),
  },
  { additionalProperties: false },
);
type CreateOrderBodyType = Static<typeof CreateOrderBody>;

const TrackOrderBody = Type.Object(
  {
    orderNumber: Type.String({ minLength: 8, maxLength: 32 }),
    phone: Type.String({ minLength: 8, maxLength: 32 }),
  },
  { additionalProperties: false },
);
type TrackOrderBodyType = Static<typeof TrackOrderBody>;

const TrackingStepSchema = Type.Object(
  {
    key: Type.Union([
      Type.Literal("received"),
      Type.Literal("confirmed"),
      Type.Literal("preparing"),
      Type.Literal("shipped"),
      Type.Literal("delivered"),
    ]),
    label: Type.String(),
    description: Type.String(),
    state: Type.Union([
      Type.Literal("completed"),
      Type.Literal("current"),
      Type.Literal("upcoming"),
      Type.Literal("cancelled"),
    ]),
    completedAt: Type.Optional(Type.String({ format: "date-time" })),
  },
  { additionalProperties: false },
);

const TrackingSchema = Type.Object(
  {
    orderNumber: Type.String(),
    status: OrderStatusSchema,
    statusLabel: Type.String(),
    statusDescription: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
    customerFirstName: Type.Optional(Type.String()),
    maskedPhone: Type.String(),
    deliveryMethod: Type.Union([
      Type.Literal("home_delivery"),
      Type.Literal("store_pickup"),
    ]),
    deliveryLocation: Type.Optional(
      Type.Object(
        {
          governorate: Type.Optional(Type.String()),
          city: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    items: Type.Array(OrderItemSchema),
    totals: TotalsSchema,
    timeline: Type.Array(TrackingStepSchema),
    nextStepTitle: Type.String(),
    nextStepDescription: Type.String(),
    isDemo: Type.Literal(false),
  },
  { $id: "OrderTracking", additionalProperties: false },
);

function idempotencyKey(value: string | string[] | undefined): string {
  const key = Array.isArray(value) ? value[0] : value;
  if (!key || !/^[A-Za-z0-9._:-]{1,160}$/.test(key.trim())) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_IDEMPOTENCY_KEY",
      title: "Invalid idempotency key",
      detail:
        "The Idempotency-Key header must contain between one and 160 safe characters.",
    });
  }
  return key.trim();
}

export interface OrderRouteDependencies {
  orderRepository: OrderRepository;
}

export function registerOrderRoutes(
  app: FastifyInstance,
  dependencies: OrderRouteDependencies,
): void {
  app.addSchema(OrderItemSchema);
  app.addSchema(AddressSchema);
  app.addSchema(CustomerSchema);
  app.addSchema(TotalsSchema);
  app.addSchema(OrderSchema);
  app.addSchema(TrackingSchema);

  app.post<{ Body: CreateOrderBodyType }>(
    "/api/v1/orders",
    {
      schema: {
        operationId: "createGuestOrder",
        summary: "Create an authoritative guest order from the current cart",
        tags: ["orders"],
        headers: Type.Object({
          "idempotency-key": Type.String({ minLength: 1, maxLength: 160 }),
        }),
        body: CreateOrderBody,
        response: {
          201: OrderSchema,
          400: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const order = await dependencies.orderRepository.create({
        cartToken: cookieToken(request),
        idempotencyKey: idempotencyKey(request.headers["idempotency-key"]),
        ...request.body,
      });
      return reply.status(201).send(order);
    },
  );

  app.post<{ Body: TrackOrderBodyType }>(
    "/api/v1/orders/track",
    {
      schema: {
        operationId: "trackGuestOrder",
        summary: "Track a guest order with its number and phone",
        tags: ["orders"],
        body: TrackOrderBody,
        response: {
          200: TrackingSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await dependencies.orderRepository.track(request.body);
      if (!result) {
        return reply.status(404).send({
          type: "https://api.hbs-home.com/problems/order-not-found",
          title: "Order not found",
          status: 404,
          detail: "The order could not be found with the supplied details.",
          instance: request.url,
          code: "ORDER_NOT_FOUND",
          requestId: request.id,
        });
      }
      return result;
    },
  );
}

export type { PublicOrder, PublicOrderTracking };
