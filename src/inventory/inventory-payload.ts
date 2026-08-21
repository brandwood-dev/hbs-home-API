import type { Kysely, Transaction } from "kysely";
import type {
  DatabaseSchema,
  InventoryAvailability,
} from "../database/schema.js";

type DbExecutor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface InventoryPayloadFields {
  stock: number;
  availableQuantity: number;
  lowStockThreshold: number;
  availability: InventoryAvailability;
  trackInventory: boolean;
}

/**
 * Keeps the denormalized public catalog payload aligned with the authoritative
 * inventory balance inside the same database transaction.
 */
export async function syncVariantPayload(
  executor: DbExecutor,
  variantId: string,
  fields: InventoryPayloadFields,
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
