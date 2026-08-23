import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type { DatabaseSchema } from "../database/schema.js";
import { AppError } from "../http/problem.js";

type MediaRow = Selectable<DatabaseSchema["content.media_assets"]>;
export type MediaAssetStatus = "draft" | "active" | "archived";
export type MediaAssetMimeType =
  "image/jpeg" | "image/png" | "image/webp" | "image/avif";

export interface AdminMediaAsset {
  id: string;
  storagePath: string;
  publicUrl: string;
  name: string;
  alt: string;
  width: number | null;
  height: number | null;
  mimeType: MediaAssetMimeType;
  status: MediaAssetStatus;
  usage: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAssetInput {
  storagePath?: string;
  publicUrl: string;
  name: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  mimeType: MediaAssetMimeType;
  status?: MediaAssetStatus;
  usage?: string;
}

export interface MediaAssetPatch {
  name?: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
  status?: MediaAssetStatus;
  usage?: string;
}

export interface AdminContentRepository {
  listMedia(): Promise<readonly AdminMediaAsset[]>;
  createMedia(
    input: MediaAssetInput,
    actorUserId: string,
  ): Promise<AdminMediaAsset>;
  updateMedia(
    id: string,
    patch: MediaAssetPatch,
    actorUserId: string,
  ): Promise<AdminMediaAsset>;
}

function fail(
  statusCode: number,
  code: string,
  title: string,
  detail: string,
): never {
  throw new AppError({ statusCode, code, title, detail });
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    fail(
      400,
      "MEDIA_VALIDATION_ERROR",
      "Invalid media asset",
      `${field} must contain at least one non-whitespace character.`,
    );
  }
  return normalized;
}

function validateDimensions(width: number | null, height: number | null): void {
  if ((width === null) !== (height === null)) {
    fail(
      400,
      "MEDIA_VALIDATION_ERROR",
      "Invalid media asset",
      "Width and height must be provided together or both be null.",
    );
  }
  if (
    (width !== null && (!Number.isInteger(width) || width < 1)) ||
    (height !== null && (!Number.isInteger(height) || height < 1))
  ) {
    fail(
      400,
      "MEDIA_VALIDATION_ERROR",
      "Invalid media asset",
      "Width and height must be positive integers.",
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function mediaRecord(row: MediaRow): AdminMediaAsset {
  return {
    id: row.id,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    name: row.name,
    alt: row.alt,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type,
    status: row.status,
    usage: row.usage,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export class PostgresAdminContentRepository implements AdminContentRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async listMedia(): Promise<readonly AdminMediaAsset[]> {
    const rows = await this.database
      .selectFrom("content.media_assets")
      .selectAll()
      .where("status", "!=", "archived")
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .execute();
    return rows.map(mediaRecord);
  }

  async createMedia(
    input: MediaAssetInput,
    actorUserId: string,
  ): Promise<AdminMediaAsset> {
    const storagePath = input.storagePath?.trim() ?? `external/${randomUUID()}`;
    const name = requiredText(input.name, "name");
    const alt = requiredText(input.alt, "alt");
    const usage = requiredText(input.usage?.trim() ?? "unassigned", "usage");
    const width = input.width ?? null;
    const height = input.height ?? null;
    validateDimensions(width, height);
    const duplicate = await this.database
      .selectFrom("content.media_assets")
      .select("id")
      .where("storage_path", "=", storagePath)
      .executeTakeFirst();
    if (duplicate)
      fail(
        409,
        "MEDIA_PATH_CONFLICT",
        "Media conflict",
        "A media asset already exists for this storage path.",
      );

    let row: MediaRow;
    try {
      row = await this.database
        .insertInto("content.media_assets")
        .values({
          storage_path: storagePath,
          public_url: input.publicUrl.trim(),
          name,
          alt,
          width,
          height,
          mime_type: input.mimeType,
          status: input.status ?? "draft",
          usage,
          created_by: actorUserId,
          updated_by: actorUserId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (isUniqueViolation(error))
        fail(
          409,
          "MEDIA_PATH_CONFLICT",
          "Media conflict",
          "A media asset already exists for this storage path.",
        );
      throw error;
    }
    return mediaRecord(row);
  }

  async updateMedia(
    id: string,
    patch: MediaAssetPatch,
    actorUserId: string,
  ): Promise<AdminMediaAsset> {
    const current = await this.database
      .selectFrom("content.media_assets")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!current)
      fail(
        404,
        "MEDIA_NOT_FOUND",
        "Media not found",
        "The requested media asset does not exist.",
      );

    const width = patch.width === undefined ? current.width : patch.width;
    const height = patch.height === undefined ? current.height : patch.height;
    validateDimensions(width, height);

    const row = await this.database
      .updateTable("content.media_assets")
      .set({
        ...(patch.name === undefined
          ? {}
          : { name: requiredText(patch.name, "name") }),
        ...(patch.alt === undefined
          ? {}
          : { alt: requiredText(patch.alt, "alt") }),
        ...(patch.width === undefined ? {} : { width: patch.width }),
        ...(patch.height === undefined ? {} : { height: patch.height }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
        ...(patch.usage === undefined
          ? {}
          : { usage: requiredText(patch.usage, "usage") }),
        updated_by: actorUserId,
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return mediaRecord(row);
  }
}
