import { randomUUID } from "node:crypto";
import { AppError } from "../http/problem.js";
import type { Environment } from "../config/environment.js";

export const CATEGORY_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const CATEGORY_IMAGE_MAX_DIMENSION = 2_400;
export const CATEGORY_IMAGE_MAX_PIXELS = 25_000_000;
export const CATEGORY_IMAGE_OUTPUT_MIME = "image/webp" as const;

export type CategoryImageInputMime = "image/jpeg" | "image/png" | "image/webp";

export interface CategoryImageUpload {
  storagePath: string;
  publicUrl: string;
  mimeType: typeof CATEGORY_IMAGE_OUTPUT_MIME;
  width: number;
  height: number;
}

export interface CategoryMediaStorage {
  upload(input: {
    bytes: Buffer;
    contentType: CategoryImageInputMime;
    /** JWT from the authenticated admin request, forwarded to Storage for RLS. */
    authorization?: string;
  }): Promise<CategoryImageUpload>;
}

function encodeStoragePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function failUpload(
  detail: string,
  code = "MEDIA_STORAGE_UPLOAD_FAILED",
  statusCode = 502,
): never {
  throw new AppError({
    statusCode,
    code,
    title: "Media storage unavailable",
    detail,
  });
}

function failStorageConfiguration(detail: string): never {
  throw new AppError({
    statusCode: 503,
    code: "MEDIA_STORAGE_MISCONFIGURED",
    title: "Media storage misconfigured",
    detail,
  });
}

function failInvalidImage(detail: string): never {
  throw new AppError({
    statusCode: 400,
    code: "MEDIA_INVALID_IMAGE",
    title: "Invalid category image",
    detail,
  });
}

function safeStorageErrorCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(normalized) ? normalized : undefined;
}

async function readStorageError(response: Response): Promise<{
  code?: string;
  requestId?: string;
}> {
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    body = undefined;
  }

  const payload =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : undefined;
  const code = safeStorageErrorCode(
    payload?.error ?? payload?.code ?? payload?.statusCode,
  );
  const requestId =
    response.headers.get("x-request-id") ??
    response.headers.get("sb-request-id") ??
    response.headers.get("x-sb-request-id") ??
    undefined;

  return {
    ...(code ? { code } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

export async function convertCategoryImage(bytes: Buffer): Promise<{
  data: Buffer;
  width: number;
  height: number;
}> {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    failInvalidImage("The uploaded image is empty.");
  }
  if (bytes.length > CATEGORY_IMAGE_MAX_BYTES) {
    failInvalidImage("The image must not exceed 8 MiB.");
  }

  try {
    // Load the native image processor only when an upload is requested. This
    // keeps every API worker and read-only request lightweight while retaining
    // server-side conversion for the upload path.
    const { default: sharp } = await import("sharp");
    const result = await sharp(bytes, {
      failOn: "error",
      limitInputPixels: CATEGORY_IMAGE_MAX_PIXELS,
    })
      .rotate()
      .resize({
        width: CATEGORY_IMAGE_MAX_DIMENSION,
        height: CATEGORY_IMAGE_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    if (result.info.width < 1 || result.info.height < 1) {
      failInvalidImage("The image dimensions are invalid.");
    }
    return {
      data: result.data,
      width: result.info.width,
      height: result.info.height,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    failInvalidImage(
      "The uploaded file is not a valid JPEG, PNG or WebP image.",
    );
  }
}

export class SupabaseCategoryMediaStorage implements CategoryMediaStorage {
  private readonly storageUrl: string;

  constructor(
    private readonly bucket: string,
    supabaseUrl: string,
    secretKey: string,
  ) {
    this.storageUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1`;
    this.secretKey = secretKey;
  }

  private readonly secretKey: string;

  async upload(input: {
    bytes: Buffer;
    contentType: CategoryImageInputMime;
    authorization?: string;
  }): Promise<CategoryImageUpload> {
    // Publishable keys are intentionally read-only for this server-side
    // pipeline. Failing early gives operators an actionable error instead of
    // the opaque HTTP 400 returned by Storage when RLS rejects an insert.
    if (this.secretKey.startsWith("sb_publishable_")) {
      failStorageConfiguration(
        "SUPABASE_STORAGE_SECRET_KEY must be a Supabase secret key (sb_secret_…), not a publishable key.",
      );
    }

    const converted = await convertCategoryImage(input.bytes);
    const storagePath = `catalog/categories/uploads/${randomUUID()}.webp`;
    const objectPath = encodeStoragePath(`${this.bucket}/${storagePath}`);

    // Modern `sb_secret_…` keys are opaque API keys, not JWTs. They belong in
    // `apikey` only; Storage must receive the signed admin session JWT in
    // `Authorization` so its RLS policies can evaluate the actor. Legacy
    // service-role JWTs remain supported as a backwards-compatible fallback.
    const authorization =
      input.authorization?.trim() ??
      (this.secretKey.startsWith("eyJ")
        ? `Bearer ${this.secretKey}`
        : undefined);
    if (!authorization) {
      failStorageConfiguration(
        "Category image storage requires an authenticated admin session.",
      );
    }

    const headers = new Headers({
      apikey: this.secretKey,
      authorization,
      "cache-control": "max-age=31536000",
      "content-type": CATEGORY_IMAGE_OUTPUT_MIME,
      "x-upsert": "false",
    });

    let response: Response;
    try {
      response = await fetch(`${this.storageUrl}/object/${objectPath}`, {
        method: "POST",
        headers,
        body: converted.data,
      });
    } catch {
      failUpload(
        "Category image storage could not be reached. Please try again.",
        "MEDIA_STORAGE_NETWORK_ERROR",
      );
    }

    if (!response.ok) {
      const storageError = await readStorageError(response);
      console.warn("Supabase Storage rejected category image upload", {
        status: response.status,
        storageCode: storageError.code,
        storageRequestId: storageError.requestId,
      });

      if (response.status === 401 || response.status === 403) {
        failStorageConfiguration(
          "Category image storage credentials were rejected. Check the server-side Supabase storage key.",
        );
      }
      if (response.status === 404) {
        failStorageConfiguration(
          "The category image storage bucket was not found. Check SUPABASE_STORAGE_BUCKET.",
        );
      }
      if (response.status === 413) {
        failUpload(
          "The category image is too large for storage. Use an image under 8 MiB.",
          "MEDIA_STORAGE_FILE_TOO_LARGE",
          413,
        );
      }
      failUpload("The category image could not be stored.");
    }

    const publicUrl = `${this.storageUrl}/object/public/${objectPath}`;

    return {
      storagePath,
      publicUrl,
      mimeType: CATEGORY_IMAGE_OUTPUT_MIME,
      width: converted.width,
      height: converted.height,
    };
  }
}

export function createCategoryMediaStorage(
  environment: Environment,
): CategoryMediaStorage | null {
  const secretKey = environment.supabaseStorageSecretKey;
  if (!secretKey) return null;
  return new SupabaseCategoryMediaStorage(
    environment.supabaseStorageBucket,
    environment.supabaseUrl,
    secretKey,
  );
}
