import { describe, expect, it } from "vitest";
import { getVariantDisplayOptions } from "../src/catalog/variant-display-options.js";
import type { Product } from "../src/catalog/product-repository.js";

describe("variant display options", () => {
  it("keeps the selected color and variant axes in the snapshot contract", () => {
    const product = {
      colors: [{ id: "ivory", name: "Ivoire" }],
    } as unknown as Product;
    const variant = {
      colorId: "ivory",
      widthCm: 40,
      heightCm: 40,
      cushionContent: "avec_garnissage",
      cushionClosure: "zip",
    } as unknown as Product["variants"][number];

    expect(getVariantDisplayOptions(product, variant)).toEqual([
      { label: "Coloris", value: "Ivoire" },
      { label: "Dimensions", value: "40 × 40 cm" },
      { label: "Contenu", value: "Avec garnissage" },
      { label: "Fermeture", value: "Zip" },
    ]);
  });
});
