import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { convertCategoryImage } from "../src/media/category-media-storage.js";

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
});
