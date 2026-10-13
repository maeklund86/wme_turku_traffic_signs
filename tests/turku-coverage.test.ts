import { describe, expect, it } from "vitest";

import type { BoundingBox } from "../src/data/bounding-box";
import { TURKU_EXTENT } from "../src/constants";
import { overlapsTurkuCoverage } from "../src/data/turku-coverage";

const [TURKU_LEFT, TURKU_BOTTOM, TURKU_RIGHT, TURKU_TOP] = TURKU_EXTENT;

/** A small viewport strictly inside the coverage extent, around central Turku. */
const INSIDE_TURKU: BoundingBox = [22.2, 60.4, 22.3, 60.5];

describe("Turku coverage (AC-17)", () => {
  it("covers a viewport inside the Turku extent", () => {
    expect(overlapsTurkuCoverage(INSIDE_TURKU)).toBe(true);
  });

  it("covers the coverage extent itself, boundary included", () => {
    expect(overlapsTurkuCoverage(TURKU_EXTENT)).toBe(true);
    expect(
      overlapsTurkuCoverage([TURKU_LEFT, TURKU_BOTTOM, 22.2, TURKU_TOP]),
    ).toBe(true);
  });

  it("covers a zoomed-out viewport that shows the extent among other areas", () => {
    // Overlap is enough: signs inside the viewport still render.
    expect(overlapsTurkuCoverage([20.0, 59.0, 24.0, 62.0])).toBe(true);
  });

  it("does not cover a viewport west of the extent", () => {
    expect(overlapsTurkuCoverage([21.5, 60.0, TURKU_LEFT - 0.01, 60.2])).toBe(false);
  });

  it("does not cover a viewport east of the extent", () => {
    expect(overlapsTurkuCoverage([TURKU_RIGHT + 0.01, 60.2, 23.0, 60.4])).toBe(false);
  });

  it("does not cover a viewport south of the extent", () => {
    expect(overlapsTurkuCoverage([22.2, 60.0, 22.3, TURKU_BOTTOM - 0.01])).toBe(false);
  });

  it("does not cover a viewport north of the extent", () => {
    expect(overlapsTurkuCoverage([22.2, TURKU_TOP + 0.01, 22.3, 60.8])).toBe(false);
  });

  it("does not cover a distant viewport that merely shares a hemisphere", () => {
    expect(overlapsTurkuCoverage([23.0, 61.0, 24.0, 62.0])).toBe(false);
  });
});
