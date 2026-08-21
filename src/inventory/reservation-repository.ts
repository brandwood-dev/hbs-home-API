import { createHash, randomUUID } from "node:crypto";
import { sql, type Kysely, type Selectable, type Transaction } from "kysely";
import type {
  DatabaseSchema,
  InventoryAvailability,
  InventoryReservationTable,
  ReservationStatus,
} from "../database/schema.js";
import { AppError } from "../http/problem.js";
import { syncVariantPayload } from "./inventory-payload.js";

type DbExecutor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;
type ReservationRow = Selectable<InventoryReservationTable>;
type StockBalanceRow = Selectable<DatabaseSchema["inventory.stock_balances"]>;

export type ReservationReleaseReason = "cancelled" | "expired" | "manual";

export interface ReservationItemInput {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface ReserveStockInput {
  reservationKey: string;
  orderId?: string;
  items: readonly ReservationItemInput[];
  expiresAt: Date;
  actorUserId: string | null;
}

export interface StockReservationItem {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface StockReservation {
  id: string;
  reservationKey: string;
  orderId: string | null;
  status: ReservationStatus;
  expiresAt: string;
  releasedAt: string | null;
  releaseReason: string | null;
  convertedAt: string | null;
  createdAt: string;
  items: readonly StockReservationItem[];
}

export interface ReservationExpiryResult {
  releasedCount: number;
  reservationIds: readonly string[];
}

export interface ReservationRepository {
  reserve(input: ReserveStockInput): Promise<StockReservation>;
  get(reservationId: string): Promise<StockReservation>;
  release(
    reservationId: string,
    reason: ReservationReleaseReason,
  ): Promise<StockReservation>;
  expire(now: Date, limit: number): Promise<ReservationExpiryResult>;
}

function fail(
  statusCode: number,
  code: string,
  title: string,
  detail: string,
): never {
  throw new AppError({ statusCode, code, title, detail });
}

function reservationFingerprint(input: {
  orderId: string | null;
  items: readonly ReservationItemInput[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        orderId: input.orderId ?? null,
        items: [...input.items].sort((left, right) =>
          left.variantId.localeCompare(right.variantId),
        ),
      }),
    )
    .digest("hex");
}

function normalizeItems(
  items: readonly ReservationItemInput[],
): readonly ReservationItemInput[] {
  if (items.length === 0 || items.length > 50) {
    fail(
      400,
      "INVALID_RESERVATION_ITEMS",
      "Invalid reservation items",
      "A reservation must contain between one and fifty variants.",
    );
  }
  const seen = new Set<string>();
  return [...items]
    .sort((left, right) => left.variantId.localeCompare(right.variantId))
    .map((item) => {
      if (
        !item.productId.trim() ||
        !item.variantId.trim() ||
        seen.has(item.variantId) ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        fail(
          400,
          "INVALID_RESERVATION_ITEMS",
          "Invalid reservation items",
          "Each reservation item needs a unique product, variant and positive integer quantity.",
        );
      }
      seen.add(item.variantId);
      return {
        productId: item.productId.trim(),
        variantId: item.variantId.trim(),
        quantity: item.quantity,
      };
    });
}

function availabilityFor(
  availableQuantity: number,
  threshold: number,
  current: InventoryAvailability,
): InventoryAvailability {
  if (current === "made_to_order") return current;
  if (availableQuantity <= 0) return "out_of_stock";
  if (availableQuantity <= threshold) return "low_stock";
  return "in_stock";
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function requiredIso(value: Date): string {
  return value.toISOString();
}

function mapReservation(
  row: ReservationRow,
  items: readonly StockReservationItem[],
): StockReservation {
  return {
    id: row.id,
    reservationKey: row.reservation_key,
    orderId: row.order_id,
    status: row.status,
    expiresAt: requiredIso(row.expires_at),
    releasedAt: toIso(row.released_at),
    releaseReason: row.release_reason,
    convertedAt: toIso(row.converted_at),
    createdAt: requiredIso(row.created_at),
    items,
  };
}

export class PostgresReservationRepository implements ReservationRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async reserve(input: ReserveStockInput): Promise<StockReservation> {
    const reservationKey = input.reservationKey.trim();
    if (!reservationKey || reservationKey.length > 160) {
      fail(
        400,
        "INVALID_RESERVATION_KEY",
        "Invalid reservation key",
        "The reservation key must contain between one and 160 characters.",
      );
    }
    if (!(input.expiresAt instanceof Date) || input.expiresAt <= new Date()) {
      fail(
        400,
        "INVALID_RESERVATION_EXPIRY",
        "Invalid reservation expiry",
        "The reservation expiry must be in the future.",
      );
    }
    const items = normalizeItems(input.items);
    const fingerprint = reservationFingerprint({
      orderId: input.orderId ?? null,
      items,
    });

    return this.database.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtextextended(${reservationKey}, 0))`.execute(
        trx,
      );
      const existing = await trx
        .selectFrom("inventory.reservations")
        .selectAll()
        .where("reservation_key", "=", reservationKey)
        .executeTakeFirst();
      if (existing) {
        if (existing.request_fingerprint !== fingerprint) {
          fail(
            409,
            "IDEMPOTENCY_KEY_CONFLICT",
            "Reservation key conflict",
            "This reservation key was already used for different items.",
          );
        }
        return this.getWith(trx, existing.id);
      }

      const variantIds = items.map((item) => item.variantId);
      const balances = await trx
        .selectFrom("inventory.stock_balances")
        .selectAll()
        .where("variant_id", "in", variantIds)
        .orderBy("variant_id", "asc")
        .forUpdate()
        .execute();
      const balancesByVariant = new Map(
        balances.map((balance) => [balance.variant_id, balance]),
      );
      for (const item of items) {
        const balance = balancesByVariant.get(item.variantId);
        if (balance?.product_id !== item.productId) {
          fail(
            404,
            "INVENTORY_VARIANT_NOT_FOUND",
            "Variant not found",
            "The requested variant does not have an inventory balance.",
          );
        }
        if (balance.availability === "made_to_order") {
          fail(
            409,
            "MADE_TO_ORDER_NOT_RESERVABLE",
            "Variant is made to order",
            "Made-to-order variants do not reserve stock.",
          );
        }
        const availableQuantity = balance.on_hand - balance.reserved;
        if (availableQuantity < item.quantity) {
          fail(
            409,
            "INSUFFICIENT_AVAILABLE_STOCK",
            "Insufficient available stock",
            `Only ${String(Math.max(0, availableQuantity))} unit(s) are available for variant ${item.variantId}.`,
          );
        }
      }

      const reservationId = randomUUID();
      await trx
        .insertInto("inventory.reservations")
        .values({
          id: reservationId,
          reservation_key: reservationKey,
          order_id: input.orderId?.trim() ?? null,
          status: "active",
          expires_at: input.expiresAt,
          released_at: null,
          release_reason: null,
          converted_at: null,
          request_fingerprint: fingerprint,
          actor_user_id: input.actorUserId,
        })
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("inventory.reservation_items")
        .values(
          items.map((item) => ({
            reservation_id: reservationId,
            variant_id: item.variantId,
            product_id: item.productId,
            quantity: item.quantity,
          })),
        )
        .execute();

      for (const item of items) {
        const balance = balancesByVariant.get(item.variantId);
        if (!balance) throw new Error("Inventory balance disappeared.");
        await this.applyReservationDelta(
          trx,
          reservationId,
          item,
          balance,
          1,
          input.actorUserId,
          input.orderId?.trim() ?? null,
          fingerprint,
        );
      }
      return this.getWith(trx, reservationId);
    });
  }

  async get(reservationId: string): Promise<StockReservation> {
    return this.getWith(this.database, reservationId);
  }

  async release(
    reservationId: string,
    reason: ReservationReleaseReason,
  ): Promise<StockReservation> {
    return this.database.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtextextended(${reservationId}, 0))`.execute(
        trx,
      );
      const reservation = await trx
        .selectFrom("inventory.reservations")
        .selectAll()
        .where("id", "=", reservationId)
        .forUpdate()
        .executeTakeFirst();
      if (!reservation) {
        fail(
          404,
          "RESERVATION_NOT_FOUND",
          "Reservation not found",
          "The requested stock reservation does not exist.",
        );
      }
      if (reservation.status !== "active")
        return this.getWith(trx, reservationId);
      await this.releaseActiveReservation(trx, reservation, reason, new Date());
      return this.getWith(trx, reservationId);
    });
  }

  async expire(now: Date, limit: number): Promise<ReservationExpiryResult> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      fail(
        400,
        "INVALID_EXPIRY_LIMIT",
        "Invalid expiry limit",
        "The expiry limit must be an integer between one and one hundred.",
      );
    }
    return this.database.transaction().execute(async (trx) => {
      const candidates = await trx
        .selectFrom("inventory.reservations")
        .selectAll()
        .where("status", "=", "active")
        .where("expires_at", "<=", now)
        .orderBy("expires_at", "asc")
        .orderBy("id", "asc")
        .limit(limit)
        .forUpdate()
        .skipLocked()
        .execute();
      const reservationIds: string[] = [];
      for (const reservation of candidates) {
        await this.releaseActiveReservation(trx, reservation, "expired", now);
        reservationIds.push(reservation.id);
      }
      return { releasedCount: reservationIds.length, reservationIds };
    });
  }

  private async getWith(
    executor: DbExecutor,
    reservationId: string,
  ): Promise<StockReservation> {
    const row = await executor
      .selectFrom("inventory.reservations")
      .selectAll()
      .where("id", "=", reservationId)
      .executeTakeFirst();
    if (!row) {
      fail(
        404,
        "RESERVATION_NOT_FOUND",
        "Reservation not found",
        "The requested stock reservation does not exist.",
      );
    }
    const items = await executor
      .selectFrom("inventory.reservation_items")
      .select(["product_id", "variant_id", "quantity"])
      .where("reservation_id", "=", reservationId)
      .orderBy("variant_id", "asc")
      .execute();
    return mapReservation(
      row,
      items.map((item) => ({
        productId: item.product_id,
        variantId: item.variant_id,
        quantity: item.quantity,
      })),
    );
  }

  private async applyReservationDelta(
    trx: Transaction<DatabaseSchema>,
    reservationId: string,
    item: ReservationItemInput,
    balance: StockBalanceRow,
    direction: 1 | -1,
    actorUserId: string | null,
    orderId: string | null,
    requestFingerprint: string,
  ): Promise<void> {
    const reservedDelta = item.quantity * direction;
    const nextReserved = balance.reserved + reservedDelta;
    if (nextReserved < 0 || nextReserved > balance.on_hand) {
      fail(
        409,
        "RESERVATION_STATE_CONFLICT",
        "Reservation state conflict",
        "The reservation cannot change the current reserved stock safely.",
      );
    }
    const nextAvailable = balance.on_hand - nextReserved;
    const availability = availabilityFor(
      nextAvailable,
      balance.low_stock_threshold,
      balance.availability,
    );
    await trx
      .updateTable("inventory.stock_balances")
      .set({ reserved: nextReserved, availability })
      .where("variant_id", "=", item.variantId)
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("inventory.stock_movements")
      .values({
        id: randomUUID(),
        variant_id: item.variantId,
        product_id: item.productId,
        movement_type: direction === 1 ? "reservation" : "reservation_release",
        quantity: item.quantity,
        on_hand_delta: 0,
        reserved_delta: reservedDelta,
        previous_on_hand: balance.on_hand,
        resulting_on_hand: balance.on_hand,
        previous_reserved: balance.reserved,
        resulting_reserved: nextReserved,
        reason: direction === 1 ? "reservation" : "reservation_release",
        note: null,
        operation_key: `reservation:${reservationId}:${item.variantId}:${direction === 1 ? "hold" : "release"}`,
        request_fingerprint: requestFingerprint,
        order_id: orderId,
        actor_user_id: actorUserId,
      })
      .executeTakeFirstOrThrow();
    await syncVariantPayload(trx, item.variantId, {
      stock: balance.on_hand,
      availableQuantity: nextAvailable,
      lowStockThreshold: balance.low_stock_threshold,
      availability,
      trackInventory: balance.track_inventory,
    });
  }

  private async releaseActiveReservation(
    trx: Transaction<DatabaseSchema>,
    reservation: ReservationRow,
    reason: ReservationReleaseReason,
    releasedAt: Date,
  ): Promise<void> {
    const items = await trx
      .selectFrom("inventory.reservation_items")
      .selectAll()
      .where("reservation_id", "=", reservation.id)
      .orderBy("variant_id", "asc")
      .execute();
    const balances = await trx
      .selectFrom("inventory.stock_balances")
      .selectAll()
      .where(
        "variant_id",
        "in",
        items.map((item) => item.variant_id),
      )
      .orderBy("variant_id", "asc")
      .forUpdate()
      .execute();
    const balancesByVariant = new Map(
      balances.map((balance) => [balance.variant_id, balance]),
    );
    for (const item of items) {
      const balance = balancesByVariant.get(item.variant_id);
      if (balance?.product_id !== item.product_id) {
        fail(
          500,
          "RESERVATION_STATE_CONFLICT",
          "Reservation state conflict",
          "A reservation item no longer matches its inventory balance.",
        );
      }
      await this.applyReservationDelta(
        trx,
        reservation.id,
        {
          productId: item.product_id,
          variantId: item.variant_id,
          quantity: item.quantity,
        },
        balance,
        -1,
        reservation.actor_user_id,
        reservation.order_id,
        reservation.request_fingerprint,
      );
    }
    await trx
      .updateTable("inventory.reservations")
      .set({
        status: reason === "expired" ? "expired" : "released",
        released_at: releasedAt,
        release_reason: reason,
      })
      .where("id", "=", reservation.id)
      .executeTakeFirstOrThrow();
  }
}
