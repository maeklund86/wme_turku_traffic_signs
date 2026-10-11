import { ATTRIBUTION_FOOTER_CLASS, ATTRIBUTION_TEXT, SIGN_PANEL_TAB_LABEL } from "../constants";
import type { SettingsRepository, SignPanelSettings } from "../settings/settings-repository";

export interface SignPanelTabHost {
  registerScriptTab(): Promise<{ tabLabel: HTMLElement; tabPane: HTMLElement }>;
}

export interface SignPanelTabDeps {
  sdk: { Sidebar: SignPanelTabHost };
  /** The WME page document (userscript sandboxes run in an isolated world — pass the page's). */
  document: Document;
  settingsRepository: SettingsRepository;
}

export interface SignPanelTab {
  /**
   * WME state (layers, flags) does not survive reload/logout: re-apply the
   * persisted Sign Panel state after every wme-ready. Registers the tab on
   * the first ready, and returns the persisted settings for the caller
   * (the Visual Overlay and Sign Category filter consume these once their
   * tickets land). Idempotent: extra calls neither re-register nor duplicate
   * the permanent attribution footer.
   */
  refresh(): Promise<SignPanelSettings>;
}

export async function openSignPanelTab(deps: SignPanelTabDeps): Promise<SignPanelTab> {
  let registeredTab: { tabLabel: HTMLElement; tabPane: HTMLElement } | null = null;

  return {
    async refresh(): Promise<SignPanelSettings> {
      // Spec order (§4.1): register the sidebar tab on wme-ready, then re-apply
      // persisted state. If WME re-rendered the pane, registerScriptTab throws
      // InvalidStateError for this scriptId — bootstrap surfaces it.
      const paneDetached = registeredTab !== null && !deps.document.contains(registeredTab.tabPane);
      if (registeredTab === null || paneDetached) {
        registeredTab = await deps.sdk.Sidebar.registerScriptTab();
        registeredTab.tabLabel.textContent = SIGN_PANEL_TAB_LABEL;
      }
      ensureAttributionFooter(deps.document, registeredTab.tabPane);

      return deps.settingsRepository.load();
    },
  };
}

/**
 * The CC BY 4.0 attribution footer is permanent and non-dismissible: it holds
 * no interactive control, and refresh() re-creates it whenever the tab pane
 * is (re-)registered after a wme-ready.
 */
function ensureAttributionFooter(document: Document, pane: HTMLElement): void {
  const existing = pane.querySelector<HTMLElement>(`.${ATTRIBUTION_FOOTER_CLASS}`);
  if (existing) {
    existing.textContent = ATTRIBUTION_TEXT;
    return;
  }
  const footer = document.createElement("footer");
  footer.className = ATTRIBUTION_FOOTER_CLASS;
  footer.textContent = ATTRIBUTION_TEXT;
  pane.appendChild(footer);
}
