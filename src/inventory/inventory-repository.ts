import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type {
  DatabaseSchema,
  InventoryAvailability,
  StockMovementType,
} from "../database/schema.js";
import { AppError } from "../http/problem.js";

type DbExecutor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

export type StockAdjustmentMode = "increase" | "decrease" | "set";
export type StockReason =
  | "purchase"
  | "sale_correction"
  | "customer_return"
  | "damaged"
  | "inventory_correction"
  | "manual_adjustment"
  | "other";

export interface InventoryVariant {
  id: string;
  sku: string;
  colorId: string;
  colorLabel: string;
  widthCm: number;
  heightCm: number;
  curtainHeader: string;
  eyeletColor?: string;
  lining?: string;
  priceMinor: number;
  compareAtPriceMinor?: number;
  stock: number;
  reserved: number;
  lowStockThreshold: number;
  availability: InventoryAvailability;
  imageUrl?: string;
  isActive: boolean;
  isDefault: boolean;
  options: Record<string, string | number>;
  packQuantity?: number;
  trackInventory: boolean;
}

export interface InventoryRow {
  productId: string;
  productName: string;
  categoryId: string;
  variant: InventoryVariant;
  updatedAt: string;
}

export interface StockAdjustmentInput {
  productId: string;
  variantId: string;
  type: StockAdjustmentMode;
  quantity: number;
  reason: StockReason;
  note?: string;
  lowStockThreshold?: number;
  availability?: InventoryAvailability;
  operationKey: string;
  actorUserId: string;
}

export interface StockSettingsInput {
  productId: string;
  variantId: string;
  lowStockThreshold: number;
  availability?: InventoryAvailability;
}

export interface StockMovement {
  id: string;
  variantId: string;
  productId: string;
  type: StockAdjustmentMode;
  quantity: number;
  reason: string;
  note?: string;
  previousStock?: number;
  resultingStock?: number;
  createdAt: string;
  userId?: string;
}

export interface InventoryRepository {
  list(): Promise<readonly InventoryRow[]>;
  movements(variantId?: string): Promise<readonly StockMovement[]>;
  adjust(input: StockAdjustmentInput): Promise<InventoryRow>;
  updateSettings(input: StockSettingsInput): Promise<InventoryRow>;
}

interface InventoryJoinedRow {
  variantId: string;
  productId: string;
  productName: string;
  categoryId: string | null;
  sku: string;
  title: string | null;
  priceAmountMinor: number;
  compareAtPriceAmountMinor: number | null;
  status: "draft" | "active" | "archived";
  options: Record<string, unknown>;
  payload: Record<string, unknown>;
  isDefault: boolean;
  stock: number;
  reserved: number;
  lowStockThreshold: number;
  trackInventory: boolean;
  availability: InventoryAvailability;
  updatedAt: Date;
}

function fail(
  statusCode: number,
  code: string,
  title: string,
  detail: string,
): never {
  throw new AppError({ statusCode, code, title, detail });
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return fallback;
}

function availabilityFor(
  stock: number,
  threshold: number,
  current: InventoryAvailability,
  requested?: InventoryAvailability,
): InventoryAvailability {
  if (requested) return requested;
  if (current === "made_to_order") return current;
  if (stock <= 0) return "out_of_stock";
  if (stock <= threshold) return "low_stock";
  return "in_stock";
}

function movementTypeFor(
  mode: StockAdjustmentMode,
  delta: number,
): StockMovementType {
  if (mode === "set") return "correction";
  return delta >= 0 ? "adjustment_in" : "adjustment_out";
}

function movementMode(type: StockMovementType): StockAdjustmentMode {
  if (type === "adjustment_in" || type === "return") return "increase";
  if (type === "adjustment_out" || type === "damage" || type === "sale")
    return "decrease";
  return "set";
}

function mapVariant(row: InventoryJoinedRow): InventoryVariant {
  const options = object(row.options);
  const payload = object(row.payload);
  const merged = { ...options, ...payload };
  const toOptions: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === "string" || typeof value === "number")
      toOptions[key] = value;
  }
  const variant: InventoryVariant = {
    id: row.variantId,
    sku: row.sku,
    colorId: stringValue(merged.colorId) ?? "",
    colorLabel: stringValue(merged.colorLabel) ?? "",
    widthCm: numberValue(merged.widthCm ?? merged.width, 0),
    heightCm: numberValue(merged.heightCm ?? merged.height, 0),
    curtainHeader: stringValue(merged.curtainHeader) ?? row.title ?? "",
    priceMinor: row.priceAmountMinor,
    stock: row.stock,
    reserved: row.reserved,
    lowStockThreshold: row.lowStockThreshold,
    availability: row.availability,
    isActive: row.status !== "archived",
    isDefault: row.isDefault,
    options: toOptions,
    trackInventory: row.trackInventory,
  };
  const optionalStrings = [
    ["eyeletColor", "eyeletColor"],
    ["lining", "lining"],
    ["imageUrl", "imageUrl"],
  ] as const;
  for (const [key, source] of optionalStrings) {
    const value = stringValue(merged[source]);
    if (value) variant[key] = value;
  }
  if (row.compareAtPriceAmountMinor !== null) {
    variant.compareAtPriceMinor = row.compareAtPriceAmountMinor;
  }
  const packQuantity = numberValue(merged.packQuantity, Number.NaN);
  if (Number.isFinite(packQuantity)) variant.packQuantity = packQuantity;
  return variant;
}

function mapJoined(row: InventoryJoinedRow): InventoryRow {
  return {
    productId: row.productId,
    productName: row.productName,
    categoryId: row.categoryId ?? "",
    variant: mapVariant(row),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class PostgresInventoryRepository implements InventoryRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async list(): Promise<readonly InventoryRow[]> {
    return this.listWith(this.database);
  }

  async movements(variantId?: string): Promise<readonly StockMovement[]> {
    let query = this.database
      .selectFrom("inventory.stock_movements")
      .selectAll()
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(200);
    if (variantId) query = query.where("variant_id", "=", variantId);
    const rows = await query.execute();
    return rows.map((row) => ({
      id: row.id,
      variantId: row.variant_id,
      productId: row.product_id,
      type: movementMode(row.movement_type),
      quantity: row.quantity,
      reason: row.reason,
      ...(row.note ? { note: row.note } : {}),
      previousStock: row.previous_on_hand,
      resultingStock: row.resulting_on_hand,
      createdAt: row.created_at.toISOString(),
      ...(row.actor_user_id ? { userId: row.actor_user_id } : {}),
    }));
  }

  async adjust(input: StockAdjustmentInput): Promise<InventoryRow> {
    return this.database.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom("inventory.stock_movements")
        .select(["variant_id"])
        .where("operation_key", "=", input.operationKey)
        .executeTakeFirst();
      if (existing && existing.variant_id !== input.variantId) {
        fail(
          409,
          "IDEMPOTENCY_KEY_CONFLICT",
          "Idempotency key conflict",
          "This idempotency key was already used for another variant.",
        );
      }

      const current = await trx
        .selectFrom("inventory.stock_balances")
        .selectAll()
        .where("variant_id", "=", input.variantId)
        .forUpdate()
        .executeTakeFirst();
      if (current?.product_id !== input.productId) {
        fail(
          404,
          "INVENTORY_VARIANT_NOT_FOUND",
          "Variant not found",
          "The requested variant does not have an inventory balance.",
        );
      }

      if (existing) return this.getByVariant(trx, input.variantId);
      if (!Number.isInteger(input.quantity) || input.quantity < 0) {
        fail(
          400,
          "INVALID_STOCK_QUANTITY",
          "Invalid quantity",
          "Stock quantity must be a non-negative integer.",
        );
      }
      if (input.type !== "set" && input.quantity === 0) {
        fail(
          400,
          "INVALID_STOCK_QUANTITY",
          "Invalid quantity",
          "An increase or decrease must contain at least one unit.",
        );
      }
      const nextOnHand =
        input.type === "set"
          ? input.quantity
          : current.on_hand +
            (input.type === "increase" ? input.quantity : -input.quantity);
      if (nextOnHand < current.reserved) {
        fail(
          409,
          "STOCK_BELOW_RESERVED",
          "Stock adjustment rejected",
          "On-hand stock cannot be lower than the quantity already reserved.",
        );
      }
      if (nextOnHand < 0) {
        fail(
          409,
          "INSUFFICIENT_STOCK",
          "Insufficient stock",
          "The adjustment would make stock negative.",
        );
      }

      const threshold = input.lowStockThreshold ?? current.low_stock_threshold;
      if (!Number.isInteger(threshold) || threshold < 0) {
        fail(
          400,
          "INVALID_LOW_STOCK_THRESHOLD",
          "Invalid threshold",
          "The low-stock threshold must be a non-negative integer.",
        );
      }
      const availability = availabilityFor(
        nextOnHand,
        threshold,
        current.availability,
        input.availability,
      );
      const delta = nextOnHand - current.on_hand;
      if (delta !== 0) {
        await trx
          .updateTable("inventory.stock_balances")
          .set({
            on_hand: nextOnHand,
            low_stock_threshold: threshold,
            availability,
          })
          .where("variant_id", "=", input.variantId)
          .executeTakeFirstOrThrow();
        await trx
          .insertInto("inventory.stock_movements")
          .values({
            id: randomUUID(),
            variant_id: input.variantId,
            product_id: input.productId,
            movement_type: movementTypeFor(input.type, delta),
            quantity: Math.abs(delta),
            on_hand_delta: delta,
            reserved_delta: 0,
            previous_on_hand: current.on_hand,
            resulting_on_hand: nextOnHand,
            previous_reserved: current.reserved,
            resulting_reserved: current.reserved,
            reason: input.reason,
            note: input.note ?? null,
            operation_key: input.operationKey,
            order_id: null,
            actor_user_id: input.actorUserId,
          })
          .executeTakeFirstOrThrow();
        await this.syncVariantPayload(trx, input.variantId, {
          stock: nextOnHand,
          lowStockThreshold: threshold,
          availability,
          trackInventory: current.track_inventory,
        });
      } else if (
        threshold !== current.low_stock_threshold ||
        availability !== current.availability
      ) {
        await trx
          .updateTable("inventory.stock_balances")
          .set({ low_stock_threshold: threshold, availability })
          .where("variant_id", "=", input.variantId)
          .executeTakeFirstOrThrow();
        await this.syncVariantPayload(trx, input.variantId, {
          stock: current.on_hand,
          lowStockThreshold: threshold,
          availability,
          trackInventory: current.track_inventory,
        });
      }
      return this.getByVariant(trx, input.variantId);
    });
  }

  async updateSettings(input: StockSettingsInput): Promise<InventoryRow> {
    return this.database.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom("inventory.stock_balances")
        .selectAll()
        .where("variant_id", "=", input.variantId)
        .forUpdate()
        .executeTakeFirst();
      if (current?.product_id !== input.productId) {
        fail(
          404,
          "INVENTORY_VARIANT_NOT_FOUND",
          "Variant not found",
          "The requested variant does not have an inventory balance.",
        );
      }
      if (
        !Number.isInteger(input.lowStockThreshold) ||
        input.lowStockThreshold < 0
      ) {
        fail(
          400,
          "INVALID_LOW_STOCK_THRESHOLD",
          "Invalid threshold",
          "The low-stock threshold must be a non-negative integer.",
        );
      }
      const availability = availabilityFor(
        current.on_hand,
        input.lowStockThreshold,
        current.availability,
        input.availability,
      );
      await trx
        .updateTable("inventory.stock_balances")
        .set({ low_stock_threshold: input.lowStockThreshold, availability })
        .where("variant_id", "=", input.variantId)
        .executeTakeFirstOrThrow();
      await this.syncVariantPayload(trx, input.variantId, {
        stock: current.on_hand,
        lowStockThreshold: input.lowStockThreshold,
        availability,
        trackInventory: current.track_inventory,
      });
      return this.getByVariant(trx, input.variantId);
    });
  }

  private async listWith(
    executor: DbExecutor,
  ): Promise<readonly InventoryRow[]> {
    const rows = await executor
      .selectFrom("inventory.stock_balances as balance")
      .innerJoin(
        "catalog.product_variants as variant",
        "variant.id",
        "balance.variant_id",
      )
      .innerJoin(
        "catalog.products as product",
        "product.id",
        "balance.product_id",
      )
      .select([
        "balance.variant_id as variantId",
        "balance.product_id as productId",
        "product.name as productName",
        "product.category_id as categoryId",
        "variant.sku as sku",
        "variant.title as title",
        "variant.price_amount_minor as priceAmountMinor",
        "variant.compare_at_price_amount_minor as compareAtPriceAmountMinor",
        "variant.status as status",
        "variant.options as options",
        "variant.payload as payload",
        "variant.is_default as isDefault",
        "balance.on_hand as stock",
        "balance.reserved as reserved",
        "balance.low_stock_threshold as lowStockThreshold",
        "balance.track_inventory as trackInventory",
        "balance.availability as availability",
        "balance.updated_at as updatedAt",
      ])
      .orderBy("product.name")
      .orderBy("variant.sort_order")
      .orderBy("variant.id")
      .execute();
    return rows.map((row) => mapJoined(row));
  }

  private async getByVariant(
    executor: DbExecutor,
    variantId: string,
  ): Promise<InventoryRow> {
    const rows = await this.listWith(executor);
    const row = rows.find((item) => item.variant.id === variantId);
    if (!row) {
      fail(
        404,
        "INVENTORY_VARIANT_NOT_FOUND",
        "Variant not found",
        "The requested variant does not have an inventory balance.",
      );
    }
    return row;
  }

  private async syncVariantPayload(
    executor: DbExecutor,
    variantId: string,
    fields: {
      stock: number;
      lowStockThreshold: number;
      availability: InventoryAvailability;
      trackInventory: boolean;
    },
  ): Promise<void> {
    const variant = await executor
      .selectFrom("catalog.product_variants")
      .select(["product_id", "payload"])
      .where("id", "=", variantId)
      .executeTakeFirstOrThrow();
    await executor
      .updateTable("catalog.product_variants")
      .set({
        payload: {
          ...object(variant.payload),
          ...fields,
        },
      })
      .where("id", "=", variantId)
      .executeTakeFirstOrThrow();

    const product = await executor
      .selectFrom("catalog.products")
      .select(["id", "product"])
      .where("id", "=", variant.product_id)
      .executeTakeFirstOrThrow();
    const payload = object(product.product);
    const variants = Array.isArray(payload.variants) ? payload.variants : [];
    const nextVariants = variants.map((entry) => {
      const item = object(entry);
      return item.id === variantId ? { ...item, ...fields } : item;
    });
    await executor
      .updateTable("catalog.products")
      .set({ product: { ...payload, variants: nextVariants } })
      .where("id", "=", product.id)
      .executeTakeFirstOrThrow();
  }
}
