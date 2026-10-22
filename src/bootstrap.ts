import type { WmeSDK } from "wme-sdk-typings";

import { SCRIPT_ID, SCRIPT_NAME } from "./constants";
import type { DatasetStore } from "./data/dataset-store";
import type { SignDatasetRecord } from "./data/sign-dataset-record";
import { openSignDatasetSource } from "./data/sign-dataset-service";
import { SettingsRepository } from "./settings/settings-repository";
import { openSignMarkerLayer } from "./visual-overlay/sign-marker-layer";
import { openSignPanelTab } from "./sign-panel/tab";
import type { KeyValueStore } from "./storage/key-value-store";

/** The WME page window (userscripts with grants see a sandboxed window, so callers pass the page's). */
export interface SdkHostWindow {
  SDK_INITIALIZED: Promise<unknown>;
  getWmeSdk?: (options: { scriptId: string; scriptName: string }) => WmeSDK;
}

export interface BootstrapDeps {
  pageWindow: SdkHostWindow;
  /** The WME page document — the sidebar tab host lives in it, not in the sandbox. */
  document: Document;
  storage: KeyValueStore;
  /** The whole-Turku sign dataset: Client Cache persistence plus ingestion. */
  signData: SignDataDeps;
}

/** The seams behind sign-data loading: where datasets persist and how they arrive. */
export interface SignDataDeps {
  /** Client Cache persistence for the whole-Turku sign dataset. */
  datasetStore: DatasetStore;
  /** Ingests the whole City of Turku registry through the Trimble OGC API. */
  fetchDataset: () => Promise<SignDatasetRecord>;
}

/**
 * Userscript bootstrap: wait for the WME SDK, obtain it, and re-apply the
 * script's persisted state on every wme-ready (WME layers and flags never
 * survive a reload/logout). Integration is SDK-only and read-only.
 */
export async function bootstrap(deps: BootstrapDeps): Promise<void> {
  if (typeof deps.pageWindow.SDK_INITIALIZED?.then !== "function") {
    throw new Error("window.SDK_INITIALIZED is not a promise — unsupported WME page?");
  }
  await deps.pageWindow.SDK_INITIALIZED;

  const getWmeSdk = deps.pageWindow.getWmeSdk;
  if (typeof getWmeSdk !== "function") {
    throw new Error("WME SDK is not available on this page: getWmeSdk is missing.");
  }
  const sdk = getWmeSdk({ scriptId: SCRIPT_ID, scriptName: SCRIPT_NAME });

  const settingsRepository = new SettingsRepository(deps.storage);
  const markerLayer = openSignMarkerLayer({ sdk });
  // The Client Cache is opened (and older schema versions stranded out) as
  // early as possible; the dataset itself loads on wme-ready.
  const signDataset = await openSignDatasetSource({
    store: deps.signData.datasetStore,
    fetchDataset: deps.signData.fetchDataset,
  });
  const signPanel = await openSignPanelTab({
    sdk,
    document: deps.document,
    settingsRepository,
    layer: markerLayer,
    // The list reads the active index live, so it starts empty before the
    // first load and follows every later swap (spec §4.5).
    spatialIndex: { current: () => signDataset.current().index },
  });

  sdk.Events.on({
    eventName: "wme-ready",
    eventHandler: () => {
      void onWmeReady().catch((error: unknown) => {
        console.error("[turku-signs] Failed to re-apply script state on wme-ready", error);
      });
    },
  });

  /**
   * Re-applies the script's state after every wme-ready, in spec order
   * (§4.1): the Sign Panel re-registers itself and re-applies the persisted
   * visibility flag, then the markers render from the Client Cache.
   *
   * There is deliberately no coverage gate here. AC-17 asks that no signs
   * render outside the Turku coverage extent, and that holds by geometry:
   * ingestion pulls the whole registry through a `bbox=TURKU_EXTENT` query
   * (src/data/turku-sign-ingestion.ts), every sign is a Point, and OL2 draws
   * only the features inside the viewport — so a viewport that misses the
   * extent draws nothing, whatever the layer holds. Gating registration on
   * coverage instead would need an "entered coverage" path for sessions that
   * start outside Turku (panning in would otherwise show an empty map), for
   * no visible difference. Coverage is the Sign Panel's concern alone
   * (spec §4.5).
   */
  async function onWmeReady(): Promise<void> {
    await signPanel.refresh();
    // Cache-first and non-blocking: a fresh cache renders with zero requests;
    // a stale one renders now and swaps in the background.
    const dataset = await signDataset.load();
    markerLayer.render(dataset.index.signs);
    // The ready rendered the list against whatever the index held then; the
    // load may have just swapped a whole dataset in (spec §4.5, AC-20).
    signPanel.refreshSignList();
  }
}
