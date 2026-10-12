import type { WmeSDK } from "wme-sdk-typings";

/** What the marker pointer needs: hover events, and the element that wears the cursor. */
export interface MarkerPointerDeps {
  /** `sdk.Events` — hover events for the layers the SDK tracks. */
  Events: WmeSDK["Events"];
  /** `sdk.Map.getMapViewportElement` — throws when WME has no map element yet. */
  mapViewportElement: () => HTMLElement;
}

/**
 * The pointer over markers (AC-10).
 *
 * `FeatureStyle.cursor` cannot deliver this. The vocabulary is OL2's, and OL2
 * applies a per-feature cursor only in the SVG renderer; SDK layers draw on the
 * Canvas renderer, where the whole layer is one canvas and no per-feature
 * cursor can exist. The SDK exposes no cursor API either — only hover events
 * and the map's viewport element. So the pointer is driven from the SDK's own
 * hover events instead: renderer-independent, and nothing outside documented
 * SDK surface.
 */
export interface MarkerPointer {
  /** Subscribes to a layer's hover events. Idempotent per layer name. */
  start(layerName: string): void;
  /**
   * Drops the pointer, restoring whatever was there before. Hiding the layer
   * while the pointer sits on a marker would otherwise strand it.
   */
  clear(): void;
}

const POINTER_CURSOR = "pointer";
const MOUSE_ENTER_EVENT = "wme-layer-feature-mouse-enter";
const MOUSE_LEAVE_EVENT = "wme-layer-feature-mouse-leave";

export function openMarkerPointer(deps: MarkerPointerDeps): MarkerPointer {
  let trackedLayerName: string | null = null;
  let unsubscribers: Array<() => void> = [];
  /** Markers under the pointer, so leaving one for its neighbour can't strand it. */
  let hovering = 0;
  let cursorBefore = "";

  return { start, clear };

  function start(layerName: string): void {
    if (trackedLayerName === layerName) return;
    stopTracking();
    trackedLayerName = layerName;
    // Hover events fire only for layers the SDK is tracking; without this the
    // pointer never moves.
    deps.Events.trackLayerEvents({ layerName });
    unsubscribers = [
      deps.Events.on({ eventName: MOUSE_ENTER_EVENT, eventHandler: onHoverEnter }),
      deps.Events.on({ eventName: MOUSE_LEAVE_EVENT, eventHandler: onHoverLeave }),
    ];
  }

  function clear(): void {
    hovering = 0;
    restoreCursor();
  }

  function onHoverEnter(payload: { layerName: string }): void {
    if (payload.layerName !== trackedLayerName) return;
    if (hovering === 0) cursorBefore = currentCursor();
    hovering += 1;
    const element = mapElement();
    if (element !== null) element.style.cursor = POINTER_CURSOR;
  }

  function onHoverLeave(payload: { layerName: string }): void {
    if (payload.layerName !== trackedLayerName) return;
    hovering = Math.max(0, hovering - 1);
    if (hovering === 0) restoreCursor();
  }

  function stopTracking(): void {
    for (const unsubscribe of unsubscribers) {
      try {
        unsubscribe();
      } catch {
        // The SDK throws InvalidStateError when a callback was already
        // unregistered; there is nothing left to undo in that case.
      }
    }
    unsubscribers = [];
    if (trackedLayerName !== null) {
      hovering = 0;
      restoreCursor();
    }
    trackedLayerName = null;
  }

  function currentCursor(): string {
    return mapElement()?.style.cursor ?? "";
  }

  function restoreCursor(): void {
    const element = mapElement();
    if (element !== null) element.style.cursor = cursorBefore;
  }

  function mapElement(): HTMLElement | null {
    try {
      return deps.mapViewportElement() ?? null;
    } catch {
      // MissingElementError: WME has no map element yet. The pointer is
      // cosmetic, so an absent map element is never worth failing a hover over.
      return null;
    }
  }
}
