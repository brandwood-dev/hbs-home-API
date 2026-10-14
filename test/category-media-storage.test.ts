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

  it("uses the admin JWT for Storage auth with a modern secret key", async () => {
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
      authorization: "Bearer admin.jwt",
    });

    expect(result.mimeType).toBe("image/webp");
    expect(result.publicUrl).toContain(
      "/storage/v1/object/public/catalog-media/",
    );
    expect(capturedHeaders.get("apikey")).toBe("sb_secret_test");
    expect(capturedHeaders.get("authorization")).toBe("Bearer admin.jwt");
  });

  it("keeps Bearer auth for legacy JWT-shaped service keys", async () => {
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
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers);
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );

    const legacyKey = "eyJhbGciOiJIUzI1NiJ9.legacy.service.role";
    const storage = new SupabaseCategoryMediaStorage(
      "catalog-media",
      "https://example.supabase.co",
      legacyKey,
    );
    await storage.upload({ bytes: source, contentType: "image/png" });

    expect(capturedHeaders.get("apikey")).toBe(legacyKey);
    expect(capturedHeaders.get("authorization")).toBe(`Bearer ${legacyKey}`);
  });

  it("returns an actionable configuration error for rejected storage credentials", async () => {
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
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "InvalidJWT" }), {
            status: 401,
            headers: { "x-request-id": "storage-test-request" },
          }),
        ),
      ),
    );

    const storage = new SupabaseCategoryMediaStorage(
      "catalog-media",
      "https://example.supabase.co",
      "sb_secret_test",
    );
    await expect(
      storage.upload({ bytes: source, contentType: "image/png" }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "MEDIA_STORAGE_MISCONFIGURED",
    });
  });

  it("returns a permission error for an RLS rejection from Storage", async () => {
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
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "AccessDenied" }), {
            status: 400,
            headers: { "x-request-id": "storage-rls-test-request" },
          }),
        ),
      ),
    );

    const storage = new SupabaseCategoryMediaStorage(
      "catalog-media",
      "https://example.supabase.co",
      "sb_secret_test",
    );
    await expect(
      storage.upload({
        bytes: source,
        contentType: "image/png",
        authorization: "Bearer admin.jwt",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "MEDIA_STORAGE_PERMISSION_DENIED",
    });
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
