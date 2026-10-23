import type {
  SdkFeature,
  SdkFeatureStyleContext,
  SdkFeatureStyleRule,
  WmeSDK,
} from "wme-sdk-typings";

import type { TrafficSign } from "../data/traffic-sign";
import { filterSignsByCategories, type SignCategoryKey } from "../data/sign-categories";
import { SIGN_LAYER_NAME } from "../constants";
import {
  MARKER_KIND_PROPERTY,
  resolveSignMarkerGraphic,
  SIGN_CODE_PROPERTY,
  SIGN_MARKER_STYLE_CONTEXT,
  SIGN_MARKER_STYLE_RULES,
} from "./marker-style";
import { openMarkerPointer } from "./marker-pointer";

/** The `sdk.Map` calls the Visual Overlay makes (spec §4.4, §7). */
export interface SignMarkerLayerMap {
  addLayer(args: {
    layerName: string;
    styleContext?: SdkFeatureStyleContext;
    styleRules?: SdkFeatureStyleRule[];
    zIndexing?: boolean;
  }): void;
  addFeatureToLayer(args: { layerName: string; feature: SdkFeature }): void;
  removeAllFeaturesFromLayer(args: { layerName: string }): void;
  setLayerVisibility(args: { layerName: string; visibility: boolean }): void;
  /** The map element the marker pointer puts its cursor on (AC-10). */
  getMapViewportElement(): HTMLElement;
}

export interface SignMarkerLayerDeps {
  /**
   * The WME SDK; only its `Map` and `Events` surfaces are ever touched.
   * `Events` is the SDK's own type because its `on` is generic over the event
   * name and cannot be mirrored structurally.
   */
  sdk: { Map: SignMarkerLayerMap; Events: WmeSDK["Events"] };
  /** Reports map selection without touching WME's native editing selection. */
  onSelectionChange?: (sign: TrafficSign | null) => void;
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
  /** Changes which code-prefix categories render, without reloading the dataset. */
  setCategoryFilter(categoryFilter: readonly SignCategoryKey[] | null): void;
  /** Draws one marker per selected sign, replacing whatever was drawn before. */
  render(signs: readonly TrafficSign[]): void;
}

export function openSignMarkerLayer(deps: SignMarkerLayerDeps): SignMarkerLayer {
  const map = deps.sdk.Map;
  const markerPointer = openMarkerPointer({
    Events: deps.sdk.Events,
    mapViewportElement: () => deps.sdk.Map.getMapViewportElement(),
  });
  let layerCreated = false;
  let hasRendered = false;
  let renderedSigns: readonly TrafficSign[] = [];
  let categoryFilter: readonly SignCategoryKey[] | null = null;
  let mapClickTimer: ReturnType<typeof setTimeout> | null = null;
  let markerClickAwaitingMapEvent = false;

  return { setVisible, setCategoryFilter, render };

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
    markerPointer.start(SIGN_LAYER_NAME);
    deps.sdk.Events.on({
      eventName: "wme-layer-feature-clicked",
      eventHandler: onFeatureClicked,
    });
    deps.sdk.Events.on({ eventName: "wme-map-mouse-click", eventHandler: onMapClicked });
  }

  function setVisible(visible: boolean): void {
    ensureLayer();
    // Set explicitly rather than trusting the default: whether a freshly added
    // layer starts visible is not documented (spec §4.4).
    map.setLayerVisibility({ layerName: SIGN_LAYER_NAME, visibility: visible });
    // A marker the pointer was over a moment ago is gone; without this the
    // cursor stays a pointer over empty map (AC-10).
    if (!visible) markerPointer.clear();
  }

  function setCategoryFilter(filter: readonly SignCategoryKey[] | null): void {
    if (sameCategoryFilter(categoryFilter, filter)) return;
    categoryFilter = filter;
    if (hasRendered) renderVisibleSigns();
  }

  function render(signs: readonly TrafficSign[]): void {
    renderedSigns = signs;
    hasRendered = true;
    renderVisibleSigns();
  }

  function renderVisibleSigns(): void {
    ensureLayer();
    // WME keeps the layer across a wme-ready, so a repeat render replaces the
    // markers instead of stacking a second set on top of the first.
    map.removeAllFeaturesFromLayer({ layerName: SIGN_LAYER_NAME });
    const visibleSigns =
      categoryFilter === null
        ? null
        : new Set(filterSignsByCategories(renderedSigns, categoryFilter));
    for (const [position, sign] of renderedSigns.entries()) {
      if (visibleSigns !== null && !visibleSigns.has(sign)) continue;
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

  function onFeatureClicked(payload: { featureId: string | number; layerName: string }): void {
    if (payload.layerName !== SIGN_LAYER_NAME) return;
    if (mapClickTimer !== null) {
      clearTimeout(mapClickTimer);
      mapClickTimer = null;
    } else {
      // Every pointer click inside the map also emits wme-map-mouse-click. If
      // that generic event follows the feature event, consume it regardless of
      // which task delivers it rather than clearing this marker selection.
      markerClickAwaitingMapEvent = true;
    }
    const clickedSign = renderedSigns.find(
      (sign, position) => signFeatureId(sign, position) === String(payload.featureId),
    );
    if (clickedSign !== undefined) deps.onSelectionChange?.(clickedSign);
  }

  function onMapClicked(): void {
    if (markerClickAwaitingMapEvent) {
      markerClickAwaitingMapEvent = false;
      return;
    }
    if (mapClickTimer !== null) clearTimeout(mapClickTimer);
    mapClickTimer = setTimeout(() => {
      mapClickTimer = null;
      deps.onSelectionChange?.(null);
    }, 0);
  }
}

function sameCategoryFilter(
  left: readonly SignCategoryKey[] | null,
  right: readonly SignCategoryKey[] | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.length === right.length && left.every((category, index) => category === right[index]);
}

/** One marker per sign: the registry key when present, else a position-based id. */
function signFeatureId(sign: TrafficSign, position: number): string {
  return sign.key === "" ? `turku-sign/${position}` : sign.key;
}
