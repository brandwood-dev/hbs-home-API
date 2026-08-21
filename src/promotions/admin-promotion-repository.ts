import type { Kysely, Selectable, Transaction } from "kysely";
import type { DatabaseSchema, PromotionTable } from "../database/schema.js";
import { AppError } from "../http/problem.js";

type DbExecutor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;
type PromotionRow = Selectable<PromotionTable>;
export type PromotionDiscountType = "percentage" | "fixed_amount";

export interface AdminPromotion {
  id: string;
  name: string;
  code: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  currency: "TND";
  minSubtotalMinor: number;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPromotionInput {
  name: string;
  code: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  minSubtotalMinor?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  maxRedemptions?: number | null;
  isActive?: boolean;
}

export type AdminPromotionPatch = Partial<AdminPromotionInput>;

export interface AdminPromotionRepository {
  list(input: {
    query?: string;
    isActive?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ items: readonly AdminPromotion[]; total: number }>;
  get(id: string): Promise<AdminPromotion>;
  create(input: AdminPromotionInput): Promise<AdminPromotion>;
  update(id: string, patch: AdminPromotionPatch): Promise<AdminPromotion>;
  archive(id: string): Promise<AdminPromotion>;
}

function fail(
  statusCode: number,
  code: string,
  title: string,
  detail: string,
): never {
  throw new AppError({ statusCode, code, title, detail });
}

function iso(value: Date | string | null): string | null {
  return value === null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
}

function requiredIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function parseDate(
  value: string | null | undefined,
  field: string,
): Date | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    fail(
      400,
      "INVALID_PROMOTION",
      "Invalid promotion",
      `${field} must be a valid ISO date.`,
    );
  }
  return date;
}

function validateWindow(startsAt: Date | null, endsAt: Date | null): void {
  if (startsAt && endsAt && endsAt <= startsAt) {
    fail(
      400,
      "INVALID_PROMOTION",
      "Invalid promotion",
      "endsAt must be after startsAt.",
    );
  }
}

function validateInput(
  input: AdminPromotionInput | AdminPromotionPatch,
  current?: PromotionRow,
): {
  name: string;
  code: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  minSubtotalMinor: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  isActive: boolean;
} {
  const name = (input.name ?? current?.name ?? "").trim();
  if (name.length < 1 || name.length > 160) {
    fail(
      400,
      "INVALID_PROMOTION",
      "Invalid promotion",
      "name must contain 1 to 160 characters.",
    );
  }
  const code = normalizeCode(input.code ?? current?.code ?? "");
  if (!/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(code)) {
    fail(
      400,
      "INVALID_PROMOTION",
      "Invalid promotion",
      "code must contain 3 to 64 uppercase characters.",
    );
  }
  const discountType = input.discountType ?? current?.discount_type;
  if (discountType !== "percentage" && discountType !== "fixed_amount") {
    fail(
      400,
      "INVALID_PROMOTION",
      "Invalid promotion",
      "discountType is not supported.",
    );
  }
  const discountValue = input.discountValue ?? current?.discount_value ?? 0;
  if (
    !Number.isInteger(discountValue) ||
    discountValue < 1 ||
    (discountType === "percentage" && discountValue > 100)
  ) {
    fail(
      400,
      "INVALID_PROMOTION",
      "Invalid promotion",
      "discountValue is outside the allowed range.",
    );
  }
  const minSubtotalMinor =
    input.minSubtotalMinor ?? current?.min_subtotal_minor ?? 0;
  if (!Number.isInteger(minSubtotalMinor) || minSubtotalMinor < 0) {
    fail(
      400,
      "INVALID_PROMOTION",
      "Invalid promotion",
      "minSubtotalMinor must be a non-negative integer.",
    );
  }
  const startsAt = parseDate(
    input.startsAt === undefined
      ? current
        ? iso(current.starts_at)
        : null
      : input.startsAt,
    "startsAt",
  );
  const endsAt = parseDate(
    input.endsAt === undefined
      ? current
        ? iso(current.ends_at)
        : null
      : input.endsAt,
    "endsAt",
  );
  validateWindow(startsAt, endsAt);
  const maxRedemptions =
    input.maxRedemptions === undefined
      ? (current?.max_redemptions ?? null)
      : input.maxRedemptions;
  if (
    maxRedemptions !== null &&
    (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)
  ) {
    fail(
      400,
      "INVALID_PROMOTION",
      "Invalid promotion",
      "maxRedemptions must be null or a positive integer.",
    );
  }
  const redeemedCount = current?.redeemed_count ?? 0;
  if (maxRedemptions !== null && redeemedCount > maxRedemptions) {
    fail(
      400,
      "INVALID_PROMOTION",
      "Invalid promotion",
      "maxRedemptions cannot be below redeemedCount.",
    );
  }
  return {
    name,
    code,
    discountType,
    discountValue,
    minSubtotalMinor,
    startsAt,
    endsAt,
    maxRedemptions,
    isActive: input.isActive ?? current?.is_active ?? true,
  };
}

function record(row: PromotionRow): AdminPromotion {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    currency: row.currency,
    minSubtotalMinor: row.min_subtotal_minor,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    maxRedemptions: row.max_redemptions,
    redeemedCount: row.redeemed_count,
    isActive: row.is_active,
    createdAt: requiredIso(row.created_at),
    updatedAt: requiredIso(row.updated_at),
  };
}

async function assertCodeAvailable(
  database: DbExecutor,
  code: string,
  id?: string,
): Promise<void> {
  const query = database
    .selectFrom("commerce.promotions")
    .select("id")
    .where("code", "=", code);
  const existing =
    id === undefined
      ? await query.executeTakeFirst()
      : await query.where("id", "!=", id).executeTakeFirst();
  if (existing) {
    fail(
      409,
      "PROMOTION_CODE_CONFLICT",
      "Promotion conflict",
      "A promotion with this code already exists.",
    );
  }
}

export class PostgresAdminPromotionRepository implements AdminPromotionRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async list(input: {
    query?: string;
    isActive?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ items: readonly AdminPromotion[]; total: number }> {
    let filtered = this.database.selectFrom("commerce.promotions");
    if (input.query?.trim()) {
      const query = `%${input.query.trim().replace(/[%_]/g, "\\$&")}%`;
      filtered = filtered.where((eb) =>
        eb.or([eb("name", "ilike", query), eb("code", "ilike", query)]),
      );
    }
    if (input.isActive !== undefined)
      filtered = filtered.where("is_active", "=", input.isActive);
    const count = await filtered
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    const rows = await filtered
      .selectAll()
      .orderBy("updated_at", "desc")
      .limit(input.limit)
      .offset(input.offset)
      .execute();
    return {
      total: Number.parseInt(String(count.count), 10),
      items: rows.map(record),
    };
  }

  async get(id: string): Promise<AdminPromotion> {
    const row = await this.database
      .selectFrom("commerce.promotions")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row)
      fail(
        404,
        "PROMOTION_NOT_FOUND",
        "Promotion not found",
        "The requested promotion does not exist.",
      );
    return record(row);
  }

  async create(input: AdminPromotionInput): Promise<AdminPromotion> {
    const values = validateInput(input);
    return this.database.transaction().execute(async (trx) => {
      await assertCodeAvailable(trx, values.code);
      const row = await trx
        .insertInto("commerce.promotions")
        .values({
          name: values.name,
          code: values.code,
          discount_type: values.discountType,
          discount_value: values.discountValue,
          currency: "TND",
          min_subtotal_minor: values.minSubtotalMinor,
          starts_at: values.startsAt,
          ends_at: values.endsAt,
          max_redemptions: values.maxRedemptions,
          redeemed_count: 0,
          is_active: values.isActive,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return record(row);
    });
  }

  async update(
    id: string,
    patch: AdminPromotionPatch,
  ): Promise<AdminPromotion> {
    return this.database.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom("commerce.promotions")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      if (!current)
        fail(
          404,
          "PROMOTION_NOT_FOUND",
          "Promotion not found",
          "The requested promotion does not exist.",
        );
      const values = validateInput(patch, current);
      if (values.code !== current.code)
        await assertCodeAvailable(trx, values.code, id);
      const row = await trx
        .updateTable("commerce.promotions")
        .set({
          name: values.name,
          code: values.code,
          discount_type: values.discountType,
          discount_value: values.discountValue,
          min_subtotal_minor: values.minSubtotalMinor,
          starts_at: values.startsAt,
          ends_at: values.endsAt,
          max_redemptions: values.maxRedemptions,
          is_active: values.isActive,
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return record(row);
    });
  }

  async archive(id: string): Promise<AdminPromotion> {
    const row = await this.database
      .updateTable("commerce.promotions")
      .set({ is_active: false })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
    if (!row)
      fail(
        404,
        "PROMOTION_NOT_FOUND",
        "Promotion not found",
        "The requested promotion does not exist.",
      );
    return record(row);
  }
}
