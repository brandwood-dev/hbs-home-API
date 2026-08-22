import { createHash, randomBytes } from "node:crypto";
import type { Kysely } from "kysely";
import type { DatabaseSchema } from "../database/schema.js";
import { AppError } from "../http/problem.js";
import {
  PostgresProductRepository,
  type Product,
} from "../catalog/product-repository.js";

export const FAVORITES_MAX_ITEMS = 200;
export const FAVORITES_TTL_MS = 365 * 24 * 60 * 60 * 1_000;

export interface FavoriteItem {
  productId: string;
  addedAt: string;
  product: Product;
  isAvailable: boolean;
}

export interface FavoritesView {
  items: readonly FavoriteItem[];
  removedProductIds: readonly string[];
  count: number;
}

export interface FavoritesSession {
  token: string;
  favorites: FavoritesView;
}

export interface FavoritesRepository {
  get(token: string | null): Promise<FavoritesSession>;
  add(token: string | null, productId: string): Promise<FavoritesSession>;
  remove(token: string | null, productId: string): Promise<FavoritesSession>;
  clear(token: string | null): Promise<FavoritesSession>;
}

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

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export class PostgresFavoritesRepository implements FavoritesRepository {
  private readonly products: PostgresProductRepository;

  constructor(private readonly database: Kysely<DatabaseSchema>) {
    this.products = new PostgresProductRepository(database);
  }

  async get(token: string | null): Promise<FavoritesSession> {
    const sessionToken = tokenIsUsable(token) ? token : newToken();
    const tokenHash = hashToken(sessionToken);
    await this.touch(tokenHash);
    return {
      token: sessionToken,
      favorites: await this.view(tokenHash),
    };
  }

  async add(
    token: string | null,
    productId: string,
  ): Promise<FavoritesSession> {
    const normalizedProductId = productId.trim();
    if (!normalizedProductId || normalizedProductId.length > 160) {
      fail(
        400,
        "INVALID_FAVORITE_PRODUCT",
        "Invalid favorite product",
        "A favorite needs a valid product identifier.",
      );
    }
    const product = (await this.products.getByIds([normalizedProductId]))[0];
    if (!product) {
      fail(
        404,
        "FAVORITE_PRODUCT_NOT_FOUND",
        "Product not found",
        "The requested product is not currently published.",
      );
    }

    const sessionToken = tokenIsUsable(token) ? token : newToken();
    const tokenHash = hashToken(sessionToken);
    await this.database.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom("commerce.favorite_items")
        .select("product_id")
        .where("token_hash", "=", tokenHash)
        .where("product_id", "=", normalizedProductId)
        .where("expires_at", ">", new Date())
        .executeTakeFirst();
      if (existing) return;

      const countRow = await trx
        .selectFrom("commerce.favorite_items")
        .select((expression) => expression.fn.countAll().as("count"))
        .where("token_hash", "=", tokenHash)
        .where("expires_at", ">", new Date())
        .executeTakeFirst();
      if (Number(countRow?.count ?? 0) >= FAVORITES_MAX_ITEMS) {
        fail(
          409,
          "FAVORITES_LIMIT_REACHED",
          "Favorites limit reached",
          `A guest cannot save more than ${String(FAVORITES_MAX_ITEMS)} favorites.`,
        );
      }

      await trx
        .insertInto("commerce.favorite_items")
        .values({
          token_hash: tokenHash,
          product_id: product.id,
          expires_at: new Date(Date.now() + FAVORITES_TTL_MS),
        })
        .onConflict((conflict) =>
          conflict.columns(["token_hash", "product_id"]).doNothing(),
        )
        .execute();
    });
    await this.touch(tokenHash);
    return { token: sessionToken, favorites: await this.view(tokenHash) };
  }

  async remove(
    token: string | null,
    productId: string,
  ): Promise<FavoritesSession> {
    const sessionToken = tokenIsUsable(token) ? token : newToken();
    const tokenHash = hashToken(sessionToken);
    await this.database
      .deleteFrom("commerce.favorite_items")
      .where("token_hash", "=", tokenHash)
      .where("product_id", "=", productId.trim())
      .execute();
    await this.touch(tokenHash);
    return { token: sessionToken, favorites: await this.view(tokenHash) };
  }

  async clear(token: string | null): Promise<FavoritesSession> {
    const sessionToken = tokenIsUsable(token) ? token : newToken();
    const tokenHash = hashToken(sessionToken);
    await this.database
      .deleteFrom("commerce.favorite_items")
      .where("token_hash", "=", tokenHash)
      .execute();
    return {
      token: sessionToken,
      favorites: { items: [], removedProductIds: [], count: 0 },
    };
  }

  private async touch(tokenHash: string): Promise<void> {
    const now = new Date();
    await this.database
      .deleteFrom("commerce.favorite_items")
      .where("token_hash", "=", tokenHash)
      .where("expires_at", "<=", now)
      .execute();
    await this.database
      .updateTable("commerce.favorite_items")
      .set({ last_accessed_at: now })
      .where("token_hash", "=", tokenHash)
      .execute();
  }

  private async view(tokenHash: string): Promise<FavoritesView> {
    const rows = await this.database
      .selectFrom("commerce.favorite_items")
      .selectAll()
      .where("token_hash", "=", tokenHash)
      .where("expires_at", ">", new Date())
      .orderBy("added_at", "desc")
      .limit(FAVORITES_MAX_ITEMS)
      .execute();
    if (rows.length === 0) {
      return { items: [], removedProductIds: [], count: 0 };
    }

    const products = await this.products.getByIds(
      rows.map((row) => row.product_id),
    );
    const byId = new Map(products.map((product) => [product.id, product]));
    const removedProductIds = rows
      .map((row) => row.product_id)
      .filter((productId) => !byId.has(productId));
    if (removedProductIds.length > 0) {
      await this.database
        .deleteFrom("commerce.favorite_items")
        .where("token_hash", "=", tokenHash)
        .where("product_id", "in", removedProductIds)
        .execute();
    }

    const items = rows.flatMap((row) => {
      const product = byId.get(row.product_id);
      return product
        ? [
            {
              productId: row.product_id,
              addedAt: iso(row.added_at),
              product,
              isAvailable: product.variants.some(
                (variant) => variant.availability !== "out_of_stock",
              ),
            },
          ]
        : [];
    });
    return { items, removedProductIds, count: items.length };
  }
}
