import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
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

function failUpload(detail: string): never {
  throw new AppError({
    statusCode: 502,
    code: "MEDIA_STORAGE_UPLOAD_FAILED",
    title: "Media storage unavailable",
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
  private readonly client: ReturnType<typeof createClient>;

  constructor(
    private readonly bucket: string,
    supabaseUrl: string,
    secretKey: string,
  ) {
    this.client = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async upload(input: {
    bytes: Buffer;
    contentType: CategoryImageInputMime;
  }): Promise<CategoryImageUpload> {
    const converted = await convertCategoryImage(input.bytes);
    const storagePath = `catalog/categories/uploads/${randomUUID()}.webp`;
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(storagePath, converted.data, {
        cacheControl: "31536000",
        contentType: CATEGORY_IMAGE_OUTPUT_MIME,
        upsert: false,
      });
    if (error) failUpload("The category image could not be stored.");

    const { data } = this.client.storage
      .from(this.bucket)
      .getPublicUrl(storagePath);
    if (!data.publicUrl)
      failUpload("The category image URL could not be generated.");

    return {
      storagePath,
      publicUrl: data.publicUrl,
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
