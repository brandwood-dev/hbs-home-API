import { describe, expect, it } from "vitest";
import { type Product, type ProductVariant } from "./product-repository.js";
import { getVariantDisplayOptions } from "./variant-display-options.js";

const variant = (orientation: string): ProductVariant => ({
  id: `variant-${orientation}`,
  sku: `SKU-${orientation}`,
  colorId: "c-beige",
  widthCm: 160,
  heightCm: 68,
  orientation,
  availability: "in_stock",
  availableQuantity: 1,
  imageUrl: "/images/placeholder.jpg",
  imageIds: [],
  price: { amountMinor: 100_000, currency: "TND" },
});

describe("catalog variant display options", () => {
  it("keeps furniture orientation in cart and order selections", () => {
    const options = getVariantDisplayOptions(
      { colors: [] } as Product,
      variant("droite"),
    );

    expect(options).toContainEqual({ label: "Orientation", value: "droite" });
  });
});
