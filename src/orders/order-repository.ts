import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql, type Kysely, type Selectable, type Transaction } from "kysely";
import type {
  CustomerTable,
  DatabaseSchema,
  OrderItemTable,
  OrderStatus,
  OrderTable,
  PromotionTable,
} from "../database/schema.js";
import { AppError } from "../http/problem.js";
import {
  PostgresProductRepository,
  type Product,
  type ProductVariant,
} from "../catalog/product-repository.js";
import { resolveLineImage } from "../cart/cart-repository.js";
import { reserveWithinTransaction } from "../inventory/reservation-repository.js";

const STANDARD_SHIPPING_FEE_MINOR = 7_000;
const FREE_SHIPPING_THRESHOLD_MINOR = 200_000;
const ORDER_RESERVATION_TTL_MS = 30 * 60 * 1_000;

type DbExecutor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;
type OrderRow = Selectable<OrderTable>;
type CustomerRow = Selectable<CustomerTable>;
type OrderItemRow = Selectable<OrderItemTable>;
type PromotionRow = Selectable<PromotionTable>;

export type OrderDeliveryMethod = "home_delivery" | "store_pickup";
export type OrderPaymentMethod = "cash_on_delivery";

export interface OrderCustomerInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
}

export interface OrderAddressInput {
  governorate: string;
  city: string;
  postalCode?: string;
  addressLine: string;
  landmark?: string;
  deliveryNote?: string;
}

export interface OrderItemInput {
  productId: string;
  variantId: string;
  quantity: number;
  expectedUnitPriceMinor: number;
}

export interface CreateOrderInput {
  cartToken: string | null;
  idempotencyKey: string;
  customer: OrderCustomerInput;
  deliveryMethod: OrderDeliveryMethod;
  shippingAddress?: OrderAddressInput;
  paymentMethod: OrderPaymentMethod;
  items: readonly OrderItemInput[];
}

export interface OrderItemSnapshot {
  productId: string;
  variantId: string;
  productSlug: string;
  productName: string;
  productReference: string;
  sku: string;
  imageUrl: string;
  imageAlt: string;
  category: string;
  colorLabel?: string;
  widthCm?: number;
  heightCm?: number;
  curtainHeaderLabel?: string;
  eyeletColorLabel?: string;
  liningLabel?: string;
  selectedOptions: readonly { label: string; value: string }[];
  sellingUnitLabel: string;
  shippingProfile?: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface OrderTotals {
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  totalMinor: number;
}

export interface PublicOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customer: OrderCustomerInput;
  deliveryMethod: OrderDeliveryMethod;
  shippingAddress?: OrderAddressInput;
  paymentMethod: OrderPaymentMethod;
  items: readonly OrderItemSnapshot[];
  totals: OrderTotals;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  isDemo: false;
}

export interface OrderTrackingStep {
  key: "received" | "confirmed" | "preparing" | "shipped" | "delivered";
  label: string;
  description: string;
  state: "completed" | "current" | "upcoming" | "cancelled";
  completedAt?: string;
}

export interface PublicOrderTracking {
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  statusDescription: string;
  createdAt: string;
  updatedAt: string;
  customerFirstName?: string;
  maskedPhone: string;
  deliveryMethod: OrderDeliveryMethod;
  deliveryLocation?: { governorate?: string; city?: string };
  items: readonly OrderItemSnapshot[];
  totals: OrderTotals;
  timeline: readonly OrderTrackingStep[];
  nextStepTitle: string;
  nextStepDescription: string;
  isDemo: false;
}

export interface OrderRepository {
  create(input: CreateOrderInput): Promise<PublicOrder>;
  getByNumber(orderNumber: string): Promise<PublicOrder | null>;
  track(input: {
    orderNumber: string;
    phone: string;
  }): Promise<PublicOrderTracking | null>;
}

function fail(
  statusCode: number,
  code: string,
  title: string,
  detail: string,
): never {
  throw new AppError({ statusCode, code, title, detail });
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizePhone(value: string): string {
  let phone = value.trim().replace(/[\s.\-()]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("00216")) phone = phone.slice(5);
  else if (phone.startsWith("216") && phone.length > 8) phone = phone.slice(3);
  if (!/^\d{8}$/.test(phone)) return value.trim();
  return `+216${phone}`;
}

function maskedPhone(phone: string): string {
  const digits = phone.replace(/^\+216/, "");
  return /^\d{8}$/.test(digits)
    ? `+216 ${digits.slice(0, 2)} *** ${digits.slice(5)}`
    : "•••";
}

function requiredText(value: string, field: string, max: number): string {
  const result = value.trim();
  if (!result || result.length > max) {
    fail(
      400,
      "INVALID_ORDER",
      "Invalid order",
      `${field} is required and must be at most ${String(max)} characters.`,
    );
  }
  return result;
}

function normalizeItems(items: readonly OrderItemInput[]): OrderItemInput[] {
  if (items.length < 1 || items.length > 50)
    fail(
      400,
      "INVALID_ORDER_ITEMS",
      "Invalid order items",
      "An order must contain between one and fifty items.",
    );
  const seen = new Set<string>();
  return [...items]
    .map((item) => {
      const productId = requiredText(item.productId, "productId", 160);
      const variantId = requiredText(item.variantId, "variantId", 160);
      if (seen.has(variantId))
        fail(
          400,
          "INVALID_ORDER_ITEMS",
          "Invalid order items",
          "A variant may appear only once in an order.",
        );
      seen.add(variantId);
      if (
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99
      )
        fail(
          400,
          "INVALID_ORDER_ITEMS",
          "Invalid order items",
          "Each quantity must be an integer between one and ninety-nine.",
        );
      if (
        !Number.isInteger(item.expectedUnitPriceMinor) ||
        item.expectedUnitPriceMinor < 0
      )
        fail(
          400,
          "INVALID_ORDER_ITEMS",
          "Invalid order items",
          "Each expected price must be a non-negative integer.",
        );
      return {
        productId,
        variantId,
        quantity: item.quantity,
        expectedUnitPriceMinor: item.expectedUnitPriceMinor,
      };
    })
    .sort((left, right) => left.variantId.localeCompare(right.variantId));
}

function fingerprint(input: {
  customer: OrderCustomerInput;
  deliveryMethod: OrderDeliveryMethod;
  shippingAddress?: OrderAddressInput;
  paymentMethod: OrderPaymentMethod;
  items: readonly OrderItemInput[];
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function orderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `HBS-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function statusLabel(status: OrderStatus): string {
  return {
    pending_confirmation: "En attente de confirmation",
    confirmed: "Confirmée",
    preparing: "En préparation",
    shipped: "Expédiée",
    delivered: "Livrée",
    cancelled: "Annulée",
  }[status];
}

function statusDescription(status: OrderStatus): string {
  return {
    pending_confirmation:
      "Notre équipe va vous appeler pour confirmer votre commande.",
    confirmed: "Votre commande est confirmée et va être préparée.",
    preparing: "Votre commande est en cours de préparation.",
    shipped: "Votre commande a été remise au transporteur.",
    delivered: "Votre commande a été livrée.",
    cancelled: "Cette commande a été annulée.",
  }[status];
}

function trackingTimeline(
  status: OrderStatus,
  createdAt: string,
): OrderTrackingStep[] {
  const steps: Pick<OrderTrackingStep, "key" | "label" | "description">[] = [
    {
      key: "received",
      label: "Commande reçue",
      description: "Votre commande a été enregistrée.",
    },
    {
      key: "confirmed",
      label: "Commande confirmée",
      description: "Notre équipe a confirmé les informations.",
    },
    {
      key: "preparing",
      label: "Préparation",
      description: "Les articles sont préparés.",
    },
    {
      key: "shipped",
      label: "Expédition",
      description: "La commande est en route ou disponible au retrait.",
    },
    {
      key: "delivered",
      label: "Livraison",
      description: "La commande est livrée.",
    },
  ];
  const reached =
    status === "cancelled"
      ? 0
      : [
          "pending_confirmation",
          "confirmed",
          "preparing",
          "shipped",
          "delivered",
        ].indexOf(status);
  return steps.map((step, index) => {
    const state: OrderTrackingStep["state"] =
      status === "cancelled"
        ? index === 0
          ? "completed"
          : "cancelled"
        : index < reached
          ? "completed"
          : index === reached
            ? "current"
            : "upcoming";
    return {
      ...step,
      state,
      ...(index === 0 && state === "completed"
        ? { completedAt: createdAt }
        : {}),
    };
  });
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function shippingProfile(product: Product): string | undefined {
  const value = object(product.details).shippingProfile;
  return stringValue(value);
}

function variantOptions(
  variant: ProductVariant,
): readonly { label: string; value: string }[] {
  return [
    variant.curtainHeader
      ? { label: "Tête", value: variant.curtainHeader }
      : null,
    variant.lining ? { label: "Doublure", value: variant.lining } : null,
    variant.sizeLabel ? { label: "Taille", value: variant.sizeLabel } : null,
  ].filter(
    (value): value is { label: string; value: string } => value !== null,
  );
}

function snapshot(
  product: Product,
  variant: ProductVariant,
  quantity: number,
): OrderItemSnapshot {
  const image = resolveLineImage(product, variant);
  const lineTotalMinor = variant.price.amountMinor * quantity;
  const profile = shippingProfile(product);
  return {
    productId: product.id,
    variantId: variant.id,
    productSlug: product.slug,
    productName: product.name,
    productReference: product.reference,
    sku: variant.sku,
    imageUrl: image.url,
    imageAlt: image.alt,
    category: product.category,
    ...(variant.widthCm ? { widthCm: variant.widthCm } : {}),
    ...(variant.heightCm ? { heightCm: variant.heightCm } : {}),
    ...(variant.curtainHeader
      ? { curtainHeaderLabel: variant.curtainHeader }
      : {}),
    ...(variant.eyeletColor ? { eyeletColorLabel: variant.eyeletColor } : {}),
    ...(variant.lining ? { liningLabel: variant.lining } : {}),
    selectedOptions: variantOptions(variant),
    sellingUnitLabel: product.sellingMode,
    ...(profile ? { shippingProfile: profile } : {}),
    quantity,
    unitPriceMinor: variant.price.amountMinor,
    lineTotalMinor,
  };
}

function discountReason(
  row: PromotionRow,
  subtotalMinor: number,
  now: Date,
): string | null {
  if (!row.is_active) return "inactive";
  if (row.starts_at && row.starts_at > now) return "inactive";
  if (row.ends_at && row.ends_at <= now) return "expired";
  if (subtotalMinor < row.min_subtotal_minor) return "minimum_subtotal";
  if (row.max_redemptions !== null && row.redeemed_count >= row.max_redemptions)
    return "usage_limit";
  return null;
}

function discountAmount(row: PromotionRow, subtotalMinor: number): number {
  return row.discount_type === "percentage"
    ? Math.min(
        subtotalMinor,
        Math.floor((subtotalMinor * row.discount_value) / 100),
      )
    : Math.min(subtotalMinor, row.discount_value);
}

function totals(
  items: readonly OrderItemSnapshot[],
  deliveryMethod: OrderDeliveryMethod,
  discountMinor: number,
): OrderTotals {
  const subtotalMinor = items.reduce(
    (sum, item) => sum + item.lineTotalMinor,
    0,
  );
  const appliedDiscountMinor = Math.max(
    0,
    Math.min(discountMinor, subtotalMinor),
  );
  const discountedSubtotal = subtotalMinor - appliedDiscountMinor;
  const quoteRequired = items.some(
    (item) =>
      item.shippingProfile === "volumineux" ||
      item.shippingProfile === "hors_norme",
  );
  const shippingMinor =
    deliveryMethod === "store_pickup" ||
    quoteRequired ||
    discountedSubtotal === 0 ||
    discountedSubtotal >= FREE_SHIPPING_THRESHOLD_MINOR
      ? 0
      : STANDARD_SHIPPING_FEE_MINOR;
  return {
    subtotalMinor,
    discountMinor: appliedDiscountMinor,
    shippingMinor,
    totalMinor: discountedSubtotal + shippingMinor,
  };
}

function shippingStatus(
  items: readonly OrderItemSnapshot[],
  deliveryMethod: OrderDeliveryMethod,
  shippingMinor: number,
): "calculated" | "to_confirm" {
  const quoteRequired = items.some(
    (item) =>
      item.shippingProfile === "volumineux" ||
      item.shippingProfile === "hors_norme",
  );
  return deliveryMethod === "home_delivery" &&
    quoteRequired &&
    shippingMinor === 0
    ? "to_confirm"
    : "calculated";
}

function mapAddress(
  value: Record<string, unknown> | null,
): OrderAddressInput | undefined {
  if (!value) return undefined;
  const governorate = stringValue(value.governorate) ?? "";
  const city = stringValue(value.city) ?? "";
  const addressLine = stringValue(value.addressLine) ?? "";
  if (!governorate && !city && !addressLine) return undefined;
  const postalCode = stringValue(value.postalCode);
  const landmark = stringValue(value.landmark);
  const deliveryNote = stringValue(value.deliveryNote);
  return {
    governorate,
    city,
    addressLine,
    ...(postalCode ? { postalCode } : {}),
    ...(landmark ? { landmark } : {}),
    ...(deliveryNote ? { deliveryNote } : {}),
  };
}

function mapSnapshot(row: OrderItemRow): OrderItemSnapshot {
  return {
    productId: row.product_id,
    variantId: row.variant_id,
    productSlug: row.product_slug,
    productName: row.product_name,
    productReference: row.product_reference,
    sku: row.sku,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    category: row.category,
    ...(row.color_label ? { colorLabel: row.color_label } : {}),
    ...(row.width_cm !== null ? { widthCm: row.width_cm } : {}),
    ...(row.height_cm !== null ? { heightCm: row.height_cm } : {}),
    ...(row.curtain_header_label
      ? { curtainHeaderLabel: row.curtain_header_label }
      : {}),
    ...(row.eyelet_color_label
      ? { eyeletColorLabel: row.eyelet_color_label }
      : {}),
    ...(row.lining_label ? { liningLabel: row.lining_label } : {}),
    selectedOptions: row.selected_options,
    sellingUnitLabel: row.selling_unit_label,
    ...(row.shipping_profile ? { shippingProfile: row.shipping_profile } : {}),
    quantity: row.quantity,
    unitPriceMinor: row.unit_price_minor,
    lineTotalMinor: row.line_total_minor,
  };
}

function mapOrder(
  row: OrderRow,
  customer: CustomerRow,
  items: readonly OrderItemRow[],
): PublicOrder {
  const address = mapAddress(row.shipping_address);
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    customer: {
      firstName: customer.first_name,
      lastName: customer.last_name,
      phone: customer.phone,
      ...(customer.email ? { email: customer.email } : {}),
    },
    deliveryMethod: row.delivery_method,
    ...(address ? { shippingAddress: address } : {}),
    paymentMethod: row.payment_method,
    items: items.map(mapSnapshot),
    totals: {
      subtotalMinor: row.subtotal_minor,
      discountMinor: row.discount_minor,
      shippingMinor: row.shipping_minor,
      totalMinor: row.total_minor,
    },
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    idempotencyKey: row.idempotency_key,
    isDemo: false,
  };
}

export class PostgresOrderRepository implements OrderRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async create(input: CreateOrderInput): Promise<PublicOrder> {
    const idempotencyKey = requiredText(
      input.idempotencyKey,
      "Idempotency-Key",
      160,
    );
    const customer = {
      firstName: requiredText(input.customer.firstName, "firstName", 60),
      lastName: requiredText(input.customer.lastName, "lastName", 60),
      phone: normalizePhone(input.customer.phone),
      ...(input.customer.email?.trim()
        ? { email: input.customer.email.trim().toLowerCase() }
        : {}),
    };
    if (!/^\+216\d{8}$/.test(customer.phone))
      fail(
        400,
        "INVALID_ORDER",
        "Invalid order",
        "phone must be a valid Tunisian number.",
      );
    if (input.deliveryMethod === "home_delivery" && !input.shippingAddress)
      fail(
        400,
        "INVALID_ORDER",
        "Invalid order",
        "A delivery address is required for home delivery.",
      );
    const items = normalizeItems(input.items);
    const requestFingerprint = fingerprint({
      customer,
      deliveryMethod: input.deliveryMethod,
      ...(input.shippingAddress
        ? { shippingAddress: input.shippingAddress }
        : {}),
      paymentMethod: input.paymentMethod,
      items,
    });
    if (!input.cartToken || !/^[A-Za-z0-9_-]{32,128}$/.test(input.cartToken))
      fail(
        400,
        "CART_REQUIRED",
        "Cart required",
        "A current cart is required to create an order.",
      );
    const cartToken = input.cartToken;

    return this.database.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))`.execute(
        trx,
      );
      const existing = await trx
        .selectFrom("commerce.orders")
        .selectAll()
        .where("idempotency_key", "=", idempotencyKey)
        .executeTakeFirst();
      if (existing) {
        if (existing.request_fingerprint !== requestFingerprint)
          fail(
            409,
            "IDEMPOTENCY_KEY_CONFLICT",
            "Idempotency key conflict",
            "This key was already used for different order data.",
          );
        return this.loadOrder(trx, existing.id);
      }

      const cart = await trx
        .selectFrom("commerce.carts")
        .selectAll()
        .where("token_hash", "=", hashToken(cartToken))
        .where("status", "=", "active")
        .where("expires_at", ">", new Date())
        .forUpdate()
        .executeTakeFirst();
      if (!cart)
        fail(
          409,
          "CART_EXPIRED",
          "Cart expired",
          "Refresh your cart before creating an order.",
        );

      const cartRows = await trx
        .selectFrom("commerce.cart_items")
        .selectAll()
        .where("cart_id", "=", cart.id)
        .orderBy("variant_id", "asc")
        .execute();
      if (cartRows.length === 0)
        fail(
          409,
          "EMPTY_CART",
          "Empty cart",
          "The cart does not contain any item.",
        );
      if (
        cartRows.length !== items.length ||
        cartRows.some((row) => {
          const expectedItem = items.find(
            (item) => item.variantId === row.variant_id,
          );
          if (!expectedItem) return true;
          return (
            row.product_id !== expectedItem.productId ||
            row.quantity !== expectedItem.quantity
          );
        })
      )
        fail(
          409,
          "CART_CHANGED",
          "Cart changed",
          "Refresh your cart before creating an order.",
        );

      const products = await new PostgresProductRepository(trx).getByIds(
        cartRows.map((row) => row.product_id),
      );
      const productsById = new Map(
        products.map((product) => [product.id, product]),
      );
      const balances = await trx
        .selectFrom("inventory.stock_balances")
        .selectAll()
        .where(
          "variant_id",
          "in",
          cartRows.map((row) => row.variant_id),
        )
        .forUpdate()
        .execute();
      const balancesByVariant = new Map(
        balances.map((balance) => [balance.variant_id, balance]),
      );
      const snapshots: OrderItemSnapshot[] = [];
      const reservationItems: {
        productId: string;
        variantId: string;
        quantity: number;
      }[] = [];
      for (const row of cartRows) {
        const product = productsById.get(row.product_id);
        const variant = product?.variants.find(
          (candidate) => candidate.id === row.variant_id,
        );
        if (!product || !variant)
          fail(
            409,
            "ITEM_UNAVAILABLE",
            "Item unavailable",
            "One of the cart items is no longer available.",
          );
        const expected = items.find(
          (item) => item.variantId === row.variant_id,
        );
        if (expected?.expectedUnitPriceMinor !== variant.price.amountMinor)
          fail(
            409,
            "PRICE_CHANGED",
            "Price changed",
            "One of the cart prices has changed. Refresh your cart.",
          );
        const balance = balancesByVariant.get(row.variant_id);
        const available =
          balance &&
          (balance.availability === "made_to_order" || !balance.track_inventory)
            ? row.quantity
            : Math.max(0, (balance?.on_hand ?? 0) - (balance?.reserved ?? 0));
        if (!balance || available < row.quantity)
          fail(
            409,
            "INSUFFICIENT_STOCK",
            "Insufficient stock",
            `Only ${String(available)} unit(s) are available for ${product.name}.`,
          );
        snapshots.push(snapshot(product, variant, row.quantity));
        if (balance.track_inventory && balance.availability !== "made_to_order")
          reservationItems.push({
            productId: row.product_id,
            variantId: row.variant_id,
            quantity: row.quantity,
          });
      }

      let discountMinor = 0;
      const promoCode: string | null = cart.promo_code;
      if (promoCode) {
        const promotion = await trx
          .selectFrom("commerce.promotions")
          .selectAll()
          .where("code", "=", promoCode)
          .forUpdate()
          .executeTakeFirst();
        if (!promotion)
          fail(
            409,
            "PROMOTION_CHANGED",
            "Promotion unavailable",
            "The promotion is no longer available.",
          );
        const reason = discountReason(
          promotion,
          snapshots.reduce((sum, item) => sum + item.lineTotalMinor, 0),
          new Date(),
        );
        if (reason)
          fail(
            409,
            "PROMOTION_CHANGED",
            "Promotion unavailable",
            "The promotion is no longer applicable.",
          );
        discountMinor = discountAmount(
          promotion,
          snapshots.reduce((sum, item) => sum + item.lineTotalMinor, 0),
        );
        const updated = await trx
          .updateTable("commerce.promotions")
          .set({
            redeemed_count: sql<number>`redeemed_count + 1`,
            updated_at: new Date(),
          })
          .where("id", "=", promotion.id)
          .where((expression) =>
            expression.or([
              expression("max_redemptions", "is", null),
              expression(
                "redeemed_count",
                "<",
                expression.ref("max_redemptions"),
              ),
            ]),
          )
          .returning("id")
          .executeTakeFirst();
        if (!updated)
          fail(
            409,
            "PROMOTION_CHANGED",
            "Promotion unavailable",
            "The promotion usage limit was reached.",
          );
      }
      const orderTotals = totals(
        snapshots,
        input.deliveryMethod,
        discountMinor,
      );

      const phone = customer.phone;
      await sql`select pg_advisory_xact_lock(hashtextextended(${phone}, 0))`.execute(
        trx,
      );
      const existingCustomer = await trx
        .selectFrom("commerce.customers")
        .selectAll()
        .where("phone", "=", phone)
        .where("merged_into_customer_id", "is", null)
        .orderBy("updated_at", "desc")
        .forUpdate()
        .executeTakeFirst();
      const customerRow = existingCustomer
        ? await trx
            .updateTable("commerce.customers")
            .set({
              first_name: customer.firstName,
              last_name: customer.lastName,
              email: customer.email ?? existingCustomer.email,
              governorate:
                input.shippingAddress?.governorate ??
                existingCustomer.governorate,
              updated_at: new Date(),
            })
            .where("id", "=", existingCustomer.id)
            .returningAll()
            .executeTakeFirstOrThrow()
        : await trx
            .insertInto("commerce.customers")
            .values({
              id: randomUUID(),
              first_name: customer.firstName,
              last_name: customer.lastName,
              phone,
              email: customer.email ?? null,
              governorate: input.shippingAddress?.governorate ?? "",
              preferred_channel: null,
              tags: [],
              internal_notes: "",
              merged_into_customer_id: null,
              merged_at: null,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returningAll()
            .executeTakeFirstOrThrow();

      const id = randomUUID();
      const createdAt = new Date();
      const orderRow = await trx
        .insertInto("commerce.orders")
        .values({
          id,
          order_number: orderNumber(),
          customer_id: customerRow.id,
          cart_id: cart.id,
          status: "pending_confirmation",
          payment_status: "pending",
          shipping_status: shippingStatus(
            snapshots,
            input.deliveryMethod,
            orderTotals.shippingMinor,
          ),
          delivery_method: input.deliveryMethod,
          payment_method: input.paymentMethod,
          shipping_address: input.shippingAddress
            ? {
                governorate: input.shippingAddress.governorate,
                city: input.shippingAddress.city,
                addressLine: input.shippingAddress.addressLine,
                ...(input.shippingAddress.postalCode
                  ? { postalCode: input.shippingAddress.postalCode }
                  : {}),
                ...(input.shippingAddress.landmark
                  ? { landmark: input.shippingAddress.landmark }
                  : {}),
                ...(input.shippingAddress.deliveryNote
                  ? { deliveryNote: input.shippingAddress.deliveryNote }
                  : {}),
              }
            : null,
          currency: "TND",
          subtotal_minor: orderTotals.subtotalMinor,
          discount_minor: orderTotals.discountMinor,
          shipping_minor: orderTotals.shippingMinor,
          total_minor: orderTotals.totalMinor,
          promo_code: promoCode,
          idempotency_key: idempotencyKey,
          request_fingerprint: requestFingerprint,
          reservation_id: null,
          created_at: createdAt,
          updated_at: createdAt,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      let reservationId: string | null = null;
      if (reservationItems.length > 0) {
        const reservation = await reserveWithinTransaction(trx, {
          reservationKey: `order:${id}`,
          orderId: id,
          items: reservationItems,
          expiresAt: new Date(Date.now() + ORDER_RESERVATION_TTL_MS),
          actorUserId: null,
        });
        reservationId = reservation.id;
      }
      const completedOrderRow = reservationId
        ? await trx
            .updateTable("commerce.orders")
            .set({ reservation_id: reservationId, updated_at: new Date() })
            .where("id", "=", id)
            .returningAll()
            .executeTakeFirstOrThrow()
        : orderRow;

      await trx
        .insertInto("commerce.order_items")
        .values(
          snapshots.map((item, index) => ({
            order_id: id,
            line_number: index + 1,
            product_id: item.productId,
            variant_id: item.variantId,
            product_slug: item.productSlug,
            product_name: item.productName,
            product_reference: item.productReference,
            sku: item.sku,
            image_url: item.imageUrl,
            image_alt: item.imageAlt,
            category: item.category,
            color_label: item.colorLabel ?? null,
            width_cm: item.widthCm ?? null,
            height_cm: item.heightCm ?? null,
            curtain_header_label: item.curtainHeaderLabel ?? null,
            eyelet_color_label: item.eyeletColorLabel ?? null,
            lining_label: item.liningLabel ?? null,
            // pg serializes JavaScript arrays using PostgreSQL array syntax by
            // default. The column is JSONB, so bind an explicit JSON string
            // to avoid malformed JSON for option snapshots.
            selected_options: sql`cast(${JSON.stringify(item.selectedOptions)} as jsonb)`,
            selling_unit_label: item.sellingUnitLabel,
            shipping_profile: item.shippingProfile ?? null,
            quantity: item.quantity,
            unit_price_minor: item.unitPriceMinor,
            line_total_minor: item.lineTotalMinor,
            created_at: createdAt,
          })),
        )
        .execute();
      await trx
        .insertInto("commerce.order_status_history")
        .values({
          id: randomUUID(),
          order_id: id,
          status: "pending_confirmation",
          reason: "order_created",
          actor_user_id: null,
          metadata: {},
          created_at: createdAt,
        })
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("commerce.outbox_events")
        .values({
          id: randomUUID(),
          aggregate_type: "order",
          aggregate_id: id,
          event_type: "order.created",
          payload: { orderId: id, orderNumber: completedOrderRow.order_number },
          status: "pending",
          attempts: 0,
          available_at: createdAt,
          processed_at: null,
          last_error: null,
          created_at: createdAt,
        })
        .executeTakeFirstOrThrow();
      await trx
        .updateTable("commerce.carts")
        .set({ status: "converted", updated_at: new Date() })
        .where("id", "=", cart.id)
        .executeTakeFirstOrThrow();

      return mapOrder(
        completedOrderRow,
        customerRow,
        snapshots.map((item, index) => ({
          order_id: id,
          line_number: index + 1,
          product_id: item.productId,
          variant_id: item.variantId,
          product_slug: item.productSlug,
          product_name: item.productName,
          product_reference: item.productReference,
          sku: item.sku,
          image_url: item.imageUrl,
          image_alt: item.imageAlt,
          category: item.category,
          color_label: item.colorLabel ?? null,
          width_cm: item.widthCm ?? null,
          height_cm: item.heightCm ?? null,
          curtain_header_label: item.curtainHeaderLabel ?? null,
          eyelet_color_label: item.eyeletColorLabel ?? null,
          lining_label: item.liningLabel ?? null,
          selected_options: item.selectedOptions,
          selling_unit_label: item.sellingUnitLabel,
          shipping_profile: item.shippingProfile ?? null,
          quantity: item.quantity,
          unit_price_minor: item.unitPriceMinor,
          line_total_minor: item.lineTotalMinor,
          created_at: createdAt,
        })),
      );
    });
  }

  async getByNumber(orderNumberValue: string): Promise<PublicOrder | null> {
    const normalized = orderNumberValue.trim().toUpperCase();
    if (!normalized) return null;
    const row = await this.database
      .selectFrom("commerce.orders")
      .selectAll()
      .where("order_number", "=", normalized)
      .executeTakeFirst();
    return row ? this.loadOrder(this.database, row.id) : null;
  }

  async track(input: {
    orderNumber: string;
    phone: string;
  }): Promise<PublicOrderTracking | null> {
    const order = await this.getByNumber(input.orderNumber);
    if (normalizePhone(input.phone) !== order?.customer.phone) return null;
    const timeline = trackingTimeline(order.status, order.createdAt);
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      statusLabel: statusLabel(order.status),
      statusDescription: statusDescription(order.status),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      ...(order.customer.firstName
        ? { customerFirstName: order.customer.firstName }
        : {}),
      maskedPhone: maskedPhone(order.customer.phone),
      deliveryMethod: order.deliveryMethod,
      ...(order.deliveryMethod === "home_delivery" && order.shippingAddress
        ? {
            deliveryLocation: {
              governorate: order.shippingAddress.governorate,
              city: order.shippingAddress.city,
            },
          }
        : {}),
      items: order.items,
      totals: order.totals,
      timeline,
      nextStepTitle: statusLabel(order.status),
      nextStepDescription: statusDescription(order.status),
      isDemo: false,
    };
  }

  private async loadOrder(
    executor: DbExecutor,
    id: string,
  ): Promise<PublicOrder> {
    const row = await executor
      .selectFrom("commerce.orders")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row)
      fail(
        404,
        "ORDER_NOT_FOUND",
        "Order not found",
        "The requested order does not exist.",
      );
    const customer = await executor
      .selectFrom("commerce.customers")
      .selectAll()
      .where("id", "=", row.customer_id)
      .executeTakeFirst();
    if (!customer)
      fail(
        500,
        "ORDER_STATE_INVALID",
        "Order state invalid",
        "The order customer snapshot is missing.",
      );
    const items = await executor
      .selectFrom("commerce.order_items")
      .selectAll()
      .where("order_id", "=", id)
      .orderBy("line_number", "asc")
      .execute();
    return mapOrder(row, customer, items);
  }
}
