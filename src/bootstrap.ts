import type { WmeSDK } from "wme-sdk-typings";

import { SCRIPT_ID, SCRIPT_NAME } from "./constants";
import { SettingsRepository } from "./settings/settings-repository";
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
  const signPanel = await openSignPanelTab({
    sdk,
    document: deps.document,
    settingsRepository,
  });

  sdk.Events.on({
    eventName: "wme-ready",
    eventHandler: () => {
      void signPanel.refresh().catch((error: unknown) => {
        console.error("[turku-signs] Failed to re-apply Sign Panel state on wme-ready", error);
      });
    },
  });
}
