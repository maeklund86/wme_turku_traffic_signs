import { vi } from "vitest";

import type { SdkFeature } from "wme-sdk-typings";

import { TURKU_EXTENT } from "../../src/constants";

/** Events the fake SDK is allowed to hand out; anything else is a wiring mistake. */
const SUPPORTED_EVENTS = [
  "wme-ready",
  "wme-layer-feature-mouse-enter",
  "wme-layer-feature-mouse-leave",
] as const;

/**
 * The SDK marker-layer surface the Visual Overlay drives, as spies. The spies
 * are exposed both nested under `Map` (the shape `sdk.Map` presents) and flat,
 * so tests can pass the whole object as a stand-in SDK and still assert on the
 * calls directly.
 */
export function createFakeMapSurface(mapElement: HTMLElement | (() => never) = document.createElement("div")) {
  const addLayer = vi.fn();
  const addFeatureToLayer = vi.fn((args: { layerName: string; feature: SdkFeature }) => args.feature);
  const removeAllFeaturesFromLayer = vi.fn();
  const setLayerVisibility = vi.fn();
  const getMapViewportElement = vi.fn(() =>
    typeof mapElement === "function" ? mapElement() : mapElement,
  );
  /** Defaults to a viewport inside the Turku coverage extent; override per test. */
  const getMapExtent = vi.fn((): number[] => [...TURKU_EXTENT]);
  return {
    Map: { addLayer, addFeatureToLayer, removeAllFeaturesFromLayer, setLayerVisibility, getMapViewportElement, getMapExtent },
    addLayer,
    addFeatureToLayer,
    removeAllFeaturesFromLayer,
    setLayerVisibility,
    getMapViewportElement,
    getMapExtent,
  };
}

/**
 * A stand-in for `sdk.Events`: subscriptions per event name, plus an `emit` so
 * tests can fire hover events. `unsubscribe` mirrors the SDK, which throws when
 * a callback was already unregistered.
 */
export function createFakeEventBus() {
  const handlers = new Map<string, Array<(payload: unknown) => void>>();
  const trackLayerEvents = vi.fn();
  return {
    trackLayerEvents,
    on: vi.fn((args: { eventName: string; eventHandler: (payload: unknown) => void }) => {
      if (!SUPPORTED_EVENTS.includes(args.eventName as (typeof SUPPORTED_EVENTS)[number])) {
        throw new Error(`unexpected event: ${args.eventName}`);
      }
      const registered = handlers.get(args.eventName) ?? [];
      registered.push(args.eventHandler);
      handlers.set(args.eventName, registered);
      return () => {
        const current = handlers.get(args.eventName) ?? [];
        handlers.set(
          args.eventName,
          current.filter((handler) => handler !== args.eventHandler),
        );
      };
    }),
    emit: (eventName: string, payload: unknown): void => {
      for (const handler of [...(handlers.get(eventName) ?? [])]) handler(payload);
    },
  };
}

/**
 * Structural stand-in for the SDK surface the bootstrap ticket uses:
 * Sidebar.registerScriptTab (real DOM elements), the wme-ready event bus, and
 * the marker-layer spy surface. The Map spies come from `createFakeMapSurface`
 * so the bootstrap and Visual Overlay tests drive the same seam.
 */
export function createFakeWmeSdk() {
  const sidebarHost = document.createElement("div");
  document.body.appendChild(sidebarHost);
  const registerScriptTab = vi.fn(async () => {
    const tabLabel = document.createElement("span");
    const tabPane = document.createElement("div");
    sidebarHost.append(tabLabel, tabPane);
    return { tabLabel, tabPane };
  });
  const mapSurface = createFakeMapSurface();
  const eventBus = createFakeEventBus();
  const wmeReadyHandlers: Array<(payload: unknown) => void> = [];
  /** A spy, not a stub: the tests assert it is never called (AC-12). */
  const addLayerCheckbox = vi.fn();
  const sdk = {
    Sidebar: { registerScriptTab },
    Map: mapSurface.Map,
    LayerSwitcher: { addLayerCheckbox },
    Events: {
      on: (args: { eventName: string; eventHandler: (payload: unknown) => void }) => {
        if (args.eventName === "wme-ready") wmeReadyHandlers.push(args.eventHandler);
        return eventBus.on(args);
      },
      trackLayerEvents: eventBus.trackLayerEvents,
    },
  };
  return {
    sdk,
    registerScriptTab,
    map: mapSurface.Map,
    layerSwitcher: { addLayerCheckbox },
    events: eventBus,
    emitWmeReady: () => {
      for (const handler of wmeReadyHandlers) handler(undefined);
    },
    /** Fires a layer hover event, as `sdk.Events` would for a tracked layer. */
    emitFeatureHover: (eventName: "wme-layer-feature-mouse-enter" | "wme-layer-feature-mouse-leave", payload: unknown) => {
      eventBus.emit(eventName, payload);
    },
  };
}
