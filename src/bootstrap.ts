import { SCRIPT_ID, SCRIPT_NAME } from "./constants";
import type { DatasetStore } from "./data/dataset-store";
import type { SignDataset } from "./data/sign-dataset-service";
import type { SignDatasetRecord } from "./data/sign-dataset-record";
import { openSignDatasetSource } from "./data/sign-dataset-service";
import { SettingsRepository } from "./settings/settings-repository";
import { openSignSelection } from "./sign-selection";
import { openSignMarkerLayer } from "./visual-overlay/sign-marker-layer";
import { openSignPanelTab } from "./sign-panel/tab";
import type { KeyValueStore } from "./storage/key-value-store";
import { getAsyncWmeSdk } from "./wme-sdk-async";

/** The WME page window (userscripts with grants see a sandboxed window, so callers pass the page's). */
export interface SdkHostWindow {
  SDK_INITIALIZED: Promise<unknown>;
  getWmeSdk?: Window["getWmeSdk"];
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
 *
 * One Sign Selection is shared by the Visual Overlay and the Sign Panel, and
 * one dataset subscription feeds both views. A background revalidation swaps
 * the active dataset and the same subscriber redraws the markers and list.
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
  const sdk = getAsyncWmeSdk(getWmeSdk, { scriptId: SCRIPT_ID, scriptName: SCRIPT_NAME });

  const settingsRepository = new SettingsRepository(deps.storage);
  const selection = openSignSelection();
  const markerLayer = openSignMarkerLayer({ sdk, selection });
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
    selection,
  });

  let pendingApply: Promise<void> = Promise.resolve();
  signDataset.subscribe((dataset) => {
    pendingApply = applyDataset(dataset).catch((error: unknown) => {
      console.error("[turku-signs] Failed to apply the active dataset", error);
    });
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
   * visibility flag, then the dataset loads and its subscription redraws both
   * views.
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
    // Cache-first and non-blocking: a fresh cache publishes with zero
    // requests; a stale one publishes now and swaps in the background.
    await signDataset.load();
    // The subscription starts the render; the ready waits for it, as spec
    // §4.1 says "load/render from Client Cache".
    await pendingApply;
  }

  /**
   * The one application path for the active dataset: both views read the
   * same spatial index, so the layer never builds a second one and the list
   * never reads a live getter that could disagree with the markers.
   *
   * Both applications settle even when one view fails: a failed marker
   * render must not leave the list querying the previous index (AC-6, AC-20).
   */
  async function applyDataset(dataset: SignDataset): Promise<void> {
    const results = await Promise.allSettled([
      markerLayer.render(dataset.index),
      signPanel.applySignIndex(dataset.index),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed !== undefined && failed.status === "rejected") throw failed.reason;
  }
}
