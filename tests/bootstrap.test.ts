import { describe, expect, it, vi } from "vite-plus/test";

import type { WmeSDK } from "wme-sdk-typings";

import { bootstrap, type SignDataDeps, type SdkHostWindow } from "../src/bootstrap";
import {
  CACHE_TTL_MS,
  SIGN_LAYER_NAME,
  SIGN_PANEL_SETTINGS_KEY,
  SIGN_ROW_SELECTED_CLASS,
  TURKU_EXTENT,
} from "../src/constants";
import type { SignDatasetRecord } from "../src/data/sign-dataset-record";
import type { TrafficSign } from "../src/data/traffic-sign";
import { createMemoryStore } from "../src/storage/memory-store";
import type { KeyValueStore } from "../src/storage/key-value-store";
import { SettingsRepository } from "../src/settings/settings-repository";
import { createFakeDatasetStore } from "./support/fake-dataset-store";
import { createFakeWmeSdk } from "./support/fake-wme-sdk";
import {
  buttonNamed,
  fullNotesOf,
  listHeaderOf,
  noticeOf,
  paneOf,
  rowsOf,
  toggleCheckbox,
  toggleOf,
} from "./support/sign-panel-pane";
import { silenceConsole } from "./support/silence-console";
import { record, sign } from "./support/turku-sign";

const NOW = Date.now();
const TURKU_RECORD: SignDatasetRecord = record("2026-10-11T19:50:25.6808150Z", NOW, [
  sign("321020431", 22.27617187661397, 60.443853785959234),
]);

function createFakePageWindow(sdk: WmeSDK): {
  pageWindow: SdkHostWindow;
  resolveSdkInitialized: () => void;
} {
  let resolveSdkInitialized!: () => void;
  const SDK_INITIALIZED = new Promise<void>((resolve) => {
    resolveSdkInitialized = resolve;
  });
  const pageWindow: SdkHostWindow = {
    SDK_INITIALIZED,
    getWmeSdk: vi.fn(() => sdk),
  };
  return { pageWindow, resolveSdkInitialized };
}

/** The production dependencies the bootstrap needs for sign data. */
function createFakeDataDeps(options: { record?: SignDatasetRecord | null } = {}): SignDataDeps {
  const datasetStore = createFakeDatasetStore({ record: options.record ?? null });
  const fetchDataset = vi.fn(async () => TURKU_RECORD);
  return { datasetStore, fetchDataset };
}

/** Counts persisted-state loads to observe the re-apply-after-every-wme-ready contract. */
function countingStore(): { store: KeyValueStore; settingsLoads: () => number } {
  const inner = createMemoryStore();
  let loads = 0;
  const getItem = inner.getItem;
  const store: KeyValueStore = {
    getItem: (key: string) => {
      if (key === SIGN_PANEL_SETTINGS_KEY) loads += 1;
      return getItem(key);
    },
    setItem: inner.setItem,
  };
  return { store, settingsLoads: () => loads };
}

describe("userscript bootstrap", () => {
  it("obtains the WME SDK only after window.SDK_INITIALIZED", async () => {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );

    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage: createMemoryStore(),
      signData: createFakeDataDeps(),
    });
    await Promise.resolve();
    expect(pageWindow.getWmeSdk).not.toHaveBeenCalled();

    resolveSdkInitialized();
    await started;
    expect(pageWindow.getWmeSdk).toHaveBeenCalledWith({
      scriptId: "wme-turku-traffic-signs",
      scriptName: "WME Turku Traffic Signs",
    });
  });

  it("fails loudly when the WME page exposes no getWmeSdk", async () => {
    silenceConsole();
    const pageWindow = { SDK_INITIALIZED: Promise.resolve() } as SdkHostWindow;

    await expect(
      bootstrap({
        pageWindow,
        document: globalThis.document,
        storage: createMemoryStore(),
        signData: createFakeDataDeps(),
      }),
    ).rejects.toThrow(/getWmeSdk/);
  });

  it("registers the Sign Panel tab only once wme-ready fires", async () => {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage: createMemoryStore(),
      signData: createFakeDataDeps(),
    });

    resolveSdkInitialized();
    await started;
    expect(fake.registerScriptTab).not.toHaveBeenCalled();

    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.registerScriptTab).toHaveBeenCalledTimes(1));

    const { tabLabel, tabPane } = await fake.registerScriptTab.mock.results[0]!.value;
    expect(tabLabel.textContent).toBe("Sign Panel");
    expect((tabPane as HTMLElement).textContent).toContain(
      "Traffic sign data © City of Turku, CC BY 4.0",
    );
  });

  it("re-applies persisted state after every wme-ready, without re-registering the tab", async () => {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    const { store, settingsLoads } = countingStore();
    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage: store,
      signData: createFakeDataDeps(),
    });

    resolveSdkInitialized();
    await started;

    fake.emitWmeReady();
    await vi.waitFor(() => expect(settingsLoads()).toBe(1));
    fake.emitWmeReady();
    await vi.waitFor(() => expect(settingsLoads()).toBe(2));

    expect(fake.registerScriptTab).toHaveBeenCalledTimes(1);
    const { tabPane } = await fake.registerScriptTab.mock.results[0]!.value;
    // The pane holds the visibility control above the permanent footer.
    expect((tabPane as HTMLElement).lastElementChild?.textContent).toBe(
      "Traffic sign data © City of Turku, CC BY 4.0",
    );
    expect((tabPane as HTMLElement).querySelector("input")).not.toBeNull();
  });

  it("opens the Client Cache before the first wme-ready", async () => {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    const dataDeps = createFakeDataDeps();
    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage: createMemoryStore(),
      signData: dataDeps,
    });

    resolveSdkInitialized();
    await started;

    expect(dataDeps.datasetStore.open).toHaveBeenCalledTimes(1);
    expect(dataDeps.datasetStore.read).not.toHaveBeenCalled();
  });

  it("renders from the Client Cache on wme-ready with no fetch while the cache is fresh", async () => {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    const dataDeps = createFakeDataDeps({ record: TURKU_RECORD });
    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage: createMemoryStore(),
      signData: dataDeps,
    });

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(dataDeps.datasetStore.read).toHaveBeenCalledTimes(1));
    // Let the first load settle before the next ready, so it re-reads rather
    // than coalescing with the in-flight one.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.emitWmeReady();
    await vi.waitFor(() => expect(dataDeps.datasetStore.read).toHaveBeenCalledTimes(2));

    expect(dataDeps.fetchDataset).not.toHaveBeenCalled();
    expect(dataDeps.datasetStore.write).not.toHaveBeenCalled();
  });

  it("ingests the whole registry once on the first wme-ready and persists it", async () => {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    const dataDeps = createFakeDataDeps();
    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage: createMemoryStore(),
      signData: dataDeps,
    });

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(dataDeps.datasetStore.write).toHaveBeenCalledTimes(1));
    fake.emitWmeReady();
    await vi.waitFor(() => expect(dataDeps.datasetStore.read).toHaveBeenCalledTimes(2));

    expect(dataDeps.fetchDataset).toHaveBeenCalledTimes(1);
    expect(dataDeps.datasetStore.write).toHaveBeenCalledWith(TURKU_RECORD);
  });

  it("revalidates in the background only when the cached dataset is stale", async () => {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    const dataDeps = createFakeDataDeps({
      record: record("2026-10-01T00:00:00.000Z", NOW - CACHE_TTL_MS - 1000, [
        sign("cached", 22.1, 60.4),
      ]),
    });
    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage: createMemoryStore(),
      signData: dataDeps,
    });

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(dataDeps.fetchDataset).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(dataDeps.datasetStore.write).toHaveBeenCalledTimes(1));
  });
});

describe("visual overlay wiring", () => {
  function bootWithSigns(signs: readonly TrafficSign[], storage = createMemoryStore()) {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    const dataDeps = createFakeDataDeps({
      record: record("2026-10-11T19:50:25.6808150Z", NOW, signs),
    });
    return {
      fake,
      resolveSdkInitialized,
      dataDeps,
      storage,
      started: bootstrap({
        pageWindow,
        document: globalThis.document,
        storage,
        signData: dataDeps,
      }),
    };
  }

  const addedFeatures = (fake: ReturnType<typeof createFakeWmeSdk>) =>
    fake.map.addFeatureToLayer.mock.calls.map(([{ feature }]) => feature);

  async function readyWithSigns(signs: readonly TrafficSign[]) {
    const { fake, resolveSdkInitialized, started } = bootWithSigns(signs);
    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(signs.length));
    const { tabLabel } = await fake.registerScriptTab.mock.results[0]!.value;
    const pane = await paneOf(fake.registerScriptTab);
    return { fake, tabLabel, rows: rowsOf(pane), features: addedFeatures(fake) };
  }

  it("creates one marker layer on wme-ready and puts one feature per sign on it", async () => {
    const { fake, resolveSdkInitialized, started } = bootWithSigns([
      sign("321020431", 22.27617187661397, 60.443853785959234),
      sign("321020432", 22.1, 60.4),
    ]);

    resolveSdkInitialized();
    await started;
    expect(fake.map.addLayer).not.toHaveBeenCalled();

    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(2));

    expect(fake.map.addLayer).toHaveBeenCalledTimes(1);
    expect(fake.map.addLayer.mock.calls[0]![0].layerName).toBe(SIGN_LAYER_NAME);
    const features = addedFeatures(fake);
    expect(features.map((feature) => feature.id)).toEqual(["321020431", "321020432"]);
    expect(features.map((feature) => feature.geometry.type)).toEqual(["Point", "Point"]);
    // WGS84 straight through: no reprojection between the registry and the map.
    expect(features[0]!.geometry.coordinates).toEqual([22.27617187661397, 60.443853785959234]);
  });

  it("selects the clicked sign row without opening its extra note", async () => {
    const { fake, tabLabel, rows, features } = await readyWithSigns([
      sign("321020431", 22.27617187661397, 60.443853785959234, {
        signName: "First sign",
        notes: "First sign details",
      }),
    ]);
    const [row] = rows;
    const [feature] = features;

    expect(fake.events.trackLayerEvents).toHaveBeenCalledWith({ layerName: SIGN_LAYER_NAME });
    fake.emitFeatureClick({ featureId: feature!.id, layerName: SIGN_LAYER_NAME });
    // The generic map event can follow in a later task; it must not undo selection.
    await new Promise((resolve) => setTimeout(resolve, 40));
    fake.emitMapClick();

    expect(fake.isScriptTabActive(tabLabel)).toBe(true);
    expect(row!.classList.contains(SIGN_ROW_SELECTED_CLASS)).toBe(true);
    expect(row!.getAttribute("aria-expanded")).toBe("false");
    expect(row!.getAttribute("aria-pressed")).toBe("true");
    expect(row!.textContent).toContain("First sign");
    expect(fullNotesOf(row!).hidden).toBe(true);
  });

  it("replaces the previous marker selection", async () => {
    const { fake, rows, features } = await readyWithSigns([
      sign("321020431", 22.27617187661397, 60.443853785959234, { notes: "First sign details" }),
      sign("321020432", 22.1, 60.4, { notes: "Second sign details" }),
    ]);
    const [firstRow, secondRow] = rows;
    const [firstFeature, secondFeature] = features;

    fake.emitMapClick();
    fake.emitFeatureClick({ featureId: firstFeature!.id, layerName: SIGN_LAYER_NAME });
    fake.emitMapClick();
    fake.emitFeatureClick({ featureId: secondFeature!.id, layerName: SIGN_LAYER_NAME });

    expect(secondRow!.classList.contains(SIGN_ROW_SELECTED_CLASS)).toBe(true);
    expect(secondRow!.getAttribute("aria-expanded")).toBe("false");
    expect(firstRow!.classList.contains(SIGN_ROW_SELECTED_CLASS)).toBe(false);
    expect(firstRow!.getAttribute("aria-expanded")).toBe("false");
  });

  it("clears the marker selection on an empty map click", async () => {
    const { fake, rows, features } = await readyWithSigns([
      sign("321020431", 22.27617187661397, 60.443853785959234, { notes: "Sign details" }),
    ]);
    const [row] = rows;
    const [feature] = features;

    fake.emitMapClick();
    fake.emitFeatureClick({ featureId: feature!.id, layerName: SIGN_LAYER_NAME });
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.emitMapClick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(row!.classList.contains(SIGN_ROW_SELECTED_CLASS)).toBe(false);
    expect(row!.getAttribute("aria-expanded")).toBe("false");
    expect(row!.getAttribute("aria-pressed")).toBe("false");
  });

  it("ignores feature clicks from other layers", async () => {
    const { fake, tabLabel, rows, features } = await readyWithSigns([
      sign("321020431", 22.27617187661397, 60.443853785959234),
    ]);
    const [row] = rows;
    const [feature] = features;

    fake.emitFeatureClick({ featureId: feature!.id, layerName: "another-layer" });

    expect(fake.isScriptTabActive(tabLabel)).toBe(false);
    expect(row!.classList.contains(SIGN_ROW_SELECTED_CLASS)).toBe(false);
  });

  it("filters markers from category chips and restores the saved filter on wme-ready", async () => {
    const { fake, resolveSdkInitialized, started, storage } = bootWithSigns([
      sign("speed", 22.25, 60.45, { signCode: "C32_2", signName: "Pysäköinti kielletty" }),
      sign("lane-speed", 22.255, 60.45, { signCode: "C36_7" }),
      sign("parking", 22.26, 60.45, { signCode: "C38" }),
      sign("priority", 22.27, 60.45, { signCode: "B1" }),
    ]);

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(4));

    const pane = await paneOf(fake.registerScriptTab);
    fake.map.addFeatureToLayer.mockClear();
    buttonNamed(pane, "Select none").click();
    buttonNamed(pane, "Speed limits").click();

    expect(addedFeatures(fake).map((feature) => feature.id)).toEqual(["speed", "lane-speed"]);
    const settingsRepository = new SettingsRepository(storage);
    await vi.waitFor(async () => {
      expect(await settingsRepository.load()).toMatchObject({ categoryFilter: ["speed-limits"] });
    });

    fake.map.addFeatureToLayer.mockClear();
    fake.emitWmeReady();
    await vi.waitFor(() => {
      const features = addedFeatures(fake);
      expect(features.length).toBeGreaterThan(0);
      expect(
        features.every((feature) => ["speed", "lane-speed"].includes(String(feature.id))),
      ).toBe(true);
    });
  });

  it("re-creates the layer once and re-draws after every wme-ready", async () => {
    const { fake, resolveSdkInitialized, started } = bootWithSigns([sign("1", 22.2, 60.4)]);

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(2));

    expect(fake.map.addLayer).toHaveBeenCalledTimes(1);
    expect(fake.map.removeAllFeaturesFromLayer).toHaveBeenCalledTimes(2);
  });

  it("applies the persisted visibility flag to the layer", async () => {
    const { fake, resolveSdkInitialized, started } = bootWithSigns([sign("1", 22.2, 60.4)]);

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(1));

    // Persisted state re-applies on a later wme-ready too.
    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(2));
    expect(fake.map.setLayerVisibility).toHaveBeenCalledWith({
      layerName: SIGN_LAYER_NAME,
      visibility: true,
    });
    expect(fake.map.setLayerVisibility).toHaveBeenLastCalledWith({
      layerName: SIGN_LAYER_NAME,
      visibility: true,
    });
  });

  it("never registers the layer in WME's LayerSwitcher (AC-12)", async () => {
    const { fake, resolveSdkInitialized, started } = bootWithSigns([sign("1", 22.2, 60.4)]);

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(1));

    // The switcher entry is opt-in; the overlay simply never asks for one.
    expect(fake.layerSwitcher.addLayerCheckbox).not.toHaveBeenCalled();
  });

  it("puts a pointer over a marker and restores it after (AC-10)", async () => {
    const { fake, resolveSdkInitialized, started } = bootWithSigns([sign("1", 22.2, 60.4)]);
    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(1));

    const mapElement = fake.map.getMapViewportElement();
    mapElement.style.cursor = "crosshair";

    fake.emitFeatureHover("wme-layer-feature-mouse-enter", {
      layerName: SIGN_LAYER_NAME,
      featureId: "1",
    });
    expect(mapElement.style.cursor).toBe("pointer");

    fake.emitFeatureHover("wme-layer-feature-mouse-leave", {
      layerName: SIGN_LAYER_NAME,
      featureId: "1",
    });
    expect(mapElement.style.cursor).toBe("crosshair");
  });
});

describe("Sign Panel visibility control", () => {
  it("defaults the checkbox on inside the coverage extent and applies the flag (AC-16)", async () => {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage: createMemoryStore(),
      signData: createFakeDataDeps({
        record: record("2026-10-11T19:50:25.6808150Z", NOW, [sign("1", 22.2, 60.4)]),
      }),
    });

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(1));

    const pane = await paneOf(fake.registerScriptTab);
    expect(toggleOf(pane).checked).toBe(true);
    expect(fake.map.setLayerVisibility).toHaveBeenCalledWith({
      layerName: SIGN_LAYER_NAME,
      visibility: true,
    });
  });

  it("explains itself outside the coverage extent, where no marker can be drawn (AC-17)", async () => {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    // A viewport west of Turku that misses the coverage extent entirely.
    fake.map.getMapExtent.mockReturnValue([21.5, 60.0, 22.0, 60.2]);
    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage: createMemoryStore(),
      signData: createFakeDataDeps({
        record: record("2026-10-11T19:50:25.6808150Z", NOW, [sign("1", 22.2, 60.4)]),
      }),
    });

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const pane = await paneOf(fake.registerScriptTab);
    expect(noticeOf(pane).hidden).toBe(false);
    expect(noticeOf(pane).textContent).toBe(
      "Outside Turku coverage — the sign registry only covers the City of Turku.",
    );
    expect(toggleOf(pane).disabled).toBe(true);
    // The marker layer queries the viewport before adding features. A view
    // outside Turku therefore has no registered marker features either.
    const [minLon, minLat, maxLon, maxLat] = TURKU_EXTENT;
    const coordinates = fake.map.addFeatureToLayer.mock.calls.map(
      ([{ feature }]) => feature.geometry.coordinates,
    );
    expect(coordinates).toHaveLength(0);
    for (const [longitude, latitude] of coordinates) {
      expect(longitude).toBeGreaterThanOrEqual(minLon);
      expect(longitude).toBeLessThanOrEqual(maxLon);
      expect(latitude).toBeGreaterThanOrEqual(minLat);
      expect(latitude).toBeLessThanOrEqual(maxLat);
    }
  });

  it("toggling the checkbox issues no network requests and keeps the markers (AC-18)", async () => {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    const dataDeps = createFakeDataDeps({
      record: record("2026-10-11T19:50:25.6808150Z", NOW, [sign("1", 22.2, 60.4)]),
    });
    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage: createMemoryStore(),
      signData: dataDeps,
    });

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(1));

    await toggleCheckbox(await paneOf(fake.registerScriptTab), false);

    expect(fake.map.setLayerVisibility).toHaveBeenLastCalledWith({
      layerName: SIGN_LAYER_NAME,
      visibility: false,
    });
    // Display-only: no fetch, no cache write, no re-render, markers stay put.
    expect(dataDeps.fetchDataset).not.toHaveBeenCalled();
    expect(dataDeps.datasetStore.write).not.toHaveBeenCalled();
    expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(1);
    expect(fake.map.removeAllFeaturesFromLayer).toHaveBeenCalledTimes(1);
  });
});

describe("viewport-driven sign list wiring (AC-20)", () => {
  it("fills the list from the loaded dataset, with the in-view count in the header", async () => {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage: createMemoryStore(),
      signData: createFakeDataDeps({
        record: record("2026-10-11T19:50:25.6808150Z", NOW, [
          sign("1", 22.2, 60.4),
          sign("2", 22.3, 60.5),
          // East of the default test viewport: neither a marker nor a list row.
          sign("far", 23.5, 61.0),
        ]),
      }),
    });

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(2));

    const pane = await paneOf(fake.registerScriptTab);
    // Both drawn markers lie inside the extent, and the load may
    // resolve after the ready rendered the list from an empty index.
    await vi.waitFor(() => expect(listHeaderOf(pane).textContent).toBe("2 signs in view"));
    expect(rowsOf(pane)).toHaveLength(2);
    // The permanent footer still closes the pane, list included.
    expect(pane.lastElementChild?.textContent).toBe("Traffic sign data © City of Turku, CC BY 4.0");
  });

  it("shows the zero count until the dataset resolves, then fills in", async () => {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    const datasetStore = createFakeDatasetStore({ record: null });
    let resolveFetch!: (value: SignDatasetRecord) => void;
    const fetchDataset = vi.fn(
      () =>
        new Promise<SignDatasetRecord>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage: createMemoryStore(),
      signData: { datasetStore, fetchDataset },
    });

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.registerScriptTab).toHaveBeenCalledTimes(1));

    const pane = await paneOf(fake.registerScriptTab);
    await vi.waitFor(() => expect(listHeaderOf(pane).textContent).toBe("0 signs in view"));

    resolveFetch(TURKU_RECORD);
    await vi.waitFor(() => expect(listHeaderOf(pane).textContent).toBe("1 sign in view"));
    expect(rowsOf(pane)).toHaveLength(1);
  });
});
