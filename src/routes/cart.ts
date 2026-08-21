import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { CartRepository } from "../cart/cart-repository.js";
import { ProblemDetailSchema } from "../http/problem.js";

const CartLineSchema = Type.Object(
  {
    lineId: Type.String(),
    productId: Type.String(),
    productSlug: Type.String(),
    productName: Type.String(),
    productReference: Type.String(),
    variantId: Type.String(),
    sku: Type.String(),
    quantity: Type.Integer({ minimum: 1, maximum: 99 }),
    unitPriceMinor: Type.Integer({ minimum: 0 }),
    compareAtPriceMinor: Type.Union([
      Type.Integer({ minimum: 0 }),
      Type.Null(),
    ]),
    lineTotalMinor: Type.Integer({ minimum: 0 }),
    priceAtAddMinor: Type.Integer({ minimum: 0 }),
    priceChanged: Type.Boolean(),
    imageUrl: Type.String(),
    imageAlt: Type.String(),
    category: Type.String(),
    colorLabel: Type.Union([Type.String(), Type.Null()]),
    widthCm: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    heightCm: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    selectedOptions: Type.Array(
      Type.Object({ label: Type.String(), value: Type.String() }),
    ),
    sellingUnitLabel: Type.String(),
    shippingProfile: Type.Union([Type.String(), Type.Null()]),
    availability: Type.Union([
      Type.Literal("in_stock"),
      Type.Literal("low_stock"),
      Type.Literal("out_of_stock"),
      Type.Literal("made_to_order"),
    ]),
    availableQuantity: Type.Integer({ minimum: 0, maximum: 99 }),
    status: Type.Union([
      Type.Literal("available"),
      Type.Literal("low_stock"),
      Type.Literal("out_of_stock"),
      Type.Literal("variant_missing"),
      Type.Literal("product_missing"),
      Type.Literal("price_changed"),
      Type.Literal("quantity_adjusted"),
    ]),
    canPurchase: Type.Boolean(),
  },
  { $id: "CartLine", additionalProperties: false },
);

const PromotionSchema = Type.Union([
  Type.Null(),
  Type.Object(
    {
      code: Type.String(),
      valid: Type.Boolean(),
      discountMinor: Type.Integer({ minimum: 0 }),
      discountType: Type.Union([
        Type.Literal("percentage"),
        Type.Literal("fixed_amount"),
        Type.Null(),
      ]),
      discountValue: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
      reason: Type.Union([
        Type.Literal("minimum_subtotal"),
        Type.Literal("expired"),
        Type.Literal("usage_limit"),
        Type.Literal("inactive"),
        Type.Null(),
      ]),
    },
    { additionalProperties: false },
  ),
]);

const CartSchema = Type.Object(
  {
    cartId: Type.String({ format: "uuid" }),
    currency: Type.Literal("TND"),
    expiresAt: Type.String({ format: "date-time" }),
    items: Type.Array(CartLineSchema),
    itemCount: Type.Integer({ minimum: 0 }),
    lineCount: Type.Integer({ minimum: 0 }),
    totals: Type.Object(
      {
        subtotalMinor: Type.Integer({ minimum: 0 }),
        discountMinor: Type.Integer({ minimum: 0 }),
        shippingMinor: Type.Integer({ minimum: 0 }),
        totalEstimatedMinor: Type.Integer({ minimum: 0 }),
        freeShippingThresholdMinor: Type.Integer({ minimum: 0 }),
        amountUntilFreeShippingMinor: Type.Integer({ minimum: 0 }),
        hasFreeShipping: Type.Boolean(),
        requiresShippingQuote: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    promotion: PromotionSchema,
    hasUnavailableItems: Type.Boolean(),
    hasPriceChanges: Type.Boolean(),
  },
  { $id: "Cart", additionalProperties: false },
);

const CartItemBody = Type.Object(
  {
    productId: Type.String({ minLength: 1, maxLength: 160 }),
    variantId: Type.String({ minLength: 1, maxLength: 160 }),
    quantity: Type.Integer({ minimum: 1, maximum: 99 }),
  },
  { additionalProperties: false },
);
const QuantityBody = Type.Object(
  { quantity: Type.Integer({ minimum: 0, maximum: 99 }) },
  { additionalProperties: false },
);
const LineParams = Type.Object(
  { lineId: Type.String({ minLength: 3, maxLength: 321 }) },
  { additionalProperties: false },
);
const PromotionBody = Type.Object(
  { code: Type.String({ minLength: 3, maxLength: 64 }) },
  { additionalProperties: false },
);

type CartItemBodyType = Static<typeof CartItemBody>;
type QuantityBodyType = Static<typeof QuantityBody>;
type LineParamsType = Static<typeof LineParams>;
type PromotionBodyType = Static<typeof PromotionBody>;

export function cookieToken(request: FastifyRequest): string | null {
  const header = request.headers["x-cart-token"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const cookie = request.headers.cookie;
  if (!cookie) return null;
  const match = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("hbs_cart_token="));
  return match
    ? decodeURIComponent(match.slice("hbs_cart_token=".length))
    : null;
}

function setCartCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
): void {
  const isHbsHomeHost =
    request.hostname === "hbs-home.com" ||
    request.hostname.endsWith(".hbs-home.com");
  const secure = request.protocol === "https" || isHbsHomeHost;
  const domain = isHbsHomeHost ? "; Domain=.hbs-home.com" : "";
  reply.header(
    "set-cookie",
    `hbs_cart_token=${encodeURIComponent(token)}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}${domain}`,
  );
  reply.header("cache-control", "no-store");
}

export interface CartRouteDependencies {
  cartRepository: CartRepository;
}

export function registerCartRoutes(
  app: FastifyInstance,
  dependencies: CartRouteDependencies,
): void {
  app.addSchema(CartLineSchema);
  app.addSchema(CartSchema);

  app.get(
    "/api/v1/cart",
    {
      schema: {
        operationId: "getCart",
        summary: "Read or create the current opaque-token guest cart",
        tags: ["cart"],
        response: { 200: CartSchema, 500: ProblemDetailSchema },
      },
    },
    async (request, reply) => {
      const session = await dependencies.cartRepository.getCart(
        cookieToken(request),
      );
      setCartCookie(request, reply, session.token);
      return session.cart;
    },
  );

  app.post<{ Body: CartItemBodyType }>(
    "/api/v1/cart/items",
    {
      schema: {
        operationId: "addCartItem",
        summary: "Add a catalog variant to the current cart",
        tags: ["cart"],
        body: CartItemBody,
        response: {
          200: CartSchema,
          400: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await dependencies.cartRepository.addItem(
        cookieToken(request),
        request.body,
      );
      setCartCookie(request, reply, session.token);
      return session.cart;
    },
  );

  app.patch<{ Params: LineParamsType; Body: QuantityBodyType }>(
    "/api/v1/cart/items/:lineId",
    {
      schema: {
        operationId: "updateCartItem",
        summary: "Change a cart line quantity",
        tags: ["cart"],
        params: LineParams,
        body: QuantityBody,
        response: {
          200: CartSchema,
          400: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await dependencies.cartRepository.updateItem(
        cookieToken(request),
        request.params.lineId,
        request.body.quantity,
      );
      setCartCookie(request, reply, session.token);
      return session.cart;
    },
  );

  app.delete<{ Params: LineParamsType }>(
    "/api/v1/cart/items/:lineId",
    {
      schema: {
        operationId: "removeCartItem",
        summary: "Remove a cart line",
        tags: ["cart"],
        params: LineParams,
        response: { 200: CartSchema, 400: ProblemDetailSchema },
      },
    },
    async (request, reply) => {
      const session = await dependencies.cartRepository.removeItem(
        cookieToken(request),
        request.params.lineId,
      );
      setCartCookie(request, reply, session.token);
      return session.cart;
    },
  );

  app.delete(
    "/api/v1/cart",
    {
      schema: {
        operationId: "clearCart",
        summary: "Clear the current cart",
        tags: ["cart"],
        response: { 200: CartSchema },
      },
    },
    async (request, reply) => {
      const session = await dependencies.cartRepository.clearCart(
        cookieToken(request),
      );
      setCartCookie(request, reply, session.token);
      return session.cart;
    },
  );

  app.post<{ Body: PromotionBodyType }>(
    "/api/v1/cart/promotion",
    {
      schema: {
        operationId: "applyCartPromotion",
        summary: "Apply one promotion code to the cart",
        tags: ["cart"],
        body: PromotionBody,
        response: {
          200: CartSchema,
          400: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await dependencies.cartRepository.applyPromotion(
        cookieToken(request),
        request.body.code,
      );
      setCartCookie(request, reply, session.token);
      return session.cart;
    },
  );

  app.delete(
    "/api/v1/cart/promotion",
    {
      schema: {
        operationId: "removeCartPromotion",
        summary: "Remove the current promotion code",
        tags: ["cart"],
        response: { 200: CartSchema },
      },
    },
    async (request, reply) => {
      const session = await dependencies.cartRepository.removePromotion(
        cookieToken(request),
      );
      setCartCookie(request, reply, session.token);
      return session.cart;
    },
  );
}
