import { describe, expect, it, vi } from "vite-plus/test";

import type { WmeSDK } from "wme-sdk-typings";

import { bootstrap, type SignDataDeps, type SdkHostWindow } from "../src/bootstrap";
import {
  CACHE_TTL_MS,
  SIGN_LAYER_NAME,
  SIGN_PANEL_SETTINGS_KEY,
  SIGN_ROW_CODE_CLASS,
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
  checkboxNamed,
  expansionButtonNamed,
  fullNotesOf,
  listHeaderOf,
  noticeOf,
  paneOf,
  rowsOf,
  setCheckbox,
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

  it("filters markers from a category checkbox and restores the saved filter on wme-ready", async () => {
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
    await setCheckbox(pane, "Speed limits", true);

    expect(addedFeatures(fake).map((feature) => feature.id)).toEqual(["speed", "lane-speed"]);
    const settingsRepository = new SettingsRepository(storage);
    await vi.waitFor(async () => {
      expect(await settingsRepository.load()).toMatchObject({
        categoryFilter: [
          "speed-limits-general",
          "speed-limits-areas",
          "speed-limits-time-lane",
          "speed-limits-unclassified",
        ],
      });
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

  it("filters warning families across the panel and overlay, including on viewport moves", async () => {
    const signs = [
      sign("a1", 22.25, 60.45, { signCode: "A1" }),
      sign("a14-variant", 22.251, 60.45, { signCode: "A14.1" }),
      sign("a15", 22.252, 60.45, { signCode: "A15" }),
      sign("a20-variant", 22.253, 60.45, { signCode: "A20.1" }),
      sign("a21", 22.254, 60.45, { signCode: "A21" }),
      sign("a29-variant", 22.255, 60.45, { signCode: "A29.2_2" }),
      sign("a30", 22.256, 60.45, { signCode: "A30" }),
      sign("a33-variant", 22.257, 60.45, { signCode: "A33_2" }),
      sign("a99", 22.258, 60.45, { signCode: "A99" }),
      sign("priority", 22.259, 60.45, { signCode: "B1" }),
    ];
    const { fake, resolveSdkInitialized, started, dataDeps } = bootWithSigns(signs);

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(addedFeatures(fake)).toHaveLength(signs.length));

    const pane = await paneOf(fake.registerScriptTab);
    const warning = checkboxNamed(pane, "Warning signs");
    const warningFamilies = [
      "Road layout and condition",
      "Pedestrians, cyclists, animals, and recreation",
      "Intersections and rail crossings",
      "Other hazards",
      "Unclassified",
    ];
    const childGroup = pane.querySelector<HTMLElement>(
      '[role="group"][aria-label="Warning signs subcategories"]',
    )!;
    const warningSubcategoryCheckbox = (family: string): HTMLInputElement => {
      const checkbox = [
        ...childGroup.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
      ].find((candidate) => candidate.getAttribute("aria-label") === family);
      if (!checkbox) throw new Error(`Warning subcategory checkbox "${family}" was not rendered`);
      return checkbox;
    };
    const setWarningFamily = async (family: string, checked: boolean) => {
      const checkbox = warningSubcategoryCheckbox(family);
      checkbox.checked = checked;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    expect(warning.checked).toBe(true);
    expect(warning.indeterminate).toBe(false);
    expect(checkboxNamed(pane, "Other").checked).toBe(true);
    for (const family of warningFamilies) {
      expect(warningSubcategoryCheckbox(family).checked).toBe(true);
    }
    expect(checkboxNamed(pane, "Priority").checked).toBe(true);

    const disclosure = expansionButtonNamed(pane, "Expand Warning signs subcategories");
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(childGroup.hidden).toBe(true);
    const beforeExpand = addedFeatures(fake).map((feature) => feature.id);
    disclosure.click();
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    expect(childGroup.hidden).toBe(false);
    expect(warning.checked).toBe(true);
    expect(warning.indeterminate).toBe(false);
    expect(addedFeatures(fake).map((feature) => feature.id)).toEqual(beforeExpand);
    disclosure.click();
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(childGroup.hidden).toBe(true);
    expect(warning.checked).toBe(true);

    buttonNamed(pane, "Select none").click();
    expect(warning.checked).toBe(false);
    expect(warning.indeterminate).toBe(false);
    expect(checkboxNamed(pane, "Priority").checked).toBe(false);
    for (const family of warningFamilies) {
      expect(warningSubcategoryCheckbox(family).checked).toBe(false);
    }

    const visibleCodes = () =>
      rowsOf(pane).map((row) => row.querySelector(`.${SIGN_ROW_CODE_CLASS}`)?.textContent);
    const markerCodes = () => addedFeatures(fake).map((feature) => feature.properties?.signCode);
    const familyCases = [
      ["Road layout and condition", ["A1", "A14.1"]],
      ["Pedestrians, cyclists, animals, and recreation", ["A15", "A20.1"]],
      ["Intersections and rail crossings", ["A21", "A29.2_2"]],
      ["Other hazards", ["A30", "A33_2"]],
      ["Unclassified", ["A99"]],
    ] as const;
    for (const [family, codes] of familyCases) {
      fake.map.addFeatureToLayer.mockClear();
      await setWarningFamily(family, true);
      expect(visibleCodes()).toEqual(codes);
      expect(markerCodes()).toEqual(codes);
      expect(warning.checked).toBe(false);
      expect(warning.indeterminate).toBe(true);
      await setWarningFamily(family, false);
    }

    await setCheckbox(pane, "Road layout and condition", true);
    fake.map.addFeatureToLayer.mockClear();
    await setCheckbox(pane, "Intersections and rail crossings", true);
    const selectedCodes = ["A1", "A14.1", "A21", "A29.2_2"];
    expect(warning.checked).toBe(false);
    expect(warning.indeterminate).toBe(true);
    expect(visibleCodes()).toEqual(selectedCodes);
    expect(markerCodes()).toEqual(selectedCodes);

    fake.map.addFeatureToLayer.mockClear();
    fake.emitMapMoveEnd();
    expect(visibleCodes()).toEqual(selectedCodes);
    expect(markerCodes()).toEqual(selectedCodes);
    expect(dataDeps.fetchDataset).not.toHaveBeenCalled();
    expect(dataDeps.datasetStore.read).toHaveBeenCalledTimes(1);

    // Checking a parent selects every child; direct categories stay independent.
    fake.map.addFeatureToLayer.mockClear();
    await setCheckbox(pane, "Warning signs", true);
    expect(warning.checked).toBe(true);
    expect(warning.indeterminate).toBe(false);
    expect(warningFamilies.every((family) => warningSubcategoryCheckbox(family).checked)).toBe(
      true,
    );
    expect(markerCodes()).toEqual(signs.slice(0, -1).map(({ signCode }) => signCode));
    fake.map.addFeatureToLayer.mockClear();
    await setCheckbox(pane, "Warning signs", false);
    expect(warningFamilies.every((family) => !warningSubcategoryCheckbox(family).checked)).toBe(
      true,
    );
    fake.map.addFeatureToLayer.mockClear();
    await setCheckbox(pane, "Priority", true);
    expect(visibleCodes()).toEqual(["B1"]);
    expect(markerCodes()).toEqual(["B1"]);

    buttonNamed(pane, "Select all").click();
    expect(warning.checked).toBe(true);
    expect(warning.indeterminate).toBe(false);
    expect(checkboxNamed(pane, "Priority").checked).toBe(true);
    expect(checkboxNamed(pane, "Other").checked).toBe(true);
    buttonNamed(pane, "Select none").click();
    expect(warning.checked).toBe(false);
    expect(checkboxNamed(pane, "Priority").checked).toBe(false);
    expect(checkboxNamed(pane, "Other").checked).toBe(false);
    expect(rowsOf(pane)).toHaveLength(0);
  });

  it("migrates saved category-only choices to warning children across reloads", async () => {
    const storage = createMemoryStore();
    await storage.setItem(
      SIGN_PANEL_SETTINGS_KEY,
      JSON.stringify({ showSigns: true, categoryFilter: ["warning", "priority"] }),
    );
    const signs = [
      sign("a1", 22.25, 60.45, { signCode: "A1" }),
      sign("a30", 22.251, 60.45, { signCode: "A30" }),
      sign("a99", 22.252, 60.45, { signCode: "A99" }),
      sign("priority", 22.253, 60.45, { signCode: "B1" }),
      sign("parking", 22.254, 60.45, { signCode: "C38" }),
    ];
    const first = bootWithSigns(signs, storage);
    first.resolveSdkInitialized();
    await first.started;
    first.fake.emitWmeReady();
    await vi.waitFor(() => expect(addedFeatures(first.fake)).toHaveLength(4));

    const firstPane = await paneOf(first.fake.registerScriptTab);
    const firstWarning = checkboxNamed(firstPane, "Warning signs");
    expect(firstWarning.checked).toBe(true);
    expect(firstWarning.indeterminate).toBe(false);
    expect(checkboxNamed(firstPane, "Other hazards").checked).toBe(true);
    expect(checkboxNamed(firstPane, "Priority").checked).toBe(true);
    expect(checkboxNamed(firstPane, "Parking").checked).toBe(false);
    expect(
      rowsOf(firstPane).map((row) => row.querySelector(`.${SIGN_ROW_CODE_CLASS}`)?.textContent),
    ).toEqual(["A1", "A30", "A99", "B1"]);
    expect(addedFeatures(first.fake).map((feature) => feature.properties?.signCode)).toEqual([
      "A1",
      "A30",
      "A99",
      "B1",
    ]);

    // A user can now narrow the migrated selection; that leaf choice persists.
    await setCheckbox(firstPane, "Other hazards", false);
    expect(firstWarning.checked).toBe(false);
    expect(firstWarning.indeterminate).toBe(true);

    const reloaded = bootWithSigns(signs, storage);
    reloaded.resolveSdkInitialized();
    await reloaded.started;
    reloaded.fake.emitWmeReady();
    await vi.waitFor(() => expect(addedFeatures(reloaded.fake)).toHaveLength(3));

    const reloadedPane = await paneOf(reloaded.fake.registerScriptTab);
    const reloadedWarning = checkboxNamed(reloadedPane, "Warning signs");
    expect(reloadedWarning.checked).toBe(false);
    expect(reloadedWarning.indeterminate).toBe(true);
    expect(checkboxNamed(reloadedPane, "Other hazards").checked).toBe(false);
    const reloadedWarningGroup = reloadedPane.querySelector<HTMLElement>(
      '[role="group"][aria-label="Warning signs subcategories"]',
    )!;
    expect(
      reloadedWarningGroup.querySelector<HTMLInputElement>('input[aria-label="Unclassified"]')
        ?.checked,
    ).toBe(true);
    expect(
      rowsOf(reloadedPane).map((row) => row.querySelector(`.${SIGN_ROW_CODE_CLASS}`)?.textContent),
    ).toEqual(["A1", "A99", "B1"]);
    expect(addedFeatures(reloaded.fake).map((feature) => feature.properties?.signCode)).toEqual([
      "A1",
      "A99",
      "B1",
    ]);
    expect(first.dataDeps.fetchDataset).not.toHaveBeenCalled();
    expect(reloaded.dataDeps.fetchDataset).not.toHaveBeenCalled();
  });

  it("filters Other restrictions by code family in the panel and overlay", async () => {
    const signs = [
      sign("c1", 22.25, 60.45, { signCode: "C1" }),
      sign("c16-dot", 22.251, 60.45, { signCode: "C16.1" }),
      sign("c16-underscore", 22.252, 60.45, { signCode: "C16_2" }),
      sign("c16-hyphen", 22.253, 60.45, { signCode: "C16-3" }),
      sign("c17", 22.254, 60.45, { signCode: "C17" }),
      sign("c20-variant", 22.255, 60.45, { signCode: "C20.1" }),
      sign("c21", 22.256, 60.45, { signCode: "C21" }),
      sign("c27-variant", 22.257, 60.45, { signCode: "C27-1" }),
      sign("c28", 22.258, 60.45, { signCode: "C28" }),
      sign("c31-variant", 22.259, 60.45, { signCode: "C31_1" }),
      sign("c47", 22.26, 60.45, { signCode: "C47" }),
      sign("c45", 22.261, 60.45, { signCode: "C45" }),
      sign("c46-variant", 22.262, 60.45, { signCode: "C46.1" }),
      sign("c48", 22.263, 60.45, { signCode: "C48" }),
      sign("c49", 22.264, 60.45, { signCode: "C49" }),
      sign("c17-no-boundary", 22.265, 60.45, { signCode: "C17x" }),
      sign("speed", 22.266, 60.45, { signCode: "C32" }),
    ];
    const { fake, resolveSdkInitialized, started, dataDeps } = bootWithSigns(signs);

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(addedFeatures(fake)).toHaveLength(signs.length));

    const pane = await paneOf(fake.registerScriptTab);
    const restrictions = checkboxNamed(pane, "Other restrictions");
    const restrictionGroup = pane.querySelector<HTMLElement>(
      '[role="group"][aria-label="Other restrictions subcategories"]',
    )!;
    const restrictionCheckbox = (family: string) =>
      restrictionGroup.querySelector<HTMLInputElement>(`input[aria-label="${family}"]`)!;
    const setRestrictionCheckbox = async (family: string, checked: boolean) => {
      const checkbox = restrictionCheckbox(family);
      checkbox.checked = checked;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const visibleCodes = () =>
      rowsOf(pane).map((row) => row.querySelector(`.${SIGN_ROW_CODE_CLASS}`)?.textContent);
    const markerCodes = () => addedFeatures(fake).map((feature) => feature.properties?.signCode);
    const familyCases = [
      ["Access and vehicle-class restrictions", ["C1", "C16.1", "C16_2", "C16-3"]],
      ["Turning and movement restrictions", ["C17", "C20.1"]],
      ["Vehicle dimensions and weight", ["C21", "C27-1"]],
      ["Overtaking and following-distance restrictions", ["C28", "C31_1", "C47"]],
      ["Other special restrictions", ["C45", "C46.1", "C48"]],
      ["Unclassified", ["C49", "C17x"]],
    ] as const;

    expect(restrictions.checked).toBe(true);
    expect(restrictions.indeterminate).toBe(false);
    for (const [family] of familyCases) {
      expect(restrictionCheckbox(family).checked).toBe(true);
    }

    buttonNamed(pane, "Select none").click();
    expect(restrictions.checked).toBe(false);
    expect(restrictions.indeterminate).toBe(false);
    for (const [family] of familyCases) {
      expect(restrictionCheckbox(family).checked).toBe(false);
    }

    for (const [family, codes] of familyCases) {
      fake.map.addFeatureToLayer.mockClear();
      await setRestrictionCheckbox(family, true);
      expect(visibleCodes()).toEqual(codes);
      expect(markerCodes()).toEqual(codes);
      expect(restrictions.checked).toBe(false);
      expect(restrictions.indeterminate).toBe(true);
      await setRestrictionCheckbox(family, false);
    }

    fake.map.addFeatureToLayer.mockClear();
    await setCheckbox(pane, "Access and vehicle-class restrictions", true);
    fake.map.addFeatureToLayer.mockClear();
    await setCheckbox(pane, "Turning and movement restrictions", true);
    const selectedCodes = ["C1", "C16.1", "C16_2", "C16-3", "C17", "C20.1"];
    expect(restrictions.checked).toBe(false);
    expect(restrictions.indeterminate).toBe(true);
    expect(visibleCodes()).toEqual(selectedCodes);
    expect(markerCodes()).toEqual(selectedCodes);

    fake.map.addFeatureToLayer.mockClear();
    fake.emitMapMoveEnd();
    expect(visibleCodes()).toEqual(selectedCodes);
    expect(markerCodes()).toEqual(selectedCodes);
    expect(dataDeps.fetchDataset).not.toHaveBeenCalled();
    expect(dataDeps.datasetStore.read).toHaveBeenCalledTimes(1);

    fake.map.addFeatureToLayer.mockClear();
    await setCheckbox(pane, "Other restrictions", true);
    expect(restrictions.checked).toBe(true);
    expect(restrictions.indeterminate).toBe(false);
    expect(familyCases.every(([family]) => restrictionCheckbox(family).checked)).toBe(true);
    expect(visibleCodes()).toEqual(signs.slice(0, -1).map(({ signCode }) => signCode));
    expect(markerCodes()).toEqual(signs.slice(0, -1).map(({ signCode }) => signCode));

    fake.map.addFeatureToLayer.mockClear();
    await setCheckbox(pane, "Other restrictions", false);
    expect(restrictions.checked).toBe(false);
    expect(familyCases.every(([family]) => !restrictionCheckbox(family).checked)).toBe(true);
    expect(visibleCodes()).toEqual([]);
    expect(markerCodes()).toEqual([]);
  });

  it("migrates a saved Other restrictions category selection to its children", async () => {
    const storage = createMemoryStore();
    await storage.setItem(
      SIGN_PANEL_SETTINGS_KEY,
      JSON.stringify({ showSigns: true, categoryFilter: ["restrictions"] }),
    );
    const signs = [
      sign("c1", 22.25, 60.45, { signCode: "C1" }),
      sign("c17", 22.251, 60.45, { signCode: "C17" }),
      sign("c21", 22.252, 60.45, { signCode: "C21" }),
      sign("c28", 22.253, 60.45, { signCode: "C28" }),
      sign("c47", 22.254, 60.45, { signCode: "C47" }),
      sign("c45", 22.255, 60.45, { signCode: "C45" }),
      sign("c48", 22.256, 60.45, { signCode: "C48" }),
      sign("c49", 22.257, 60.45, { signCode: "C49" }),
      sign("speed", 22.258, 60.45, { signCode: "C32" }),
    ];
    const first = bootWithSigns(signs, storage);

    first.resolveSdkInitialized();
    await first.started;
    first.fake.emitWmeReady();
    await vi.waitFor(() => expect(addedFeatures(first.fake)).toHaveLength(signs.length - 1));

    const firstPane = await paneOf(first.fake.registerScriptTab);
    const restrictions = checkboxNamed(firstPane, "Other restrictions");
    const firstRestrictionGroup = firstPane.querySelector<HTMLElement>(
      '[role="group"][aria-label="Other restrictions subcategories"]',
    )!;
    const firstRestrictionCheckbox = (family: string) =>
      firstRestrictionGroup.querySelector<HTMLInputElement>(`input[aria-label="${family}"]`)!;
    const restrictionFamilies = [
      "Access and vehicle-class restrictions",
      "Turning and movement restrictions",
      "Vehicle dimensions and weight",
      "Overtaking and following-distance restrictions",
      "Other special restrictions",
      "Unclassified",
    ];
    const expectedCodes = signs.slice(0, -1).map(({ signCode }) => signCode);
    expect(restrictions.checked).toBe(true);
    expect(restrictions.indeterminate).toBe(false);
    expect(restrictionFamilies.every((family) => firstRestrictionCheckbox(family).checked)).toBe(
      true,
    );
    expect(
      rowsOf(firstPane).map((row) => row.querySelector(`.${SIGN_ROW_CODE_CLASS}`)?.textContent),
    ).toEqual(expectedCodes);
    expect(addedFeatures(first.fake).map((feature) => feature.properties?.signCode)).toEqual(
      expectedCodes,
    );

    await setCheckbox(firstPane, "Other special restrictions", false);
    expect(restrictions.checked).toBe(false);
    expect(restrictions.indeterminate).toBe(true);

    const reloaded = bootWithSigns(signs, storage);
    reloaded.resolveSdkInitialized();
    await reloaded.started;
    reloaded.fake.emitWmeReady();
    await vi.waitFor(() => expect(addedFeatures(reloaded.fake)).toHaveLength(6));

    const reloadedPane = await paneOf(reloaded.fake.registerScriptTab);
    const reloadedRestrictions = checkboxNamed(reloadedPane, "Other restrictions");
    const reloadedRestrictionGroup = reloadedPane.querySelector<HTMLElement>(
      '[role="group"][aria-label="Other restrictions subcategories"]',
    )!;
    const reloadedRestrictionCheckbox = (family: string) =>
      reloadedRestrictionGroup.querySelector<HTMLInputElement>(`input[aria-label="${family}"]`)!;
    const reloadedCodes = ["C1", "C17", "C21", "C28", "C47", "C49"];
    expect(reloadedRestrictions.checked).toBe(false);
    expect(reloadedRestrictions.indeterminate).toBe(true);
    expect(reloadedRestrictionCheckbox("Other special restrictions").checked).toBe(false);
    expect(
      rowsOf(reloadedPane).map((row) => row.querySelector(`.${SIGN_ROW_CODE_CLASS}`)?.textContent),
    ).toEqual(reloadedCodes);
    expect(addedFeatures(reloaded.fake).map((feature) => feature.properties?.signCode)).toEqual(
      reloadedCodes,
    );
    expect(first.dataDeps.fetchDataset).not.toHaveBeenCalled();
    expect(reloaded.dataDeps.fetchDataset).not.toHaveBeenCalled();
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

describe("Parking category filter wiring", () => {
  it("migrates saved category-only choices and filters parking families across the panel and overlay", async () => {
    silenceConsole();
    const storage = createMemoryStore();
    await storage.setItem(
      SIGN_PANEL_SETTINGS_KEY,
      JSON.stringify({ showSigns: true, categoryFilter: ["parking"] }),
    );
    const parkingCodes = [
      "C37",
      "C37.1",
      "C37x",
      "C38",
      "C39_1",
      "C40-1",
      "C41",
      "C42.1",
      "C43_2",
      "C44",
      "E2",
      "E3.1",
      "E4-1",
      "F46_1",
    ];
    const signs = [
      ...parkingCodes.map((code, index) =>
        sign(`parking-${index}`, 22.25 + index * 0.001, 60.45, { signCode: code }),
      ),
      sign("priority", 22.27, 60.45, { signCode: "B1" }),
    ];
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage,
      signData: createFakeDataDeps({ record: record("2026-10-11T19:50:25.6808150Z", NOW, signs) }),
    });

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() =>
      expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(parkingCodes.length),
    );

    const pane = await paneOf(fake.registerScriptTab);
    const parking = checkboxNamed(pane, "Parking");
    const parkingGroup = pane.querySelector<HTMLElement>(
      '[role="group"][aria-label="Parking subcategories"]',
    );
    expect(parkingGroup).not.toBeNull();
    const parkingSubcategory = (label: string): HTMLInputElement => {
      const checkbox = [
        ...parkingGroup!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
      ].find((candidate) => candidate.getAttribute("aria-label") === label);
      if (!checkbox) throw new Error(`Parking subcategory checkbox "${label}" was not rendered`);
      return checkbox;
    };
    const setParkingSubcategory = async (label: string, checked: boolean) => {
      const checkbox = parkingSubcategory(label);
      checkbox.checked = checked;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const visiblePanelCodes = () =>
      rowsOf(pane).map((row) => row.querySelector(`.${SIGN_ROW_CODE_CLASS}`)?.textContent);
    const visibleOverlayCodes = () =>
      fake.map.addFeatureToLayer.mock.calls.map(([{ feature }]) => feature.properties?.signCode);

    expect(parking.checked).toBe(true);
    expect(parking.indeterminate).toBe(false);
    for (const family of [
      "Stopping and parking restrictions",
      "Special-vehicle parking and loading",
      "Parking places and facilities",
      "Unclassified",
    ]) {
      expect(parkingSubcategory(family).checked).toBe(true);
    }
    expect(visiblePanelCodes()).toEqual(parkingCodes);
    expect(visibleOverlayCodes()).toEqual(parkingCodes);

    await setParkingSubcategory("Unclassified", false);
    expect(parking.checked).toBe(false);
    expect(parking.indeterminate).toBe(true);
    await vi.waitFor(async () =>
      expect(await new SettingsRepository(storage).load()).toMatchObject({
        categoryFilter: ["parking-restrictions", "parking-special-vehicles", "parking-facilities"],
      }),
    );

    buttonNamed(pane, "Select none").click();
    const familyCases = [
      ["Stopping and parking restrictions", ["C37", "C37.1", "C38", "C39_1", "C40-1", "C44"]],
      ["Special-vehicle parking and loading", ["C41", "C42.1", "C43_2"]],
      ["Parking places and facilities", ["E2", "E3.1", "E4-1", "F46_1"]],
      ["Unclassified", ["C37x"]],
    ] as const;
    for (const [family, expectedCodes] of familyCases) {
      fake.map.addFeatureToLayer.mockClear();
      await setParkingSubcategory(family, true);
      expect(visiblePanelCodes()).toEqual(expectedCodes);
      expect(visibleOverlayCodes()).toEqual(expectedCodes);
      expect(parking.checked).toBe(false);
      expect(parking.indeterminate).toBe(true);
      await setParkingSubcategory(family, false);
    }
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

describe("Speed limits subcategory wiring", () => {
  it("filters speed families across Sign Panel rows and overlay markers", async () => {
    silenceConsole();
    const signs = [
      sign("c32", 22.25, 60.45, { signCode: "C32" }),
      sign("c32-variant", 22.251, 60.45, { signCode: "C32.1" }),
      sign("c33-variant", 22.252, 60.45, { signCode: "C33_2" }),
      sign("c34", 22.253, 60.45, { signCode: "C34" }),
      sign("c34-variant", 22.254, 60.45, { signCode: "C34.1" }),
      sign("c35-variant", 22.255, 60.45, { signCode: "C35-1" }),
      sign("c36-dot", 22.256, 60.45, { signCode: "C36.7" }),
      sign("c36-dot-variant", 22.257, 60.45, { signCode: "C36.7_1" }),
      sign("c36-underscore", 22.258, 60.45, { signCode: "C36_7" }),
      sign("c36-underscore-variant", 22.259, 60.45, { signCode: "C36_7_1" }),
      sign("c32-lookalike", 22.26, 60.45, { signCode: "C32x" }),
      sign("c36-lookalike", 22.261, 60.45, { signCode: "C36_7x" }),
      sign("parking", 22.262, 60.45, { signCode: "C37" }),
      sign("priority", 22.263, 60.45, { signCode: "B1" }),
    ];
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage: createMemoryStore(),
      signData: createFakeDataDeps({
        record: record("2026-10-11T19:50:25.6808150Z", NOW, signs),
      }),
    });

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(signs.length));

    const pane = await paneOf(fake.registerScriptTab);
    const speedLimits = checkboxNamed(pane, "Speed limits");
    const speedFamilies = [
      "General speed limits",
      "Speed-limit areas",
      "Time- or lane-specific limits",
      "Unclassified",
    ];
    const visibleCodes = () =>
      rowsOf(pane).map((row) => row.querySelector(`.${SIGN_ROW_CODE_CLASS}`)?.textContent);
    const markerCodes = () =>
      fake.map.addFeatureToLayer.mock.calls.map(([{ feature }]) => feature.properties?.signCode);
    const familyCases = [
      ["General speed limits", ["C32", "C32.1", "C33_2"]],
      ["Speed-limit areas", ["C34", "C34.1", "C35-1"]],
      ["Time- or lane-specific limits", ["C36.7", "C36.7_1", "C36_7", "C36_7_1"]],
      ["Unclassified", ["C32x", "C36_7x"]],
    ] as const;
    const speedCodes = familyCases.flatMap(([, codes]) => codes);

    expect(speedLimits.checked).toBe(true);
    expect(speedLimits.indeterminate).toBe(false);
    expect(speedFamilies.every((family) => checkboxNamed(pane, family).checked)).toBe(true);
    expect(visibleCodes()).toEqual(signs.map(({ signCode }) => signCode));

    buttonNamed(pane, "Select none").click();
    expect(speedLimits.checked).toBe(false);
    expect(speedLimits.indeterminate).toBe(false);
    for (const [family, codes] of familyCases) {
      fake.map.addFeatureToLayer.mockClear();
      await setCheckbox(pane, family, true);
      expect(visibleCodes()).toEqual(codes);
      expect(markerCodes()).toEqual(codes);
      expect(speedLimits.checked).toBe(false);
      expect(speedLimits.indeterminate).toBe(true);
      await setCheckbox(pane, family, false);
    }

    fake.map.addFeatureToLayer.mockClear();
    await setCheckbox(pane, "Speed limits", true);
    expect(speedLimits.checked).toBe(true);
    expect(speedLimits.indeterminate).toBe(false);
    expect(speedFamilies.every((family) => checkboxNamed(pane, family).checked)).toBe(true);
    expect(visibleCodes()).toEqual(speedCodes);
    expect(markerCodes()).toEqual(speedCodes);
  });

  it("restores a saved category-only Speed limits selection to every child", async () => {
    silenceConsole();
    const signs = [
      sign("general", 22.25, 60.45, { signCode: "C32" }),
      sign("area", 22.251, 60.45, { signCode: "C34" }),
      sign("time-lane", 22.252, 60.45, { signCode: "C36.7" }),
      sign("unclassified", 22.253, 60.45, { signCode: "C36_7x" }),
      sign("parking", 22.254, 60.45, { signCode: "C37" }),
      sign("priority", 22.255, 60.45, { signCode: "B1" }),
    ];
    const storage = createMemoryStore();
    await storage.setItem(
      SIGN_PANEL_SETTINGS_KEY,
      JSON.stringify({ showSigns: true, categoryFilter: ["speed-limits"] }),
    );
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(
      fake.sdk as unknown as WmeSDK,
    );
    const started = bootstrap({
      pageWindow,
      document: globalThis.document,
      storage,
      signData: createFakeDataDeps({
        record: record("2026-10-11T19:50:25.6808150Z", NOW, signs),
      }),
    });

    resolveSdkInitialized();
    await started;
    fake.emitWmeReady();
    await vi.waitFor(() => expect(fake.map.addFeatureToLayer).toHaveBeenCalledTimes(4));

    const pane = await paneOf(fake.registerScriptTab);
    const speedFamilies = [
      "General speed limits",
      "Speed-limit areas",
      "Time- or lane-specific limits",
      "Unclassified",
    ];
    expect(checkboxNamed(pane, "Speed limits").checked).toBe(true);
    expect(speedFamilies.every((family) => checkboxNamed(pane, family).checked)).toBe(true);
    expect(checkboxNamed(pane, "Parking").checked).toBe(false);
    expect(checkboxNamed(pane, "Priority").checked).toBe(false);
    expect(
      rowsOf(pane).map((row) => row.querySelector(`.${SIGN_ROW_CODE_CLASS}`)?.textContent),
    ).toEqual(["C32", "C34", "C36.7", "C36_7x"]);
    expect(
      fake.map.addFeatureToLayer.mock.calls.map(([{ feature }]) => feature.properties?.signCode),
    ).toEqual(["C32", "C34", "C36.7", "C36_7x"]);
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
