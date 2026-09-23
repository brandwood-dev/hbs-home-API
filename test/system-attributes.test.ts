import { describe, expect, it } from "vitest";
import {
  incompatibleManagedSystemAttributeIds,
  managedSystemAttributeKeys,
  orderCategoryBindingSyncTargets,
  shouldIgnoreUnavailableAttributeValue,
  shouldResynchronizeSystemAttributes,
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

  it("orders the root before descendants when synchronizing bindings", () => {
    const root = { id: "root", label: "Root" };
    const childA = { id: "child-a", label: "A" };
    const childB = { id: "child-b", label: "B" };

    expect(
      orderCategoryBindingSyncTargets(root, [childA, childB, root]),
    ).toEqual([root, childA, childB]);
  });

  it("resynchronizes managed bindings when an archived category is reactivated", () => {
    expect(
      shouldResynchronizeSystemAttributes({
        previousStatus: "archived",
        nextStatus: "active",
        parentChanged: false,
        rootSlugChanged: false,
      }),
    ).toBe(true);
    expect(
      shouldResynchronizeSystemAttributes({
        previousStatus: "active",
        nextStatus: "active",
        parentChanged: false,
        rootSlugChanged: false,
      }),
    ).toBe(false);
    expect(
      shouldResynchronizeSystemAttributes({
        previousStatus: "active",
        nextStatus: "archived",
        parentChanged: true,
        rootSlugChanged: false,
      }),
    ).toBe(false);
  });

  it("removes only incompatible managed system attribute values", () => {
    const desiredAttributeIds = new Set(["system-material"]);
    expect(
      incompatibleManagedSystemAttributeIds(
        [
          { id: "system-material", key: "material", isSystem: true },
          { id: "system-shape", key: "shape", isSystem: true },
          { id: "custom-shape", key: "shape", isSystem: false },
          { id: "custom-toggle", key: "custom_toggle", isSystem: false },
          { id: "future-system", key: "future_key", isSystem: true },
        ],
        desiredAttributeIds,
      ),
    ).toEqual(["system-shape"]);
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
