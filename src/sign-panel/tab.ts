import {
  ATTRIBUTION_FOOTER_CLASS,
  ATTRIBUTION_TEXT,
  OUTSIDE_TURKU_COVERAGE_CLASS,
  OUTSIDE_TURKU_COVERAGE_TEXT,
  SIGN_PANEL_TAB_LABEL,
  SIGN_VISIBILITY_CLASS,
  SIGN_VISIBILITY_LABEL_TEXT,
  SIGN_VISIBILITY_TOGGLE_CLASS,
} from "../constants";
import type { SettingsRepository, SignPanelSettings } from "../settings/settings-repository";
import type { SignMarkerLayer } from "../visual-overlay/sign-marker-layer";

export interface SignPanelTabHost {
  registerScriptTab(): Promise<{ tabLabel: HTMLElement; tabPane: HTMLElement }>;
}

/**
 * Whether the map viewport overlaps the Turku coverage extent. Read once per
 * wme-ready, so the toggle's enabled state and the notice always agree (and
 * the render gate reads the same question — spec §4.5).
 */
export interface SignPanelCoverage {
  isCovered(): boolean;
}

export interface SignPanelTabDeps {
  sdk: { Sidebar: SignPanelTabHost };
  /** The WME page document (userscript sandboxes run in an isolated world — pass the page's). */
  document: Document;
  settingsRepository: SettingsRepository;
  /** The Visual Overlay the visibility checkbox drives (spec §4.5). */
  layer: SignMarkerLayer;
  coverage: SignPanelCoverage;
}

export interface SignPanelTab {
  /**
   * WME state (layers, flags) does not survive reload/logout: re-apply the
   * persisted Sign Panel state after every wme-ready. Registers the tab on
   * the first ready, syncs the visibility checkbox from storage, applies the
   * persisted flag to the layer, and re-reads coverage. Returns the persisted
   * settings. Idempotent: extra calls neither re-register nor duplicate the
   * controls or the permanent attribution footer.
   */
  refresh(): Promise<SignPanelSettings>;
}

/** The tab's own controls, created once per registered pane. */
interface SignPanelControls {
  /** The pane holding the controls; WME can replace it between readies. */
  pane: HTMLElement;
  toggle: HTMLInputElement;
  notice: HTMLElement;
}

export async function openSignPanelTab(deps: SignPanelTabDeps): Promise<SignPanelTab> {
  let controls: SignPanelControls | null = null;

  return {
    async refresh(): Promise<SignPanelSettings> {
      // Spec order (§4.1): register the sidebar tab on wme-ready, then re-apply
      // persisted state. If WME re-rendered the pane, registerScriptTab throws
      // InvalidStateError for this scriptId — bootstrap surfaces it.
      const tabControls = await ensureControls();
      ensureAttributionFooter(deps.document, tabControls.pane);

      const settings = await deps.settingsRepository.load();
      applyVisibility(tabControls, settings.showSigns);
      return settings;
    },
  };

  /** Registers the tab on the first ready, and again whenever WME replaces its pane. */
  async function ensureControls(): Promise<SignPanelControls> {
    const paneDetached = controls !== null && !deps.document.contains(controls.pane);
    if (controls === null || paneDetached) {
      const registeredTab = await deps.sdk.Sidebar.registerScriptTab();
      registeredTab.tabLabel.textContent = SIGN_PANEL_TAB_LABEL;
      controls = buildControls(deps.document, registeredTab.tabPane, persistVisibility);
    }
    return controls;
  }

  /**
   * Display-only: the checkbox mirrors the persisted flag, and outside the
   * Turku coverage extent it is disabled behind a one-line notice instead.
   * Toggling never reads or writes the dataset (AC-18).
   */
  function applyVisibility(panelControls: SignPanelControls, visible: boolean): void {
    const covered = deps.coverage.isCovered();
    panelControls.toggle.checked = visible;
    panelControls.toggle.disabled = !covered;
    panelControls.notice.hidden = covered;
    // Outside coverage there are no signs to show, so the overlay's layer is
    // never created and never made visible there (AC-17).
    if (covered) deps.layer.setVisible(visible);
  }

  /** Persists the flag and moves the layer; the category filter is preserved. */
  async function persistVisibility(visible: boolean): Promise<void> {
    const current = await deps.settingsRepository.load();
    await deps.settingsRepository.save({
      showSigns: visible,
      categoryFilter: current.categoryFilter,
    });
    deps.layer.setVisible(visible);
  }
}

function buildControls(
  document: Document,
  pane: HTMLElement,
  onVisibilityChange: (visible: boolean) => Promise<void>,
): SignPanelControls {
  const container = document.createElement("div");
  container.className = SIGN_VISIBILITY_CLASS;

  const label = document.createElement("label");
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.className = SIGN_VISIBILITY_TOGGLE_CLASS;
  label.append(toggle, document.createTextNode(SIGN_VISIBILITY_LABEL_TEXT));

  const notice = document.createElement("p");
  notice.className = OUTSIDE_TURKU_COVERAGE_CLASS;
  notice.textContent = OUTSIDE_TURKU_COVERAGE_TEXT;
  notice.hidden = true;

  container.append(label, notice);
  pane.append(container);

  toggle.addEventListener("change", () => {
    void onVisibilityChange(toggle.checked).catch((error: unknown) => {
      console.error("[turku-signs] Failed to persist the visibility flag", error);
    });
  });

  return { pane, toggle, notice };
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
