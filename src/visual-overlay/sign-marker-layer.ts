import type { SdkFeature, SdkFeatureStyleContext, SdkFeatureStyleRule } from "wme-sdk-typings";

import type { TrafficSign } from "../data/traffic-sign";
import { SIGN_LAYER_NAME } from "../constants";
import {
  MARKER_KIND_PROPERTY,
  resolveSignMarkerGraphic,
  SIGN_CODE_PROPERTY,
  SIGN_MARKER_STYLE_CONTEXT,
  SIGN_MARKER_STYLE_RULES,
} from "./marker-style";

/** The `sdk.Map` calls the Visual Overlay makes (spec §4.4, §7). */
export interface SignMarkerLayerHost {
  addLayer(args: {
    layerName: string;
    styleContext?: SdkFeatureStyleContext;
    styleRules?: SdkFeatureStyleRule[];
    zIndexing?: boolean;
  }): void;
  addFeatureToLayer(args: { layerName: string; feature: SdkFeature }): void;
  removeAllFeaturesFromLayer(args: { layerName: string }): void;
  setLayerVisibility(args: { layerName: string; visibility: boolean }): void;
}

export interface SignMarkerLayerDeps {
  /** The WME SDK; only its `Map` surface is ever touched. */
  sdk: { Map: SignMarkerLayerHost };
}

/**
 * The script's one marker layer: it renders the Visual Overlay and nothing
 * else. It deliberately never reaches for `sdk.LayerSwitcher` — not calling
 * `addLayerCheckbox` is what keeps the layer out of WME's LayerSwitcher while
 * it still draws (AC-12).
 */
export interface SignMarkerLayer {
  /** Creates the layer on first use, then re-applies the visibility flag. */
  setVisible(visible: boolean): void;
  /** Draws one marker per sign, replacing whatever was drawn before. */
  render(signs: readonly TrafficSign[]): void;
}

export function openSignMarkerLayer(deps: SignMarkerLayerDeps): SignMarkerLayer {
  const map = deps.sdk.Map;
  let layerCreated = false;

  return { setVisible, render };

  function ensureLayer(): void {
    if (layerCreated) return;
    // Deliberately no sdk.LayerSwitcher.addLayerCheckbox here, or anywhere else:
    // the switcher entry is opt-in and the overlay's controls live in the Sign
    // Panel (AC-12).
    map.addLayer({
      layerName: SIGN_LAYER_NAME,
      styleContext: SIGN_MARKER_STYLE_CONTEXT,
      // A fresh array per layer: the SDK entry point takes a mutable one.
      styleRules: [...SIGN_MARKER_STYLE_RULES],
      zIndexing: true,
    });
    layerCreated = true;
  }

  function setVisible(visible: boolean): void {
    ensureLayer();
    // Set explicitly rather than trusting the default: whether a freshly added
    // layer starts visible is not documented (spec §4.4).
    map.setLayerVisibility({ layerName: SIGN_LAYER_NAME, visibility: visible });
  }

  function render(signs: readonly TrafficSign[]): void {
    ensureLayer();
    // WME keeps the layer across a wme-ready, so a repeat render replaces the
    // markers instead of stacking a second set on top of the first.
    map.removeAllFeaturesFromLayer({ layerName: SIGN_LAYER_NAME });
    for (const [position, sign] of signs.entries()) {
      // Coordinates go straight through: the Trimble OGC API serves GeoJSON
      // Point WGS84 and the SDK speaks WGS84, so there is nothing to reproject
      // (AC-9).
      const [longitude, latitude] = sign.coordinates;
      map.addFeatureToLayer({
        layerName: SIGN_LAYER_NAME,
        feature: {
          type: "Feature",
          id: signFeatureId(sign, position),
          geometry: { type: "Point", coordinates: [longitude, latitude] },
          properties: {
            [SIGN_CODE_PROPERTY]: sign.signCode,
            [MARKER_KIND_PROPERTY]: resolveSignMarkerGraphic(sign.signCode).kind,
          },
        },
      });
    }
  }
}

/** One marker per sign: the registry key when present, else a position-based id. */
function signFeatureId(sign: TrafficSign, position: number): string {
  return sign.key === "" ? `turku-sign/${position}` : sign.key;
}
