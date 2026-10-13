import { describe, expect, it } from "vitest";
import { panelCountOptionsFor } from "../../src/catalog/panel-count.js";

describe("panelCountOptionsFor", () => {
  it("applies the fixed one-panel rule at 150 cm", () => {
    expect(panelCountOptionsFor("rideaux", "lin", 150)).toEqual([1]);
  });

  it("allows one or two panels above 150 cm", () => {
    expect(panelCountOptionsFor("voilages", "lin", 300)).toEqual([1, 2]);
  });

  it("recognizes the combined curtain category alias", () => {
    expect(panelCountOptionsFor("Rideaux & Voilages", "lin", 300)).toEqual([
      1, 2,
    ]);
  });

  it("allows only one or three panels for 450 cm velvet", () => {
    expect(panelCountOptionsFor("rideaux", "velours", 450)).toEqual([1, 3]);
  });
});
