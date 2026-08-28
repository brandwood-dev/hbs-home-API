import { describe, expect, it } from "vitest";
import { validateVariantBusinessRules } from "../src/catalog/variant-business-rules.js";

describe("catalog variant business rules", () => {
  it("rejects a curtain higher than 315 cm", () => {
    expect(
      validateVariantBusinessRules("rideaux", "lin", {}, { heightCm: 316 }),
    ).toMatchObject({ code: "VARIANT_HEIGHT_LIMIT", field: "dimensions" });
  });

  it("requires velvet widths to use 150 cm panels", () => {
    expect(
      validateVariantBusinessRules("rideaux", "Velours", {}, { widthCm: 400 }),
    ).toMatchObject({ code: "VELVET_WIDTH_INVALID", field: "dimensions" });
  });

  it("limits extensible rods to 1.5–3 m", () => {
    expect(
      validateVariantBusinessRules(
        "accessoires",
        "acier",
        { attributes: { accessory_type: "tringle_extensible" } },
        { length: 301 },
      ),
    ).toMatchObject({ code: "EXTENSIBLE_ROD_LENGTH_INVALID", field: "length" });
  });

  it("accepts valid dimensions and accessory lengths", () => {
    expect(
      validateVariantBusinessRules(
        "accessoires",
        "acier",
        { attributes: { accessory_type: "tringle_extensible" } },
        { length: 150 },
      ),
    ).toBeNull();
  });
});
