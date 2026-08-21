import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type {
  CartItemTable,
  CartTable,
  DatabaseSchema,
  PromotionTable,
} from "../database/schema.js";
import {
  PostgresProductRepository,
  type Product,
} from "../catalog/product-repository.js";
import { AppError } from "../http/problem.js";

const MAX_CART_LINE_QUANTITY = 99;
const CART_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const STANDARD_SHIPPING_FEE_MINOR = 7_000;
const FREE_SHIPPING_THRESHOLD_MINOR = 200_000;

export interface CartItemInput {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface CartPromotion {
  code: string;
  valid: boolean;
  discountMinor: number;
  discountType: "percentage" | "fixed_amount" | null;
  discountValue: number | null;
  reason: "minimum_subtotal" | "expired" | "usage_limit" | "inactive" | null;
}

export interface CartLine {
  lineId: string;
  productId: string;
  productSlug: string;
  productName: string;
  productReference: string;
  variantId: string;
  sku: string;
  quantity: number;
  unitPriceMinor: number;
  compareAtPriceMinor: number | null;
  lineTotalMinor: number;
  priceAtAddMinor: number;
  priceChanged: boolean;
  imageUrl: string;
  imageAlt: string;
  category: string;
  colorLabel: string | null;
  widthCm: number | null;
  heightCm: number | null;
  selectedOptions: readonly { label: string; value: string }[];
  sellingUnitLabel: string;
  shippingProfile: string | null;
  availability: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";
  availableQuantity: number;
  status:
    | "available"
    | "low_stock"
    | "out_of_stock"
    | "variant_missing"
    | "product_missing"
    | "price_changed"
    | "quantity_adjusted";
  canPurchase: boolean;
}

export interface CartTotals {
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  totalEstimatedMinor: number;
  freeShippingThresholdMinor: number;
  amountUntilFreeShippingMinor: number;
  hasFreeShipping: boolean;
  requiresShippingQuote: boolean;
}

export interface CartView {
  cartId: string;
  currency: "TND";
  expiresAt: string;
  items: readonly CartLine[];
  itemCount: number;
  lineCount: number;
  totals: CartTotals;
  promotion: CartPromotion | null;
  hasUnavailableItems: boolean;
  hasPriceChanges: boolean;
}

export interface CartSession {
  token: string;
  cart: CartView;
}

export interface CartRepository {
  getCart(token: string | null): Promise<CartSession>;
  addItem(token: string | null, input: CartItemInput): Promise<CartSession>;
  updateItem(
    token: string | null,
    lineId: string,
    quantity: number,
  ): Promise<CartSession>;
  removeItem(token: string | null, lineId: string): Promise<CartSession>;
  clearCart(token: string | null): Promise<CartSession>;
  applyPromotion(token: string | null, code: string): Promise<CartSession>;
  removePromotion(token: string | null): Promise<CartSession>;
}

type CartRow = Selectable<CartTable>;
type CartItemRow = Selectable<CartItemTable>;
type PromotionRow = Selectable<PromotionTable>;

function fail(
  statusCode: number,
  code: string,
  title: string,
  detail: string,
): never {
  throw new AppError({ statusCode, code, title, detail });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenIsUsable(token: string | null): token is string {
  return token !== null && /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function lineImage(
  product: Product,
  variant: Product["variants"][number],
): { url: string; alt: string } {
  const byId = new Map(product.images.map((image) => [image.id, image]));
  const selected = variant.imageIds
    .map((id) => byId.get(id))
    .find((image) => image != null);
  return {
    url: selected?.url ?? variant.imageUrl,
    alt: selected?.alt ?? product.imageAlt,
  };
}

function availableQuantity(
  stock: Selectable<DatabaseSchema["inventory.stock_balances"]> | undefined,
): { availability: CartLine["availability"]; quantity: number } {
  if (!stock) return { availability: "out_of_stock", quantity: 0 };
  if (stock.availability === "made_to_order" || !stock.track_inventory) {
    return {
      availability: stock.availability,
      quantity: MAX_CART_LINE_QUANTITY,
    };
  }
  return {
    availability: stock.availability,
    quantity: Math.min(
      MAX_CART_LINE_QUANTITY,
      Math.max(0, stock.on_hand - stock.reserved),
    ),
  };
}

function promotionReason(
  promotion: PromotionRow,
  subtotalMinor: number,
  now: Date,
): CartPromotion["reason"] {
  if (!promotion.is_active) return "inactive";
  if (promotion.starts_at && new Date(promotion.starts_at) > now)
    return "expired";
  if (promotion.ends_at && new Date(promotion.ends_at) <= now) return "expired";
  if (
    promotion.max_redemptions !== null &&
    promotion.redeemed_count >= promotion.max_redemptions
  ) {
    return "usage_limit";
  }
  if (subtotalMinor < promotion.min_subtotal_minor) return "minimum_subtotal";
  return null;
}

function promotionDiscount(
  promotion: PromotionRow,
  subtotalMinor: number,
): number {
  if (promotion.discount_type === "percentage") {
    return Math.min(
      subtotalMinor,
      Math.floor((subtotalMinor * promotion.discount_value) / 100),
    );
  }
  return Math.min(subtotalMinor, promotion.discount_value);
}

export class PostgresCartRepository implements CartRepository {
  private readonly products: PostgresProductRepository;

  constructor(private readonly database: Kysely<DatabaseSchema>) {
    this.products = new PostgresProductRepository(database);
  }

  async getCart(token: string | null): Promise<CartSession> {
    const session = await this.ensureSession(token);
    return { token: session.token, cart: await this.view(session.cart) };
  }

  async addItem(
    token: string | null,
    input: CartItemInput,
  ): Promise<CartSession> {
    const session = await this.ensureSession(token);
    const productId = input.productId.trim();
    const variantId = input.variantId.trim();
    if (
      !productId ||
      !variantId ||
      !Number.isInteger(input.quantity) ||
      input.quantity < 1
    ) {
      fail(
        400,
        "INVALID_CART_ITEM",
        "Invalid cart item",
        "A cart item needs a product, variant and positive integer quantity.",
      );
    }
    const product = (await this.products.getByIds([productId]))[0];
    const variant = product?.variants.find(
      (candidate) => candidate.id === variantId,
    );
    if (!product || !variant) {
      fail(
        404,
        "CART_VARIANT_NOT_FOUND",
        "Variant not found",
        "The requested catalog variant is not available.",
      );
    }
    const stock = await this.stock(variantId);
    const available = availableQuantity(stock);
    if (available.quantity === 0) {
      fail(
        409,
        "CART_VARIANT_UNAVAILABLE",
        "Variant unavailable",
        "This variant cannot be added to the cart.",
      );
    }
    const existing = await this.database
      .selectFrom("commerce.cart_items")
      .selectAll()
      .where("cart_id", "=", session.cart.id)
      .where("variant_id", "=", variantId)
      .executeTakeFirst();
    const wanted = (existing?.quantity ?? 0) + input.quantity;
    const quantity = Math.min(
      wanted,
      available.quantity || MAX_CART_LINE_QUANTITY,
    );
    await this.database
      .insertInto("commerce.cart_items")
      .values({
        cart_id: session.cart.id,
        product_id: product.id,
        variant_id: variant.id,
        quantity,
        price_at_add_minor:
          existing?.price_at_add_minor ?? variant.price.amountMinor,
        added_at: existing?.added_at ?? new Date(),
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc
          .columns(["cart_id", "variant_id"])
          .doUpdateSet({ quantity, updated_at: new Date() }),
      )
      .executeTakeFirstOrThrow();
    return { token: session.token, cart: await this.view(session.cart) };
  }

  async updateItem(
    token: string | null,
    lineId: string,
    quantity: number,
  ): Promise<CartSession> {
    const session = await this.ensureSession(token);
    const parsed = this.parseLineId(lineId);
    if (!parsed || !Number.isInteger(quantity)) {
      fail(
        400,
        "INVALID_CART_LINE",
        "Invalid cart line",
        "The cart line and quantity are invalid.",
      );
    }
    const existing = await this.database
      .selectFrom("commerce.cart_items")
      .selectAll()
      .where("cart_id", "=", session.cart.id)
      .where("product_id", "=", parsed.productId)
      .where("variant_id", "=", parsed.variantId)
      .executeTakeFirst();
    if (!existing)
      fail(
        404,
        "CART_LINE_NOT_FOUND",
        "Cart line not found",
        "The requested cart line does not exist.",
      );
    if (quantity < 1) {
      await this.removeItemFor(
        session.cart.id,
        parsed.productId,
        parsed.variantId,
      );
    } else {
      const stock = availableQuantity(await this.stock(parsed.variantId));
      const upper =
        stock.quantity > 0 ? stock.quantity : MAX_CART_LINE_QUANTITY;
      await this.database
        .updateTable("commerce.cart_items")
        .set({ quantity: Math.min(quantity, upper), updated_at: new Date() })
        .where("cart_id", "=", session.cart.id)
        .where("product_id", "=", parsed.productId)
        .where("variant_id", "=", parsed.variantId)
        .executeTakeFirstOrThrow();
    }
    return { token: session.token, cart: await this.view(session.cart) };
  }

  async removeItem(token: string | null, lineId: string): Promise<CartSession> {
    const session = await this.ensureSession(token);
    const parsed = this.parseLineId(lineId);
    if (!parsed)
      fail(
        400,
        "INVALID_CART_LINE",
        "Invalid cart line",
        "The cart line identifier is invalid.",
      );
    await this.removeItemFor(
      session.cart.id,
      parsed.productId,
      parsed.variantId,
    );
    return { token: session.token, cart: await this.view(session.cart) };
  }

  async clearCart(token: string | null): Promise<CartSession> {
    const session = await this.ensureSession(token);
    await this.database
      .deleteFrom("commerce.cart_items")
      .where("cart_id", "=", session.cart.id)
      .execute();
    await this.database
      .updateTable("commerce.carts")
      .set({ promo_code: null, updated_at: new Date() })
      .where("id", "=", session.cart.id)
      .executeTakeFirstOrThrow();
    return { token: session.token, cart: await this.view(session.cart) };
  }

  async applyPromotion(
    token: string | null,
    code: string,
  ): Promise<CartSession> {
    const session = await this.ensureSession(token);
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(normalized)) {
      fail(
        400,
        "INVALID_PROMOTION_CODE",
        "Invalid promotion code",
        "The promotion code format is invalid.",
      );
    }
    const promotion = await this.database
      .selectFrom("commerce.promotions")
      .selectAll()
      .where("code", "=", normalized)
      .executeTakeFirst();
    if (!promotion)
      fail(
        404,
        "PROMOTION_NOT_FOUND",
        "Promotion not found",
        "The promotion code is not recognized.",
      );
    const reason = promotionReason(promotion, 0, new Date());
    if (
      reason === "inactive" ||
      reason === "expired" ||
      reason === "usage_limit"
    ) {
      fail(
        409,
        "PROMOTION_NOT_APPLICABLE",
        "Promotion not applicable",
        "This promotion is no longer available.",
      );
    }
    await this.database
      .updateTable("commerce.carts")
      .set({ promo_code: normalized, updated_at: new Date() })
      .where("id", "=", session.cart.id)
      .executeTakeFirstOrThrow();
    return {
      token: session.token,
      cart: await this.view({ ...session.cart, promo_code: normalized }),
    };
  }

  async removePromotion(token: string | null): Promise<CartSession> {
    const session = await this.ensureSession(token);
    await this.database
      .updateTable("commerce.carts")
      .set({ promo_code: null, updated_at: new Date() })
      .where("id", "=", session.cart.id)
      .executeTakeFirstOrThrow();
    return {
      token: session.token,
      cart: await this.view({ ...session.cart, promo_code: null }),
    };
  }

  private parseLineId(
    lineId: string,
  ): { productId: string; variantId: string } | null {
    const separator = lineId.indexOf(":");
    if (separator <= 0 || separator === lineId.length - 1) return null;
    return {
      productId: lineId.slice(0, separator),
      variantId: lineId.slice(separator + 1),
    };
  }

  private async removeItemFor(
    cartId: string,
    productId: string,
    variantId: string,
  ): Promise<void> {
    await this.database
      .deleteFrom("commerce.cart_items")
      .where("cart_id", "=", cartId)
      .where("product_id", "=", productId)
      .where("variant_id", "=", variantId)
      .execute();
  }

  private async stock(
    variantId: string,
  ): Promise<
    Selectable<DatabaseSchema["inventory.stock_balances"]> | undefined
  > {
    return this.database
      .selectFrom("inventory.stock_balances")
      .selectAll()
      .where("variant_id", "=", variantId)
      .executeTakeFirst();
  }

  private async ensureSession(
    token: string | null,
  ): Promise<{ token: string; cart: CartRow }> {
    const now = new Date();
    if (tokenIsUsable(token)) {
      const existing = await this.database
        .selectFrom("commerce.carts")
        .selectAll()
        .where("token_hash", "=", hashToken(token))
        .where("status", "=", "active")
        .executeTakeFirst();
      if (existing && new Date(existing.expires_at) > now) {
        const updated = await this.database
          .updateTable("commerce.carts")
          .set({
            last_accessed_at: now,
            expires_at: new Date(now.getTime() + CART_TTL_MS),
            updated_at: now,
          })
          .where("id", "=", existing.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return { token, cart: updated };
      }
      if (existing)
        await this.database
          .updateTable("commerce.carts")
          .set({ status: "expired", updated_at: now })
          .where("id", "=", existing.id)
          .executeTakeFirst();
    }
    const rawToken = randomBytes(32).toString("base64url");
    const cart = await this.database
      .insertInto("commerce.carts")
      .values({
        id: randomUUID(),
        token_hash: hashToken(rawToken),
        auth_user_id: null,
        status: "active",
        currency: "TND",
        promo_code: null,
        expires_at: new Date(now.getTime() + CART_TTL_MS),
        last_accessed_at: now,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { token: rawToken, cart };
  }

  private async view(cart: CartRow): Promise<CartView> {
    const rows = await this.database
      .selectFrom("commerce.cart_items")
      .selectAll()
      .where("cart_id", "=", cart.id)
      .orderBy("added_at", "asc")
      .orderBy("variant_id", "asc")
      .execute();
    const products = await this.products.getByIds(
      rows.map((row) => row.product_id),
    );
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const stockRows =
      rows.length === 0
        ? []
        : await this.database
            .selectFrom("inventory.stock_balances")
            .selectAll()
            .where(
              "variant_id",
              "in",
              rows.map((row) => row.variant_id),
            )
            .execute();
    const stockByVariant = new Map(
      stockRows.map((row) => [row.variant_id, row]),
    );
    const items = rows.map((row) =>
      this.line(
        row,
        productsById.get(row.product_id),
        stockByVariant.get(row.variant_id),
      ),
    );
    const purchasable = items.filter((item) => item.canPurchase);
    const subtotalMinor = purchasable.reduce(
      (sum, item) => sum + item.lineTotalMinor,
      0,
    );
    const promotion = await this.promotion(cart.promo_code, subtotalMinor);
    const discountMinor = promotion?.valid ? promotion.discountMinor : 0;
    const discountedSubtotal = Math.max(0, subtotalMinor - discountMinor);
    const requiresShippingQuote = purchasable.some(
      (item) =>
        item.shippingProfile === "volumineux" ||
        item.shippingProfile === "hors_norme",
    );
    const shippingMinor = requiresShippingQuote
      ? 0
      : discountedSubtotal <= 0
        ? 0
        : discountedSubtotal >= FREE_SHIPPING_THRESHOLD_MINOR
          ? 0
          : STANDARD_SHIPPING_FEE_MINOR;
    const totalEstimatedMinor = discountedSubtotal + shippingMinor;
    return {
      cartId: cart.id,
      currency: "TND",
      expiresAt: iso(cart.expires_at),
      items,
      itemCount: purchasable.reduce((sum, item) => sum + item.quantity, 0),
      lineCount: items.length,
      totals: {
        subtotalMinor,
        discountMinor,
        shippingMinor,
        totalEstimatedMinor,
        freeShippingThresholdMinor: FREE_SHIPPING_THRESHOLD_MINOR,
        amountUntilFreeShippingMinor: Math.max(
          0,
          FREE_SHIPPING_THRESHOLD_MINOR - discountedSubtotal,
        ),
        hasFreeShipping:
          !requiresShippingQuote &&
          discountedSubtotal > 0 &&
          shippingMinor === 0,
        requiresShippingQuote,
      },
      promotion,
      hasUnavailableItems: items.some((item) => !item.canPurchase),
      hasPriceChanges: items.some((item) => item.priceChanged),
    };
  }

  private line(
    row: CartItemRow,
    product: Product | undefined,
    stock: Selectable<DatabaseSchema["inventory.stock_balances"]> | undefined,
  ): CartLine {
    const lineId = `${row.product_id}:${row.variant_id}`;
    if (!product) {
      return {
        lineId,
        productId: row.product_id,
        productSlug: "",
        productName: "Article indisponible",
        productReference: "",
        variantId: row.variant_id,
        sku: "",
        quantity: row.quantity,
        unitPriceMinor: 0,
        compareAtPriceMinor: null,
        lineTotalMinor: 0,
        priceAtAddMinor: row.price_at_add_minor,
        priceChanged: false,
        imageUrl: "",
        imageAlt: "Article indisponible",
        category: "",
        colorLabel: null,
        widthCm: null,
        heightCm: null,
        selectedOptions: [],
        sellingUnitLabel: "",
        shippingProfile: null,
        availability: "out_of_stock",
        availableQuantity: 0,
        status: "product_missing",
        canPurchase: false,
      };
    }
    const variant = product.variants.find(
      (candidate) => candidate.id === row.variant_id,
    );
    if (!variant)
      return {
        ...this.line({ ...row, product_id: row.product_id }, undefined, stock),
        productName: product.name,
        productSlug: product.slug,
        productReference: product.reference,
        imageAlt: product.imageAlt,
        category: product.category,
        status: "variant_missing",
      };
    const available = availableQuantity(stock);
    const canPurchase = available.availability !== "out_of_stock";
    const quantity = canPurchase
      ? Math.min(row.quantity, Math.max(1, available.quantity))
      : row.quantity;
    const priceChanged = row.price_at_add_minor !== variant.price.amountMinor;
    const image = lineImage(product, variant);
    let status: CartLine["status"] = "available";
    if (!canPurchase) status = "out_of_stock";
    else if (quantity !== row.quantity) status = "quantity_adjusted";
    else if (priceChanged) status = "price_changed";
    else if (available.availability === "low_stock") status = "low_stock";
    const selectedOptions = [
      variant.curtainHeader
        ? { label: "Tête", value: variant.curtainHeader }
        : null,
      variant.lining ? { label: "Doublure", value: variant.lining } : null,
      variant.sizeLabel ? { label: "Taille", value: variant.sizeLabel } : null,
    ].filter(
      (option): option is { label: string; value: string } => option !== null,
    );
    const shippingProfile =
      typeof product.details.shippingProfile === "string"
        ? product.details.shippingProfile
        : null;
    return {
      lineId,
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      productReference: product.reference,
      variantId: variant.id,
      sku: variant.sku,
      quantity,
      unitPriceMinor: variant.price.amountMinor,
      compareAtPriceMinor: variant.compareAtPrice?.amountMinor ?? null,
      lineTotalMinor: variant.price.amountMinor * quantity,
      priceAtAddMinor: row.price_at_add_minor,
      priceChanged,
      imageUrl: image.url,
      imageAlt: image.alt,
      category: product.category,
      colorLabel:
        product.colors.find((color) => color.id === variant.colorId)?.name ??
        null,
      widthCm: variant.widthCm,
      heightCm: variant.heightCm,
      selectedOptions,
      sellingUnitLabel: product.sellingMode,
      shippingProfile,
      availability: available.availability,
      availableQuantity: available.quantity,
      status,
      canPurchase,
    };
  }

  private async promotion(
    code: string | null,
    subtotalMinor: number,
  ): Promise<CartPromotion | null> {
    if (!code) return null;
    const row = await this.database
      .selectFrom("commerce.promotions")
      .selectAll()
      .where("code", "=", code)
      .executeTakeFirst();
    if (!row)
      return {
        code,
        valid: false,
        discountMinor: 0,
        discountType: null,
        discountValue: null,
        reason: "inactive",
      };
    const reason = promotionReason(row, subtotalMinor, new Date());
    return {
      code,
      valid: reason === null,
      discountMinor:
        reason === null ? promotionDiscount(row, subtotalMinor) : 0,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      reason,
    };
  }
}
