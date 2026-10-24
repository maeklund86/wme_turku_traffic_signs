import { describe, expect, it } from "vite-plus/test";

import {
  fallbackPlateGraphic,
  SIGN_PLATE_BORDER_COLOR,
  SIGN_PLATE_BORDER_WIDTH,
  SIGN_PLATE_FILL_COLOR,
  SIGN_PLATE_HEIGHT,
  SIGN_PLATE_SUBLABEL,
  SIGN_PLATE_WIDTH,
  SIGN_POST_GRAPHIC,
  SIGN_POST_WIDTH,
  signPostGraphic,
} from "../src/visual-overlay/marker-graphics";

describe("fallback plate graphic (AC-11)", () => {
  const plate = decodeSvg(fallbackPlateGraphic("C38"));

  it("is an SVG data URI carrying the plate's geometry", () => {
    expect(fallbackPlateGraphic("C38")).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(plate).toContain(`width="${SIGN_PLATE_WIDTH}"`);
    expect(plate).toContain(`height="${SIGN_PLATE_HEIGHT}"`);
  });

  it("renders a light plate with a dark 1.5 px border and rounded corners", () => {
    expect(plate).toContain(`fill="${SIGN_PLATE_FILL_COLOR}"`);
    expect(plate).toContain(`stroke="${SIGN_PLATE_BORDER_COLOR}"`);
    expect(plate).toContain(`stroke-width="${SIGN_PLATE_BORDER_WIDTH}"`);
    expect(plate).toContain('rx="3"');
  });

  it("shows the sign code and the missing-asset sublabel", () => {
    expect(plate).toContain(">C38<");
    expect(plate).toContain(`>${SIGN_PLATE_SUBLABEL}<`);
  });

  it("shrinks the code to fit rather than letting it run past the border", () => {
    const shortCode = codeFontSize(fallbackPlateGraphic("C38"));
    const longCode = codeFontSize(fallbackPlateGraphic("C99_9_9"));
    expect(longCode).toBeLessThan(shortCode);
    expect(longCode).toBeGreaterThanOrEqual(5.5);
  });

  it("forces a pathological code to the plate's inner width instead of bleeding", () => {
    const plate = decodeSvg(fallbackPlateGraphic("C99_blanko"));
    expect(plate).toContain('textLength="29"');
    // The sign stays identifiable: the whole code is still rendered.
    expect(plate).toContain(">C99_blanko<");
    expect(plate).toContain(`>${SIGN_PLATE_SUBLABEL}<`);
  });

  it("leaves ordinary codes undistorted, with no forced width", () => {
    const plate = decodeSvg(fallbackPlateGraphic("C32_5"));
    expect(plate).not.toContain("textLength");
  });

  it("keeps registry text inert in the SVG markup", () => {
    const hostile = decodeSvg(fallbackPlateGraphic('C3<img"8&'));
    expect(hostile).not.toContain("<img");
    expect(hostile).toContain("&lt;img");
    expect(hostile).toContain("&amp;");
  });

  it("gives each sign its own plate, so no two signs share one", () => {
    expect(fallbackPlateGraphic("C38")).not.toBe(fallbackPlateGraphic("C39"));
    expect(decodeSvg(fallbackPlateGraphic("C39"))).toContain(">C39<");
  });
});

describe("neutral post graphic (AC-10)", () => {
  const post = decodeSvg(SIGN_POST_GRAPHIC);

  it("is a thin grey bar, 2 px wide", () => {
    expect(post).toContain('width="2"');
    expect(post).toContain('fill="#8a949e"');
  });

  it("carries a subtle drop shadow, since OL2 has no filter vocabulary", () => {
    expect(post).toContain("radialGradient");
    expect(post).toContain('stop-opacity="0.45"');
    expect(post).toContain('stop-opacity="0"');
  });

  it("draws only the post: no plate and no signage behind the sign", () => {
    expect(post).not.toContain("<text");
    // The post's only rectangle is the 2 px bar itself — never a plate.
    const widths = [...post.matchAll(/<rect[^>]*width="(\d+)"/g)].map((match) => Number(match[1]));
    expect(widths).toEqual([SIGN_POST_WIDTH]);
  });

  it("draws short inter-sign connectors without a source-point shadow", () => {
    const connector = decodeSvg(signPostGraphic(6, false, false));
    expect(connector).toContain('width="10"');
    expect(connector).toContain('height="6"');
    expect(connector).toContain('<rect x="4" y="0" width="2" height="6"');
    expect(connector).not.toContain("radialGradient");
    const downward = decodeSvg(signPostGraphic(12, true));
    expect(downward).toContain('cy="1.4"');
    expect(downward).toContain('y="2"');
    const interSignConnector = decodeSvg(signPostGraphic(4, false, false));
    expect(interSignConnector).toContain('height="4"');
    expect(interSignConnector).toContain('<rect x="4" y="0" width="2" height="4"');
    expect(interSignConnector).not.toContain("radialGradient");
  });
});

function decodeSvg(dataUri: string): string {
  return decodeURIComponent(dataUri.slice("data:image/svg+xml;charset=utf-8,".length));
}

function codeFontSize(dataUri: string): number {
  const match = /font-size="([\d.]+)"/.exec(decodeSvg(dataUri));
  expect(match?.[1]).toBeDefined();
  return Number(match![1]);
}
