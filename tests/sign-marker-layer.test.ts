import { describe, expect, it, vi } from "vite-plus/test";

import type { SdkFeature, WmeSDK } from "wme-sdk-typings";

import { SIGN_LAYER_NAME } from "../src/constants";
import type { TrafficSign } from "../src/data/traffic-sign";
import { SIGN_ICON_SIZE } from "../src/visual-overlay/marker-graphics";
import {
  FALLBACK_MARKER,
  MARKER_KIND_PROPERTY,
  MARKER_ICON_Y_OFFSET_PROPERTY,
  MARKER_POST_HAS_SHADOW_PROPERTY,
  MARKER_POST_HEIGHT_PROPERTY,
  MARKER_POST_SHADOW_AT_TOP_PROPERTY,
  MARKER_POST_Y_OFFSET_PROPERTY,
  OFFICIAL_MARKER,
  SIGN_GRAPHIC_Y_OFFSET_CONTEXT_KEY,
  SIGN_CODE_PROPERTY,
  SIGN_GRAPHIC_CONTEXT_KEY,
  SIGN_POST_GRAPHIC_CONTEXT_KEY,
  SIGN_POST_HEIGHT_CONTEXT_KEY,
  SIGN_POST_Y_OFFSET_CONTEXT_KEY,
  SIGN_MARKER_STYLE_CONTEXT,
  SIGN_MARKER_STYLE_RULES,
} from "../src/visual-overlay/marker-style";
import { openSignMarkerLayer } from "../src/visual-overlay/sign-marker-layer";
import { createFakeEventBus, createFakeMapSurface } from "./support/fake-wme-sdk";
import { sign } from "./support/turku-sign";

const LAYER = SIGN_LAYER_NAME;
/** Rule order is the priority: the plate rule first, the bare-icon catch-all last. */
const [plateRule, iconRule] = SIGN_MARKER_STYLE_RULES;

function createHost() {
  const mapSurface = createFakeMapSurface();
  const events = createFakeEventBus();
  return { ...mapSurface, Events: events as unknown as WmeSDK["Events"], events };
}

function features(host: ReturnType<typeof createHost>): SdkFeature[] {
  return host.addFeatureToLayer.mock.calls.map(([{ feature }]) => feature);
}

/** The graphic the style context resolves for one sign code. */
function graphicFor(signCode: string): string {
  const graphic = SIGN_MARKER_STYLE_CONTEXT[SIGN_GRAPHIC_CONTEXT_KEY]!({
    feature: { properties: { [SIGN_CODE_PROPERTY]: signCode } },
  } as never);
  expect(typeof graphic).toBe("string");
  return graphic as string;
}

/** A sign the pinned collection has no SVG for → plate. */
function unmatchedSign(): TrafficSign {
  return sign("990", 22.27, 60.45, { signCode: "990" });
}

describe("Visual Overlay marker layer (AC-9)", () => {
  it("keeps the captured H23.1 and B5 markers from occupying the same screen area", () => {
    const host = createHost();
    const extent = [22.264443876265606, 60.46130271478339, 22.265238480685568, 60.46170338718052];
    host.getMapExtent.mockReturnValue(extent);
    vi.spyOn(host.getMapViewportElement(), "getBoundingClientRect").mockReturnValue({
      width: 1185,
      height: 1212,
    } as DOMRect);
    openSignMarkerLayer({ sdk: host }).render([
      sign("320960333", 22.264860598507497, 60.461534953264746, { signCode: "H23.1" }),
      sign("320960332", 22.2648600526969, 60.46153497718211, { signCode: "B5" }),
    ]);

    const rendered = features(host);
    const [first, second] = rendered.map((feature) => {
      expect(feature.geometry.type).toBe("Point");
      if (feature.geometry.type !== "Point") throw new Error("Expected a point feature");
      return feature.geometry.coordinates;
    });
    // Captured from issue #22 at zoom 21. Convert the WGS84 coordinates to the
    // viewport's CSS-pixel grid; these two official icons are both 22px wide.
    const width = 1185;
    const height = 1212;
    const pixel = (coordinates: readonly number[]) => ({
      x: ((coordinates[0]! - extent[0]!) / (extent[2]! - extent[0]!)) * width,
      y: ((extent[3]! - coordinates[1]!) / (extent[3]! - extent[1]!)) * height,
    });
    const center = (index: number, coordinates: readonly number[]) => {
      const yOffset = SIGN_MARKER_STYLE_CONTEXT[SIGN_GRAPHIC_Y_OFFSET_CONTEXT_KEY]!({
        feature: { properties: rendered[index]!.properties },
        zoomLevel: 21,
      } as never);
      expect(typeof yOffset).toBe("number");
      return { ...pixel(coordinates), y: pixel(coordinates).y + Number(yOffset) };
    };
    const firstPixel = center(0, first!);
    const secondPixel = center(1, second!);

    expect(
      Math.abs(firstPixel.x - secondPixel.x) >= SIGN_ICON_SIZE ||
        Math.abs(firstPixel.y - secondPixel.y) >= SIGN_ICON_SIZE,
    ).toBe(true);

    const markerPixels = [firstPixel, secondPixel];
    const postRanges = rendered.map((feature, index) => {
      const contextValue = (key: string) =>
        SIGN_MARKER_STYLE_CONTEXT[key]!({
          feature: { properties: feature.properties },
          zoomLevel: 21,
        } as never);
      const postHeight = Number(contextValue(SIGN_POST_HEIGHT_CONTEXT_KEY));
      const postYOffset = Number(contextValue(SIGN_POST_Y_OFFSET_CONTEXT_KEY));
      const anchorY = pixel(feature.geometry.coordinates as readonly number[]).y;
      return {
        top: anchorY + postYOffset - postHeight / 2,
        bottom: anchorY + postYOffset + postHeight / 2,
        index,
      };
    });
    for (const post of postRanges) {
      for (const [siblingIndex, marker] of markerPixels.entries()) {
        if (post.index === siblingIndex) continue;
        const horizontalOverlap = Math.abs(markerPixels[post.index]!.x - marker.x) < SIGN_ICON_SIZE;
        const iconTop = marker.y - SIGN_ICON_SIZE / 2;
        const iconBottom = marker.y + SIGN_ICON_SIZE / 2;
        const verticalOverlap = post.top < iconBottom && post.bottom > iconTop;
        expect(horizontalOverlap && verticalOverlap).toBe(false);
      }
    }
    expect(rendered.map((feature) => feature.geometry.coordinates)).toEqual([first, second]);
  });

  it("recalculates marker offsets when the map viewport changes", () => {
    const host = createHost();
    const viewport = host.getMapViewportElement();
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      width: 1185,
      height: 1212,
    } as DOMRect);
    host.getMapExtent.mockReturnValue([
      22.264443876265606, 60.46130271478339, 22.265238480685568, 60.46170338718052,
    ]);
    const layer = openSignMarkerLayer({ sdk: host });
    layer.render([
      sign("320960333", 22.264860598507497, 60.461534953264746, { signCode: "H23.1" }),
      sign("320960332", 22.2648600526969, 60.46153497718211, { signCode: "B5" }),
    ]);
    host.addFeatureToLayer.mockClear();

    host.getMapExtent.mockReturnValue([22.264859, 60.461534, 22.264862, 60.461536]);
    host.events.emit("wme-map-move-end", undefined);

    expect(host.removeAllFeaturesFromLayer).toHaveBeenCalledTimes(2);
    expect(features(host)).toHaveLength(2);
    expect(
      features(host).map((feature) => feature.properties?.[MARKER_ICON_Y_OFFSET_PROPERTY]),
    ).toEqual([-23, -23]);
  });

  it("creates exactly one SDK marker layer, with the overlay's styling", () => {
    const host = createHost();
    openSignMarkerLayer({ sdk: host }).setVisible(true);

    expect(host.addLayer).toHaveBeenCalledTimes(1);
    const args = host.addLayer.mock.calls[0]![0]!;
    expect(args.layerName).toBe(LAYER);
    expect(args.styleRules).toEqual([...SIGN_MARKER_STYLE_RULES]);
    expect(args.styleContext).toBe(SIGN_MARKER_STYLE_CONTEXT);
    expect(args.zIndexing).toBe(true);
  });

  it("adds one feature per sign, at its WGS84 point, with no reprojection", () => {
    const host = createHost();
    const signs = [sign("1", 22.27617187661397, 60.443853785959234), sign("2", 22.1, 60.4)];
    openSignMarkerLayer({ sdk: host }).render(signs);

    expect(host.addFeatureToLayer.mock.calls.map(([{ layerName }]) => layerName)).toEqual([
      LAYER,
      LAYER,
    ]);
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
    openSignMarkerLayer({ sdk: host }).render([sign("", 22.2, 60.4), sign("known", 22.2, 60.41)]);

    expect(features(host).map((feature) => feature.id)).toEqual(["turku-sign/0", "known"]);
  });

  it("sets the layer's visibility once, rather than leaving it to chance", () => {
    const host = createHost();
    const layer = openSignMarkerLayer({ sdk: host });

    layer.setVisible(false);
    expect(host.setLayerVisibility).toHaveBeenCalledWith({ layerName: LAYER, visibility: false });
    layer.setVisible(true);
    expect(host.setLayerVisibility).toHaveBeenLastCalledWith({
      layerName: LAYER,
      visibility: true,
    });
  });

  it("filters marker features by sign-code category, not localized sign name", () => {
    const host = createHost();
    const layer = openSignMarkerLayer({ sdk: host });
    layer.render([
      sign("speed", 22.25, 60.45, { signCode: "C32_2", signName: "Pysäköinti kielletty" }),
      sign("parking", 22.26, 60.45, { signCode: "C38", signName: "No speed limit" }),
      sign("priority", 22.27, 60.45, { signCode: "B1" }),
    ]);

    host.addFeatureToLayer.mockClear();
    layer.setCategoryFilter(["speed-limits"]);

    expect(features(host).map((feature) => feature.id)).toEqual(["speed"]);
  });

  it("re-creates the layer only once, and re-draws cleanly on a later render", () => {
    const host = createHost();
    const layer = openSignMarkerLayer({ sdk: host });

    layer.setVisible(true);
    layer.render([sign("1", 22.2, 60.4)]);
    layer.render([sign("2", 22.2, 60.4)]);

    expect(host.addLayer).toHaveBeenCalledTimes(1);
    expect(host.removeAllFeaturesFromLayer).toHaveBeenCalledTimes(2);
    expect(features(host).map((feature) => feature.id)).toEqual(["1", "2"]);
  });

  it("starts tracking the layer's hover events, so the pointer can move", () => {
    const host = createHost();
    openSignMarkerLayer({ sdk: host }).setVisible(true);

    expect(host.events.trackLayerEvents).toHaveBeenCalledTimes(1);
    expect(host.events.trackLayerEvents).toHaveBeenCalledWith({ layerName: LAYER });
  });

  it("drops the pointer when the layer is hidden, so it can't strand on empty map", () => {
    const host = createHost();
    const mapElement = host.getMapViewportElement();
    mapElement.style.cursor = "crosshair";
    const layer = openSignMarkerLayer({ sdk: host });

    layer.setVisible(true);
    host.events.emit("wme-layer-feature-mouse-enter", { layerName: LAYER, featureId: "1" });
    expect(mapElement.style.cursor).toBe("pointer");

    layer.setVisible(false);
    expect(mapElement.style.cursor).toBe("crosshair");
  });
});

describe("Visual Overlay marker styling (AC-10)", () => {
  it("renders the official SVG bare: no plate, no background, no category colour", () => {
    expect(iconRule!.style).toMatchObject({
      externalGraphic: "${getSignGraphic}",
      graphicWidth: 22,
      graphicHeight: 22,
    });
    // Only the neutral post sits behind the sign — never a symbolic fill,
    // stroke, point radius or label that would dress the sign up.
    expect(iconRule!.style.fill).toBeUndefined();
    expect(iconRule!.style.fillColor).toBeUndefined();
    expect(iconRule!.style.stroke).toBeUndefined();
    expect(iconRule!.style.pointRadius).toBeUndefined();
    expect(iconRule!.style.label).toBeUndefined();
    expect(iconRule!.style.backgroundGraphic).toBe("${getSignPostGraphic}");
  });

  it("anchors every marker on the thin neutral post, with a pointer cursor", () => {
    for (const style of [iconRule!.style, plateRule!.style]) {
      expect(style.backgroundWidth).toBe(10);
      expect(style.backgroundHeight).toBe("${getSignPostHeight}");
      expect(style.backgroundYOffset).toBe("${getSignPostYOffset}");
      expect(style.cursor).toBe("pointer");
    }
    // The icon rides above the post instead of straddling it.
    expect(iconRule!.style.graphicYOffset).toBe("${getSignGraphicYOffset}");
    expect(
      SIGN_MARKER_STYLE_CONTEXT[SIGN_GRAPHIC_Y_OFFSET_CONTEXT_KEY]!({
        feature: { properties: {} },
        zoomLevel: 21,
      } as never),
    ).toBe(-23);
  });

  it("resolves short connector segments between stacked icons", () => {
    const feature = {
      properties: {
        [MARKER_ICON_Y_OFFSET_PROPERTY]: -49,
        [MARKER_POST_HEIGHT_PROPERTY]: 6,
        [MARKER_POST_Y_OFFSET_PROPERTY]: -36,
        [MARKER_POST_SHADOW_AT_TOP_PROPERTY]: 0,
        [MARKER_POST_HAS_SHADOW_PROPERTY]: 0,
      },
    };
    const styleContext = SIGN_MARKER_STYLE_CONTEXT;
    const context = (key: string) => styleContext[key]!({ feature } as never);

    expect(context(SIGN_GRAPHIC_Y_OFFSET_CONTEXT_KEY)).toBe(-49);
    expect(context(SIGN_POST_HEIGHT_CONTEXT_KEY)).toBe(6);
    expect(context(SIGN_POST_Y_OFFSET_CONTEXT_KEY)).toBe(-36);
    const post = decodeURIComponent(String(context(SIGN_POST_GRAPHIC_CONTEXT_KEY)));
    expect(post).toContain('height="6"');
    expect(post).toContain('<rect x="4" y="0" width="2" height="6"');
    expect(post).not.toContain("radialGradient");

    const belowPoint = {
      properties: {
        [MARKER_ICON_Y_OFFSET_PROPERTY]: 23,
        [MARKER_POST_HEIGHT_PROPERTY]: 12,
        [MARKER_POST_Y_OFFSET_PROPERTY]: 6,
        [MARKER_POST_SHADOW_AT_TOP_PROPERTY]: 1,
        [MARKER_POST_HAS_SHADOW_PROPERTY]: 1,
      },
    };
    const downContext = (key: string) => styleContext[key]!({ feature: belowPoint } as never);
    expect(downContext(SIGN_POST_HEIGHT_CONTEXT_KEY)).toBe(12);
    expect(downContext(SIGN_POST_Y_OFFSET_CONTEXT_KEY)).toBe(6);
    expect(decodeURIComponent(String(downContext(SIGN_POST_GRAPHIC_CONTEXT_KEY)))).toContain(
      'cy="1.4"',
    );
  });

  it("routes each sign's graphic through the style context, pinned at the SHA", () => {
    expect(graphicFor("C38")).toContain("@35be7a6593e70c8ed5f4e3ef54372d69a3fef558/");
    expect(graphicFor("C38")).toContain("/new_signs/svg/C38.svg");
  });

  it("keeps the bare-icon rule a catch-all, so no marker can fall through unstyled", () => {
    expect(iconRule!.predicate).toBeUndefined();
    // The plate rule, applied first, only claims signs with no official SVG.
    expect(plateRule!.predicate?.({ [MARKER_KIND_PROPERTY]: FALLBACK_MARKER }, 0)).toBe(true);
    expect(plateRule!.predicate?.({ [MARKER_KIND_PROPERTY]: OFFICIAL_MARKER }, 0)).toBe(false);
    expect(plateRule!.predicate?.({}, 0)).toBe(false);
  });
});

describe("Visual Overlay missing-asset fallback (AC-11)", () => {
  it("routes a sign with no official SVG to the code plate", () => {
    const host = createHost();
    openSignMarkerLayer({ sdk: host }).render([unmatchedSign()]);

    expect(features(host)[0]!.properties).toMatchObject({
      [MARKER_KIND_PROPERTY]: FALLBACK_MARKER,
      [SIGN_CODE_PROPERTY]: "990",
    });
    expect(plateRule!.style.externalGraphic).toBe("${getSignGraphic}");
  });

  it("keeps the fallback plate on the same post, sized to carry its code", () => {
    // Same post as the official icon, but a wider plate for code + sublabel.
    expect(plateRule!.style.backgroundGraphic).toBe(iconRule!.style.backgroundGraphic);
    expect(plateRule!.style.graphicWidth).toBe(32);
    expect(plateRule!.style.graphicHeight).toBe(22);
  });

  it("invents no substitute icon and hides no sign", () => {
    const host = createHost();
    openSignMarkerLayer({ sdk: host }).render([unmatchedSign(), sign("matched", 22.2, 60.4)]);

    expect(features(host)).toHaveLength(2);
    const graphic = graphicFor("990");
    expect(graphic).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(graphic)).toContain(">990<");
    expect(decodeURIComponent(graphic)).toContain(">no icon<");
  });
});
