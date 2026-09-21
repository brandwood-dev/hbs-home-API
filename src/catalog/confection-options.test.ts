import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFECTION_OPTIONS,
  confectionOptionFor,
  confectionOptionsFor,
} from "./confection-options.js";

describe("curtain confection defaults", () => {
  it.each(["rideaux", "voilages", "rideaux-voilages", "Rideaux & Voilages"])(
    "returns all defaults for the catalogue family %s",
    (category) => {
      expect(confectionOptionsFor(category)).toEqual(DEFAULT_CONFECTION_OPTIONS);
    },
  );

  it("does not expose curtain options for unrelated families", () => {
    expect(confectionOptionsFor("coussins")).toEqual([]);
  });

  it("validates a confection against the migrated curtain root slug", () => {
    expect(confectionOptionFor("rideaux-voilages", "wave")).toEqual(
      expect.objectContaining({ key: "wave" }),
    );
  });
});
