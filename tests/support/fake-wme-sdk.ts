import { vi } from "vitest";

import type { SdkFeature } from "wme-sdk-typings";

/**
 * The SDK marker-layer surface the Visual Overlay drives, as spies. The spies
 * are exposed both nested under `Map` (the shape `sdk.Map` presents) and flat,
 * so tests can pass the whole object as a stand-in SDK and still assert on the
 * calls directly.
 */
export function createFakeMapSurface() {
  const addLayer = vi.fn();
  const addFeatureToLayer = vi.fn((args: { layerName: string; feature: SdkFeature }) => args.feature);
  const removeAllFeaturesFromLayer = vi.fn();
  const setLayerVisibility = vi.fn();
  return {
    Map: { addLayer, addFeatureToLayer, removeAllFeaturesFromLayer, setLayerVisibility },
    addLayer,
    addFeatureToLayer,
    removeAllFeaturesFromLayer,
    setLayerVisibility,
  };
}

/**
 * Structural stand-in for the SDK surface the bootstrap ticket uses:
 * Sidebar.registerScriptTab (real DOM elements) and the wme-ready event bus.
 * The marker-layer spies come from `createFakeMapSurface` so the bootstrap and
 * Visual Overlay tests drive the same seam.
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
  const wmeReadyHandlers: Array<() => void> = [];
  const map = createFakeMapSurface();
  /** A spy, not a stub: the tests assert it is never called (AC-12). */
  const addLayerCheckbox = vi.fn();
  const sdk = {
    Sidebar: { registerScriptTab },
    Map: map.Map,
    LayerSwitcher: { addLayerCheckbox },
    Events: {
      on: vi.fn(({ eventName, eventHandler }: { eventName: string; eventHandler: () => void }) => {
        if (eventName !== "wme-ready") throw new Error(`unexpected event: ${eventName}`);
        wmeReadyHandlers.push(eventHandler);
        return () => {};
      }),
    },
  };
  return {
    sdk,
    registerScriptTab,
    map,
    layerSwitcher: { addLayerCheckbox },
    emitWmeReady: () => {
      for (const handler of wmeReadyHandlers) handler();
    },
  };
}
