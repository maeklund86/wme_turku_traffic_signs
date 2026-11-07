import type {
  AsyncWmeSDK,
  SdkFeature,
  SdkFeatureStyleContext,
  SdkFeatureStyleRule,
} from "wme-sdk-typings";

import type { BoundingBox } from "../data/bounding-box";
import { buildSpatialIndex, type SpatialIndex } from "../data/spatial-index";
import { sameTrafficSign, type TrafficSign } from "../data/traffic-sign";
import { filterSignsBySelection, type SignFilterKey } from "../data/sign-categories";
import { SIGN_LAYER_NAME } from "../constants";
import {
  MARKER_KIND_PROPERTY,
  MARKER_ICON_Y_OFFSET_PROPERTY,
  MARKER_POST_HEIGHT_PROPERTY,
  MARKER_POST_Y_OFFSET_PROPERTY,
  MARKER_POST_SHADOW_AT_TOP_PROPERTY,
  MARKER_POST_HAS_SHADOW_PROPERTY,
  resolveSignMarkerGraphic,
  SIGN_CODE_PROPERTY,
  SIGN_MARKER_STYLE_CONTEXT,
  SIGN_MARKER_STYLE_RULES,
} from "./marker-style";
import { openMarkerPointer } from "./marker-pointer";
import { layoutMarkerIcons, type MarkerPlacement } from "./marker-layout";
import { SIGN_ICON_SIZE, SIGN_POST_CANVAS_HEIGHT } from "./marker-graphics";

const MARKER_QUERY_PADDING_PIXELS = 32;

/** The `sdk.Map` calls the Visual Overlay makes (spec §4.4, §7). */
export interface SignMarkerLayerMap {
  addLayer(args: {
    layerName: string;
    styleContext?: SdkFeatureStyleContext;
    styleRules?: SdkFeatureStyleRule[];
    zIndexing?: boolean;
  }): Promise<void>;
  addFeatureToLayer(args: { layerName: string; feature: SdkFeature }): Promise<void>;
  removeAllFeaturesFromLayer(args: { layerName: string }): Promise<void>;
  setLayerVisibility(args: { layerName: string; visibility: boolean }): Promise<void>;
  getMapExtent(): Promise<number[]>;
  /** The map element the marker pointer puts its cursor on (AC-10). */
  getMapViewportElement(): Promise<HTMLElement>;
}

export interface SignMarkerLayerDeps {
  /**
   * The WME SDK; only its `Map` and `Events` surfaces are ever touched.
   * `Events` remains synchronous in async mode, so keep the SDK's generic type.
   */
  sdk: { Map: SignMarkerLayerMap; Events: AsyncWmeSDK["Events"] };
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
  setVisible(visible: boolean): Promise<void>;
  /** Changes which category-tree branches render, without reloading the dataset. */
  setCategoryFilter(categoryFilter: readonly SignFilterKey[] | null): Promise<void>;
  /** Keeps marker visibility checks aligned with Sign Panel row selection. */
  setSelectedSign(sign: TrafficSign | null): void;
  /** Replaces the viewport's filtered markers, preserving each source coordinate. */
  render(signs: readonly TrafficSign[]): Promise<void>;
}

export function openSignMarkerLayer(deps: SignMarkerLayerDeps): SignMarkerLayer {
  const map = deps.sdk.Map;
  const markerPointer = openMarkerPointer({
    Events: deps.sdk.Events,
    mapViewportElement: () => deps.sdk.Map.getMapViewportElement(),
  });
  let layerCreated = false;
  let layerSetup: Promise<void> | null = null;
  let renderQueue: Promise<void> = Promise.resolve();
  let renderRequest = 0;
  let hasRendered = false;
  let renderedSigns: readonly TrafficSign[] = [];
  let renderedIndex: SpatialIndex = buildSpatialIndex([]);
  let renderedPositions = new Map<TrafficSign, number>();
  let categoryFilter: readonly SignFilterKey[] | null = null;
  let mapClickTimer: ReturnType<typeof setTimeout> | null = null;
  let markerClickAwaitingMapEvent = false;
  let selectedSign: TrafficSign | null = null;

  return { setVisible, setCategoryFilter, setSelectedSign, render };

  async function ensureLayer(): Promise<void> {
    if (layerCreated) return;
    layerSetup ??= (async () => {
      // Deliberately no sdk.LayerSwitcher.addLayerCheckbox here, or anywhere else:
      // the switcher entry is opt-in and the overlay's controls live in the Sign
      // Panel (AC-12).
      await map.addLayer({
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
      deps.sdk.Events.on({ eventName: "wme-map-move-end", eventHandler: onMapMoved });
    })();
    try {
      await layerSetup;
    } catch (error) {
      layerSetup = null;
      throw error;
    }
  }

  async function setVisible(visible: boolean): Promise<void> {
    await ensureLayer();
    // Set explicitly rather than trusting the default: whether a freshly added
    // layer starts visible is not documented (spec §4.4).
    await map.setLayerVisibility({ layerName: SIGN_LAYER_NAME, visibility: visible });
    // A marker the pointer was over a moment ago is gone; without this the
    // cursor stays a pointer over empty map (AC-10).
    if (!visible) await markerPointer.clear();
  }

  async function setCategoryFilter(filter: readonly SignFilterKey[] | null): Promise<void> {
    if (sameFilterSelection(categoryFilter, filter)) return;
    categoryFilter = filter;
    if (hasRendered) await renderVisibleSigns();
  }

  function setSelectedSign(sign: TrafficSign | null): void {
    selectedSign = sign;
  }

  async function render(signs: readonly TrafficSign[]): Promise<void> {
    renderedSigns = signs;
    renderedIndex = buildSpatialIndex(signs);
    renderedPositions = new Map(signs.map((sign, position) => [sign, position]));
    hasRendered = true;
    await renderVisibleSigns();
  }

  function onMapMoved(): void {
    if (hasRendered) {
      void renderVisibleSigns().catch((error: unknown) => {
        console.error("[turku-signs] Failed to render markers after map move", error);
      });
    }
  }

  function renderVisibleSigns(): Promise<void> {
    const request = ++renderRequest;
    const rendering = renderQueue.then(() => renderVisibleSignsNow(request));
    renderQueue = rendering.catch(() => undefined);
    return rendering;
  }

  async function renderVisibleSignsNow(request: number): Promise<void> {
    await ensureLayer();
    if (request !== renderRequest) return;
    // WME keeps the layer across a wme-ready, so a repeat render replaces the
    // markers instead of stacking a second set on top of the first.
    await map.removeAllFeaturesFromLayer({ layerName: SIGN_LAYER_NAME });
    if (request !== renderRequest) return;
    const rawExtent = await map.getMapExtent();
    if (request !== renderRequest) return;
    const extent = isBoundingBox(rawExtent) ? rawExtent : null;
    const viewport = await map.getMapViewportElement();
    if (request !== renderRequest) return;
    const viewportRect = viewport.getBoundingClientRect();
    const queryBounds =
      extent === null ? null : expandBounds(extent, viewportRect.width, viewportRect.height);
    const signsInView = queryBounds === null ? renderedSigns : renderedIndex.query(queryBounds);
    const visibleSigns = filterSignsBySelection(signsInView, categoryFilter);
    if (selectedSign !== null) {
      const visibleSelection = visibleSigns.find((sign) => sameTrafficSign(sign, selectedSign!));
      if (visibleSelection === undefined) {
        selectedSign = null;
        deps.onSelectionChange?.(null);
      } else if (selectedSign !== visibleSelection) {
        selectedSign = visibleSelection;
        deps.onSelectionChange?.(visibleSelection);
      }
    }
    const placements: readonly MarkerPlacement[] =
      extent === null
        ? visibleSigns.map(() => ({
            iconYOffset: -(SIGN_POST_CANVAS_HEIGHT + SIGN_ICON_SIZE / 2),
            postHeight: SIGN_POST_CANVAS_HEIGHT,
            postYOffset: -SIGN_POST_CANVAS_HEIGHT / 2,
            postShadowAtTop: false,
            postHasShadow: true,
          }))
        : layoutMarkerIcons(visibleSigns, {
            bounds: extent,
            width: viewportRect.width,
            height: viewportRect.height,
          });
    for (const [visiblePosition, sign] of visibleSigns.entries()) {
      if (request !== renderRequest) return;
      const position = renderedPositions.get(sign) ?? visiblePosition;
      // Coordinates go straight through: the Trimble OGC API serves GeoJSON
      // Point WGS84 and the SDK speaks WGS84, so there is nothing to reproject
      // (AC-9).
      const [longitude, latitude] = sign.coordinates;
      await map.addFeatureToLayer({
        layerName: SIGN_LAYER_NAME,
        feature: {
          type: "Feature",
          id: signFeatureId(sign, position),
          geometry: { type: "Point", coordinates: [longitude, latitude] },
          properties: {
            [SIGN_CODE_PROPERTY]: sign.signCode,
            [MARKER_KIND_PROPERTY]: resolveSignMarkerGraphic(sign.signCode).kind,
            [MARKER_ICON_Y_OFFSET_PROPERTY]: placements[visiblePosition]!.iconYOffset,
            [MARKER_POST_HEIGHT_PROPERTY]: placements[visiblePosition]!.postHeight,
            [MARKER_POST_Y_OFFSET_PROPERTY]: placements[visiblePosition]!.postYOffset,
            [MARKER_POST_SHADOW_AT_TOP_PROPERTY]: placements[visiblePosition]!.postShadowAtTop
              ? 1
              : 0,
            [MARKER_POST_HAS_SHADOW_PROPERTY]: placements[visiblePosition]!.postHasShadow ? 1 : 0,
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
    if (clickedSign !== undefined) {
      selectedSign = clickedSign;
      deps.onSelectionChange?.(clickedSign);
    }
  }

  function onMapClicked(): void {
    if (markerClickAwaitingMapEvent) {
      markerClickAwaitingMapEvent = false;
      return;
    }
    if (mapClickTimer !== null) clearTimeout(mapClickTimer);
    mapClickTimer = setTimeout(() => {
      mapClickTimer = null;
      selectedSign = null;
      deps.onSelectionChange?.(null);
    }, 0);
  }
}

function isBoundingBox(value: readonly number[]): value is BoundingBox {
  return value.length === 4 && value.every(Number.isFinite);
}

function expandBounds(bounds: BoundingBox, width: number, height: number): BoundingBox {
  const [left, bottom, right, top] = bounds;
  if (width <= 0 || height <= 0) return bounds;
  const longitudePadding = ((right - left) * MARKER_QUERY_PADDING_PIXELS) / width;
  const latitudePadding = ((top - bottom) * MARKER_QUERY_PADDING_PIXELS) / height;
  return [
    left - longitudePadding,
    bottom - latitudePadding,
    right + longitudePadding,
    top + latitudePadding,
  ];
}

function sameFilterSelection(
  left: readonly SignFilterKey[] | null,
  right: readonly SignFilterKey[] | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.length === right.length && left.every((category, index) => category === right[index]);
}

/** One marker per sign: the registry key when present, else a position-based id. */
function signFeatureId(sign: TrafficSign, position: number): string {
  return sign.key === "" ? `turku-sign/${position}` : sign.key;
}
