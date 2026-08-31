import { describe, expect, it } from "vitest";
import { normalizeVariantSku } from "../src/catalog/admin-catalog-repository.js";

describe("catalog variant SKU identity", () => {
  it("uses a canonical, case-insensitive form", () => {
    expect(normalizeVariantSku("  cous-001-var-02 ")).toBe("COUS-001-VAR-02");
  });
});
