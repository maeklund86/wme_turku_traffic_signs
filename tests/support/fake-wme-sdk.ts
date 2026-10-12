import { vi } from "vitest";

import type { SdkFeature } from "wme-sdk-typings";

/**
 * Structural stand-in for the SDK surface the bootstrap ticket uses:
 * Sidebar.registerScriptTab (real DOM elements), the wme-ready event bus, the
 * marker-layer calls of the Visual Overlay, and a LayerSwitcher spy that must
 * stay untouched (AC-12).
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
  const addLayer = vi.fn();
  const addFeatureToLayer = vi.fn(({ feature }: { feature: SdkFeature }) => feature);
  const removeAllFeaturesFromLayer = vi.fn();
  const setLayerVisibility = vi.fn();
  /** A spy, not a stub: the tests assert it is never called (AC-12). */
  const addLayerCheckbox = vi.fn();
  const sdk = {
    Sidebar: { registerScriptTab },
    Map: { addLayer, addFeatureToLayer, removeAllFeaturesFromLayer, setLayerVisibility },
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
    map: { addLayer, addFeatureToLayer, removeAllFeaturesFromLayer, setLayerVisibility },
    layerSwitcher: { addLayerCheckbox },
    emitWmeReady: () => {
      for (const handler of wmeReadyHandlers) handler();
    },
  };
}
