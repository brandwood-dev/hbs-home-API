import { describe, expect, it } from "vitest";
import {
  managedSystemAttributeKeys,
  shouldIgnoreUnavailableAttributeValue,
  systemAttributeKeysForRootCategory,
} from "../src/catalog/system-attributes.js";

describe("system category attributes", () => {
  it.each([
    "rideaux",
    "voilages",
    "rideaux-voilages",
    "rideaux-et-voilages",
    "Rideaux & Voilages",
  ])("recognizes the curtain family root %s", (rootSlug) => {
    expect(systemAttributeKeysForRootCategory(rootSlug)).toContain(
      "large_width",
    );
    expect(systemAttributeKeysForRootCategory(rootSlug)).toContain("material");
  });

  it.each([
    ["mobilier_interieur", "furniture_type"],
    ["mobilier-interieur", "furniture_type"],
    ["plantes_decoration", "plant_type"],
    ["plantes-decoration", "plant_type"],
    ["galettes_de_chaise", "fastening"],
  ])("normalizes the legacy root alias %s", (rootSlug, attributeKey) => {
    expect(systemAttributeKeysForRootCategory(rootSlug)).toContain(
      attributeKey,
    );
  });

  it("lists every automatically managed system attribute", () => {
    expect(managedSystemAttributeKeys()).toEqual(
      expect.arrayContaining([
        "large_width",
        "furniture_type",
        "plant_type",
        "fastening",
      ]),
    );
  });

  it("ignores only the disabled legacy large-width system checkbox", () => {
    expect(
      shouldIgnoreUnavailableAttributeValue(
        "large_width",
        true,
        "boolean",
        false,
      ),
    ).toBe(true);
    expect(
      shouldIgnoreUnavailableAttributeValue(
        "large_width",
        true,
        "boolean",
        true,
      ),
    ).toBe(false);
    expect(
      shouldIgnoreUnavailableAttributeValue(
        "custom_toggle",
        false,
        "boolean",
        false,
      ),
    ).toBe(false);
    expect(
      shouldIgnoreUnavailableAttributeValue(
        "large_width",
        false,
        "boolean",
        false,
      ),
    ).toBe(false);
  });
});
