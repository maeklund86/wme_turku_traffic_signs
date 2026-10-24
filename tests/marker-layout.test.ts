import { describe, expect, it } from "vite-plus/test";

import { layoutMarkerIcons } from "../src/visual-overlay/marker-layout";
import { SIGN_ICON_SIZE } from "../src/visual-overlay/marker-graphics";
import { sign } from "./support/turku-sign";

const CAPTURED_VIEWPORT = {
  bounds: [22.264443876265606, 60.46130271478339, 22.265238480685568, 60.46170338718052] as const,
  width: 1185,
  height: 1212,
};

describe("screen-space marker layout", () => {
  it("separates the captured H23.1 and B5 markers while preserving their points", () => {
    const signs = [
      sign("320960333", 22.264860598507497, 60.461534953264746, { signCode: "H23.1" }),
      sign("320960332", 22.2648600526969, 60.46153497718211, { signCode: "B5" }),
    ];
    const placements = layoutMarkerIcons(signs, CAPTURED_VIEWPORT);
    const pixels = signs.map((trafficSign, index) => {
      const [longitude, latitude] = trafficSign.coordinates;
      return {
        x:
          ((longitude - CAPTURED_VIEWPORT.bounds[0]) /
            (CAPTURED_VIEWPORT.bounds[2] - CAPTURED_VIEWPORT.bounds[0])) *
          CAPTURED_VIEWPORT.width,
        y:
          ((CAPTURED_VIEWPORT.bounds[3] - latitude) /
            (CAPTURED_VIEWPORT.bounds[3] - CAPTURED_VIEWPORT.bounds[1])) *
            CAPTURED_VIEWPORT.height +
          placements[index]!.iconYOffset,
      };
    });

    expect(Math.abs(pixels[0]!.x - pixels[1]!.x) >= SIGN_ICON_SIZE).toBe(false);
    expect(Math.abs(pixels[0]!.y - pixels[1]!.y)).toBeGreaterThanOrEqual(SIGN_ICON_SIZE);
    expect(signs.map(({ coordinates }) => coordinates)).toEqual([
      [22.264860598507497, 60.461534953264746],
      [22.2648600526969, 60.46153497718211],
    ]);
    expect(placements.some(({ iconYOffset }) => iconYOffset !== -23)).toBe(true);
    expect(
      placements.map(({ postHeight }) => postHeight).sort((left, right) => left - right),
    ).toEqual([6, 12]);

    for (const [index, placement] of placements.entries()) {
      const pointY = pixels[index]!.y - placement.iconYOffset;
      const postTop = pointY + placement.postYOffset - placement.postHeight / 2;
      const postBottom = pointY + placement.postYOffset + placement.postHeight / 2;
      const sibling = pixels[1 - index]!;
      const siblingTop = sibling.y - SIGN_ICON_SIZE / 2;
      const siblingBottom = sibling.y + SIGN_ICON_SIZE / 2;
      expect(postBottom <= siblingTop || postTop >= siblingBottom).toBe(true);
    }
  });

  it("leaves signs whose rendered icons do not overlap at their normal anchor", () => {
    const signs = [sign("left", 22.2645, 60.4614), sign("right", 22.2651, 60.4616)];

    expect(
      layoutMarkerIcons(signs, CAPTURED_VIEWPORT).map(({ iconYOffset }) => iconYOffset),
    ).toEqual([-23, -23]);
  });

  it("stacks downward when there is more room below a cluster near the viewport top", () => {
    const signs = [
      sign("320960333", 22.264860598507497, 60.461534953264746, { signCode: "H23.1" }),
      sign("320960332", 22.2648600526969, 60.46153497718211, { signCode: "B5" }),
    ];
    const viewport = {
      bounds: [22.26481, 60.461533, 22.26491, 60.461535],
      width: 1185,
      height: 1212,
    } as const;
    const placements = layoutMarkerIcons(signs, viewport);
    const iconCenterYs = signs.map(
      (trafficSign, index) =>
        ((viewport.bounds[3] - trafficSign.coordinates[1]) /
          (viewport.bounds[3] - viewport.bounds[1])) *
          viewport.height +
        placements[index]!.iconYOffset,
    );

    expect(placements.every(({ iconYOffset }) => iconYOffset > 0)).toBe(true);
    expect(Math.abs(iconCenterYs[0]! - iconCenterYs[1]!)).toBeGreaterThanOrEqual(SIGN_ICON_SIZE);
  });
});
