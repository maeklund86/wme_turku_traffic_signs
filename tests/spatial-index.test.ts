import { describe, expect, it } from "vite-plus/test";

import { buildSpatialIndex } from "../src/data/spatial-index";
import { sign } from "./support/turku-sign";

describe("In-memory spatial index", () => {
  it("returns only the signs inside the bounds", () => {
    const index = buildSpatialIndex([sign("inside", 22.25, 60.45), sign("outside", 23.5, 61.5)]);

    const hits = index.query([22.24, 60.44, 22.26, 60.46]);

    expect(hits.map((hit) => hit.key)).toEqual(["inside"]);
  });

  it("includes signs sitting exactly on a bounds edge", () => {
    const index = buildSpatialIndex([sign("corner", 22.24, 60.44), sign("far", 22.9, 60.9)]);

    const hits = index.query([22.24, 60.44, 22.26, 60.46]);

    expect(hits.map((hit) => hit.key)).toEqual(["corner"]);
  });

  it("serves the whole dataset for bounds that cover it", () => {
    const signs = [
      sign("a", 22.09629812348802, 60.358027617176646),
      sign("b", 22.27617187661397, 60.443853785959234),
      sign("c", 22.387545573110714, 60.59816534708023),
    ];
    const index = buildSpatialIndex(signs);

    const hits = index.query([22.09, 60.35, 22.39, 60.61]);

    expect(hits.map((hit) => hit.key)).toEqual(["a", "b", "c"]);
    expect(index.signs).toHaveLength(3);
  });

  it("returns nothing when the bounds miss every sign", () => {
    const index = buildSpatialIndex([sign("a", 22.25, 60.45)]);

    expect(index.query([23.0, 61.0, 23.1, 61.1])).toEqual([]);
  });

  it("returns hits in fetch order, whatever the grid traversal order", () => {
    // Signs deliberately ordered so the cell scan meets them back-to-front.
    const index = buildSpatialIndex([
      sign("third", 22.3, 60.5),
      sign("first", 22.1, 60.4),
      sign("second", 22.2, 60.45),
    ]);

    expect(index.query([22.0, 60.3, 22.4, 60.6]).map((hit) => hit.key)).toEqual([
      "third",
      "first",
      "second",
    ]);
  });
});
