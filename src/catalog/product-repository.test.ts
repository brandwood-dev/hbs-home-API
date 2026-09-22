import { describe, expect, it } from "vitest";
import {
  getVariantColorFamily,
  type Product,
  type ProductVariant,
} from "./product-repository.js";

const product = (colors: Product["colors"] = []): Product =>
  ({ colors }) as Product;

const variant = (colorId: string, colorFamily?: string): ProductVariant => ({
  id: "variant-1",
  sku: "SKU-1",
  colorId,
  ...(colorFamily ? { colorFamily } : {}),
  widthCm: 300,
  heightCm: 280,
  availability: "in_stock",
  availableQuantity: 1,
  imageUrl: "/images/placeholder.jpg",
  imageIds: [],
  price: { amountMinor: 100_000, currency: "TND" },
});

describe("catalog variant color family resolution", () => {
  it("resolves legacy variant color ids when product colors are empty", () => {
    expect(getVariantColorFamily(product(), variant("c-gris"))).toBe("grey");
  });

  it("prefers declared product color metadata", () => {
    expect(
      getVariantColorFamily(
        product([
          {
            id: "c-gris",
            name: "Gris",
            slug: "gris",
            family: "grey",
            hex: "#999",
          },
        ]),
        variant("c-gris", "blue"),
      ),
    ).toBe("grey");
  });

  it("uses variant metadata before the legacy id fallback", () => {
    expect(getVariantColorFamily(product(), variant("custom", "blue"))).toBe(
      "blue",
    );
  });
});
