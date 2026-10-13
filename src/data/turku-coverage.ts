import { TURKU_EXTENT } from "../constants";
import type { BoundingBox } from "./bounding-box";

/**
 * Whether the map viewport shows any of the Turku coverage extent. The registry
 * only holds signs inside that extent, so a viewport that misses it entirely
 * has nothing to show: the Sign Panel disables its visibility toggle and shows
 * the "outside Turku coverage" notice instead, and no markers render
 * (spec §4.5, AC-17).
 *
 * Overlapping, not containment: a viewport zoomed out far enough to show the
 * extent alongside other areas still covers Turku signs.
 */
export function overlapsTurkuCoverage(viewport: BoundingBox): boolean {
  const [left, bottom, right, top] = viewport;
  return (
    left <= TURKU_EXTENT[2] &&
    right >= TURKU_EXTENT[0] &&
    bottom <= TURKU_EXTENT[3] &&
    top >= TURKU_EXTENT[1]
  );
}
