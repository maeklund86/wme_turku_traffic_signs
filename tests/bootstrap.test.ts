import { describe, expect, it, vi } from "vitest";

import type { WmeSDK } from "wme-sdk-typings";

import { bootstrap, type SignDataDeps, type SdkHostWindow } from "../src/bootstrap";
import { CACHE_TTL_MS, SIGN_PANEL_SETTINGS_KEY } from "../src/constants";
import type { SignDatasetRecord } from "../src/data/sign-dataset-record";
import { createMemoryStore } from "../src/storage/memory-store";
import type { KeyValueStore } from "../src/storage/key-value-store";
import { createFakeDatasetStore } from "./support/fake-dataset-store";
import { createFakeWmeSdk } from "./support/fake-wme-sdk";
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
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(fake.sdk as unknown as WmeSDK);

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
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(fake.sdk as unknown as WmeSDK);
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
    expect((tabPane as HTMLElement).textContent).toContain("Traffic sign data © City of Turku, CC BY 4.0");
  });

  it("re-applies persisted state after every wme-ready, without re-registering the tab", async () => {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(fake.sdk as unknown as WmeSDK);
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
    expect((tabPane as HTMLElement).childElementCount).toBe(1);
  });

  it("opens the Client Cache before the first wme-ready", async () => {
    silenceConsole();
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(fake.sdk as unknown as WmeSDK);
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
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(fake.sdk as unknown as WmeSDK);
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
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(fake.sdk as unknown as WmeSDK);
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
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(fake.sdk as unknown as WmeSDK);
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
