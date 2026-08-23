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

    const row = await this.database
      .insertInto("content.media_assets")
      .values({
        storage_path: storagePath,
        public_url: input.publicUrl.trim(),
        name: input.name.trim(),
        alt: input.alt.trim(),
        width: input.width ?? null,
        height: input.height ?? null,
        mime_type: input.mimeType,
        status: input.status ?? "draft",
        usage: input.usage?.trim() ?? "unassigned",
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
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

    const row = await this.database
      .updateTable("content.media_assets")
      .set({
        ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
        ...(patch.alt === undefined ? {} : { alt: patch.alt.trim() }),
        ...(patch.width === undefined ? {} : { width: patch.width }),
        ...(patch.height === undefined ? {} : { height: patch.height }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
        ...(patch.usage === undefined ? {} : { usage: patch.usage.trim() }),
        updated_by: actorUserId,
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return mediaRecord(row);
  }
}
