import { describe, expect, it, vi } from "vitest";

import type { WmeSDK } from "wme-sdk-typings";

import { openMarkerPointer } from "../src/visual-overlay/marker-pointer";
import { createFakeEventBus } from "./support/fake-wme-sdk";

const LAYER = "turku_traffic_signs";
const OTHER_LAYER = "someone_elses_layer";

function createHost(mapElement: () => HTMLElement = () => document.createElement("div")) {
  const events = createFakeEventBus();
  return {
    deps: { Events: events as unknown as WmeSDK["Events"], mapViewportElement: mapElement },
    events,
  };
}

function enter(host: ReturnType<typeof createHost>, layerName = LAYER): void {
  host.events.emit("wme-layer-feature-mouse-enter", { layerName, featureId: "1" });
}

function leave(host: ReturnType<typeof createHost>, layerName = LAYER): void {
  host.events.emit("wme-layer-feature-mouse-leave", { layerName, featureId: "1" });
}

/** The SDK throws MissingElementError when WME has no map element yet. */
function mapElementThatThrows(): () => never {
  return () => {
    throw new Error("MissingElementError");
  };
}
describe("marker pointer (AC-10)", () => {
  it("shows a pointer over a marker", () => {
    const mapElement = document.createElement("div");
    mapElement.style.cursor = "";
    const host = createHost(() => mapElement);
    openMarkerPointer(host.deps).start(LAYER);

    enter(host);
    expect(mapElement.style.cursor).toBe("pointer");
  });

  it("restores the map's own cursor when the pointer leaves", () => {
    const mapElement = document.createElement("div");
    mapElement.style.cursor = "crosshair";
    const host = createHost(() => mapElement);
    openMarkerPointer(host.deps).start(LAYER);

    enter(host);
    leave(host);
    expect(mapElement.style.cursor).toBe("crosshair");
  });

  it("holds the pointer across adjacent markers instead of stranding it", () => {
    const mapElement = document.createElement("div");
    mapElement.style.cursor = "crosshair";
    const host = createHost(() => mapElement);
    openMarkerPointer(host.deps).start(LAYER);

    enter(host);
    // Moving straight from one marker to the next: enter arrives before leave.
    enter(host);
    leave(host);
    expect(mapElement.style.cursor).toBe("pointer");
    leave(host);
    expect(mapElement.style.cursor).toBe("crosshair");
  });

  it("ignores hover events belonging to other scripts' layers", () => {
    const mapElement = document.createElement("div");
    const host = createHost(() => mapElement);
    openMarkerPointer(host.deps).start(LAYER);

    enter(host, OTHER_LAYER);
    expect(mapElement.style.cursor).not.toBe("pointer");
    // And a stray leave must not restore what our own marker never changed.
    leave(host, OTHER_LAYER);
    expect(mapElement.style.cursor).toBe("");
  });

  it("clears the pointer outright, for when the layer is hidden", () => {
    const mapElement = document.createElement("div");
    mapElement.style.cursor = "crosshair";
    const host = createHost(() => mapElement);
    const pointer = openMarkerPointer(host.deps);
    pointer.start(LAYER);

    enter(host);
    pointer.clear();
    expect(mapElement.style.cursor).toBe("crosshair");
  });

  it("tracks the layer once, and only once per layer name", () => {
    const host = createHost();
    const pointer = openMarkerPointer(host.deps);

    pointer.start(LAYER);
    pointer.start(LAYER);
    expect(host.events.trackLayerEvents).toHaveBeenCalledTimes(1);
    expect(host.events.trackLayerEvents).toHaveBeenCalledWith({ layerName: LAYER });
  });

  it("survives the map element not existing yet", () => {
    const host = createHost(mapElementThatThrows());
    openMarkerPointer(host.deps).start(LAYER);

    expect(() => enter(host)).not.toThrow();
    expect(() => leave(host)).not.toThrow();
  });
});
