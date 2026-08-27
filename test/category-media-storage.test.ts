import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  convertCategoryImage,
  SupabaseCategoryMediaStorage,
} from "../src/media/category-media-storage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Category media conversion", () => {
  it("converts an accepted raster image to WebP and keeps its dimensions", async () => {
    const source = await sharp({
      create: {
        width: 12,
        height: 8,
        channels: 3,
        background: { r: 180, g: 110, b: 80 },
      },
    })
      .png()
      .toBuffer();

    const converted = await convertCategoryImage(source);
    const metadata = await sharp(converted.data).metadata();

    expect(metadata.format).toBe("webp");
    expect(converted.width).toBe(12);
    expect(converted.height).toBe(8);
    expect(metadata.width).toBe(12);
    expect(metadata.height).toBe(8);
  });

  it("rejects bytes that are not a valid image", async () => {
    await expect(
      convertCategoryImage(Buffer.from("not-an-image")),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "MEDIA_INVALID_IMAGE",
    });
  });

  it("uploads with the secret key in apikey only", async () => {
    const source = await sharp({
      create: {
        width: 12,
        height: 8,
        channels: 3,
        background: { r: 180, g: 110, b: 80 },
      },
    })
      .png()
      .toBuffer();
    let capturedHeaders = new Headers();
    const fetchMock = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers);
        return Promise.resolve(
          new Response(JSON.stringify({ Key: "catalog-media/test.webp" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const storage = new SupabaseCategoryMediaStorage(
      "catalog-media",
      "https://example.supabase.co",
      "sb_secret_test",
    );
    const result = await storage.upload({
      bytes: source,
      contentType: "image/png",
    });

    expect(result.mimeType).toBe("image/webp");
    expect(result.publicUrl).toContain(
      "/storage/v1/object/public/catalog-media/",
    );
    expect(capturedHeaders.get("apikey")).toBe("sb_secret_test");
    expect(capturedHeaders.get("authorization")).toBeNull();
  });

  it("rejects a publishable key before attempting a Storage write", async () => {
    const storage = new SupabaseCategoryMediaStorage(
      "catalog-media",
      "https://example.supabase.co",
      "sb_publishable_test",
    );

    await expect(
      storage.upload({
        bytes: Buffer.from("not-an-image"),
        contentType: "image/png",
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "MEDIA_STORAGE_MISCONFIGURED",
    });
  });
});
