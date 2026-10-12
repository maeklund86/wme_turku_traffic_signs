import { describe, expect, it, vi } from "vitest";

import type { SdkFeature } from "wme-sdk-typings";

import { SIGN_LAYER_NAME } from "../src/constants";
import type { TrafficSign } from "../src/data/traffic-sign";
import {
  FALLBACK_MARKER,
  MARKER_KIND_PROPERTY,
  OFFICIAL_MARKER,
  SIGN_CODE_PROPERTY,
  SIGN_GRAPHIC_CONTEXT_KEY,
  SIGN_MARKER_STYLE_CONTEXT,
  SIGN_MARKER_STYLE_RULES,
} from "../src/visual-overlay/marker-style";
import { openSignMarkerLayer } from "../src/visual-overlay/sign-marker-layer";
import { sign } from "./support/turku-sign";

const LAYER = SIGN_LAYER_NAME;

function createHost() {
  const addLayer = vi.fn();
  const addFeatureToLayer = vi.fn((args: { layerName: string; feature: SdkFeature }) => args.feature);
  const removeAllFeaturesFromLayer = vi.fn();
  const setLayerVisibility = vi.fn();
  const sdk = {
    Map: { addLayer, addFeatureToLayer, removeAllFeaturesFromLayer, setLayerVisibility },
  };
  return { sdk, addLayer, addFeatureToLayer, removeAllFeaturesFromLayer, setLayerVisibility };
}

/** The graphic the style context resolves for one sign code. */
function graphicFor(signCode: string): string {
  const graphic = SIGN_MARKER_STYLE_CONTEXT[SIGN_GRAPHIC_CONTEXT_KEY]!({
    feature: { properties: { [SIGN_CODE_PROPERTY]: signCode } },
  } as never);
  expect(typeof graphic).toBe("string");
  return graphic as string;
}

function features(host: ReturnType<typeof createHost>): SdkFeature[] {
  return host.addFeatureToLayer.mock.calls.map(([{ feature }]) => feature);
}

/** A sign the pinned collection has no SVG for → plate. */
function unmatchedSign(): TrafficSign {
  return sign("990", 22.27, 60.45, { signCode: "990" });
}

describe("Visual Overlay marker layer (AC-9)", () => {
  it("creates exactly one SDK marker layer, with the overlay's styling", () => {
    const host = createHost();
    openSignMarkerLayer({ sdk: host.sdk }).setVisible(true);

    expect(host.addLayer).toHaveBeenCalledTimes(1);
    const args = host.addLayer.mock.calls[0]![0];
    expect(args.layerName).toBe(LAYER);
    expect(args.styleRules).toEqual([...SIGN_MARKER_STYLE_RULES]);
    expect(args.styleContext).toBe(SIGN_MARKER_STYLE_CONTEXT);
    expect(args.zIndexing).toBe(true);
  });

  it("adds one feature per sign, at its WGS84 point, with no reprojection", () => {
    const host = createHost();
    const signs = [
      sign("1", 22.27617187661397, 60.443853785959234),
      sign("2", 22.1, 60.4),
    ];
    openSignMarkerLayer({ sdk: host.sdk }).render(signs);

    expect(host.addFeatureToLayer.mock.calls.map(([{ layerName }]) => layerName)).toEqual([LAYER, LAYER]);
    const added = features(host);
    expect(added).toHaveLength(2);
    expect(added[0]!.geometry).toEqual({
      type: "Point",
      coordinates: [22.27617187661397, 60.443853785959234],
    });
    // Longitude, latitude — exactly as the Trimble OGC API served them.
    expect(added[1]!.geometry.coordinates).toEqual([22.1, 60.4]);
    expect(added[0]!.type).toBe("Feature");
    expect(added.map((feature) => feature.id)).toEqual(["1", "2"]);
  });

  it("keeps the registry key as the feature id, falling back when absent", () => {
    const host = createHost();
    openSignMarkerLayer({ sdk: host.sdk }).render([
      sign("", 22.2, 60.4),
      sign("known", 22.2, 60.41),
    ]);

    expect(features(host).map((feature) => feature.id)).toEqual(["turku-sign/0", "known"]);
  });

  it("sets the layer's visibility once, rather than leaving it to chance", () => {
    const host = createHost();
    const layer = openSignMarkerLayer({ sdk: host.sdk });

    layer.setVisible(false);
    expect(host.setLayerVisibility).toHaveBeenCalledWith({ layerName: LAYER, visibility: false });
    layer.setVisible(true);
    expect(host.setLayerVisibility).toHaveBeenLastCalledWith({ layerName: LAYER, visibility: true });
  });

  it("re-creates the layer only once, and re-draws cleanly on a later render", () => {
    const host = createHost();
    const layer = openSignMarkerLayer({ sdk: host.sdk });

    layer.setVisible(true);
    layer.render([sign("1", 22.2, 60.4)]);
    layer.render([sign("2", 22.2, 60.4)]);

    expect(host.addLayer).toHaveBeenCalledTimes(1);
    expect(host.removeAllFeaturesFromLayer).toHaveBeenCalledTimes(2);
    expect(features(host).map((feature) => feature.id)).toEqual(["1", "2"]);
  });
});

describe("Visual Overlay marker styling (AC-10)", () => {
  const iconRule = SIGN_MARKER_STYLE_RULES.find(
    (rule) => rule.predicate?.({ [MARKER_KIND_PROPERTY]: OFFICIAL_MARKER }, 0) === true,
  );
  const plateRule = SIGN_MARKER_STYLE_RULES.find(
    (rule) => rule.predicate?.({ [MARKER_KIND_PROPERTY]: FALLBACK_MARKER }, 0) === true,
  );

  it("renders the official SVG bare: no plate, no background, no category colour", () => {
    expect(iconRule?.style).toMatchObject({
      externalGraphic: "${getSignGraphic}",
      graphicWidth: 22,
      graphicHeight: 22,
    });
    // Only the neutral post sits behind the sign — never a symbolic fill,
    // stroke, point radius or label that would dress the sign up.
    expect(iconRule?.style.fill).toBeUndefined();
    expect(iconRule?.style.fillColor).toBeUndefined();
    expect(iconRule?.style.stroke).toBeUndefined();
    expect(iconRule?.style.pointRadius).toBeUndefined();
    expect(iconRule?.style.label).toBeUndefined();
    expect(iconRule?.style.backgroundGraphic).toMatch(/^data:image\/svg\+xml/);
  });

  it("anchors every marker on the thin neutral post, with a pointer cursor", () => {
    for (const style of [iconRule?.style, plateRule?.style]) {
      expect(style?.backgroundWidth).toBe(10);
      expect(style?.backgroundHeight).toBe(12);
      expect(style?.cursor).toBe("pointer");
    }
    // The icon rides above the post instead of straddling it.
    expect(iconRule?.style.graphicYOffset).toBe(-23);
  });

  it("routes each sign's graphic through the style context, pinned at the SHA", () => {
    const url = graphicFor("C38");
    expect(url).toContain("@35be7a6593e70c8ed5f4e3ef54372d69a3fef558/");
    expect(url).toContain("/new_signs/svg/C38.svg");
  });
});

describe("Visual Overlay missing-asset fallback (AC-11)", () => {
  const plateRule = SIGN_MARKER_STYLE_RULES.find(
    (rule) => rule.predicate?.({ [MARKER_KIND_PROPERTY]: FALLBACK_MARKER }, 0) === true,
  );
  const iconRule = SIGN_MARKER_STYLE_RULES.find(
    (rule) => rule.predicate?.({ [MARKER_KIND_PROPERTY]: OFFICIAL_MARKER }, 0) === true,
  );

  it("routes a sign with no official SVG to the code plate", () => {
    const host = createHost();
    openSignMarkerLayer({ sdk: host.sdk }).render([unmatchedSign()]);

    expect(features(host)[0]!.properties).toMatchObject({
      [MARKER_KIND_PROPERTY]: FALLBACK_MARKER,
      [SIGN_CODE_PROPERTY]: "990",
    });
    expect(plateRule?.style.externalGraphic).toBe("${getSignGraphic}");
  });

  it("keeps the fallback plate on the same post, sized to carry its code", () => {
    // Same post as the official icon, but a wider plate for code + sublabel.
    expect(plateRule?.style.backgroundGraphic).toBe(iconRule?.style.backgroundGraphic);
    expect(plateRule?.style.graphicWidth).toBe(32);
    expect(plateRule?.style.graphicHeight).toBe(22);
  });

  it("invents no substitute icon and hides no sign", () => {
    const host = createHost();
    openSignMarkerLayer({ sdk: host.sdk }).render([unmatchedSign(), sign("matched", 22.2, 60.4)]);

    expect(features(host)).toHaveLength(2);
    const graphic = graphicFor("990");
    expect(graphic).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(graphic)).toContain(">990<");
    expect(decodeURIComponent(graphic)).toContain(">no icon<");
  });
});
