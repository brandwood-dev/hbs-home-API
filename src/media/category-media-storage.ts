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
  }): Promise<CategoryImageUpload>;
}

function encodeStoragePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function failUpload(detail: string): never {
  throw new AppError({
    statusCode: 502,
    code: "MEDIA_STORAGE_UPLOAD_FAILED",
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

    // Supabase's new `sb_secret_…` keys are API keys, not JWTs. They must be
    // sent in `apikey` only; sending them as `Authorization: Bearer …` makes
    // Storage reject an otherwise valid upload with HTTP 400 (Invalid JWT).
    let response: Response;
    try {
      response = await fetch(`${this.storageUrl}/object/${objectPath}`, {
        method: "POST",
        headers: {
          apikey: this.secretKey,
          "cache-control": "max-age=31536000",
          "content-type": CATEGORY_IMAGE_OUTPUT_MIME,
          "x-upsert": "false",
        },
        body: converted.data,
      });
    } catch {
      failUpload("The category image could not be stored.");
    }

    if (!response.ok) {
      let responseBody = "";
      try {
        responseBody = (await response.clone().text()).slice(0, 300);
      } catch {
        // The status code is still useful when Storage returns a body that
        // cannot be decoded.
      }
      console.warn("Supabase Storage rejected category image upload", {
        status: response.status,
        body: responseBody,
      });
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
