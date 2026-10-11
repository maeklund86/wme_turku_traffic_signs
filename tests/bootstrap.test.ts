import { describe, expect, it, vi } from "vitest";

import type { WmeSDK } from "wme-sdk-typings";

import { bootstrap, type SdkHostWindow } from "../src/bootstrap";
import { SIGN_PANEL_SETTINGS_KEY } from "../src/constants";
import { createMemoryStore } from "../src/storage/memory-store";
import type { KeyValueStore } from "../src/storage/key-value-store";
import { createFakeWmeSdk } from "./support/fake-wme-sdk";

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
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(fake.sdk as unknown as WmeSDK);

    const started = bootstrap({ pageWindow, document: globalThis.document, storage: createMemoryStore() });
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
    const pageWindow = { SDK_INITIALIZED: Promise.resolve() } as SdkHostWindow;

    await expect(
      bootstrap({ pageWindow, document: globalThis.document, storage: createMemoryStore() }),
    ).rejects.toThrow(/getWmeSdk/);
  });

  it("registers the Sign Panel tab only once wme-ready fires", async () => {
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(fake.sdk as unknown as WmeSDK);
    const started = bootstrap({ pageWindow, document: globalThis.document, storage: createMemoryStore() });

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
    const fake = createFakeWmeSdk();
    const { pageWindow, resolveSdkInitialized } = createFakePageWindow(fake.sdk as unknown as WmeSDK);
    const { store, settingsLoads } = countingStore();
    const started = bootstrap({ pageWindow, document: globalThis.document, storage: store });

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
});
