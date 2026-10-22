import {
  ATTRIBUTION_FOOTER_CLASS,
  ATTRIBUTION_TEXT,
  OUTSIDE_TURKU_COVERAGE_CLASS,
  OUTSIDE_TURKU_COVERAGE_TEXT,
  SIGN_PANEL_CONTENT_CLASS,
  SIGN_PANEL_TAB_LABEL,
  SIGN_VISIBILITY_CLASS,
  SIGN_VISIBILITY_LABEL_TEXT,
  SIGN_VISIBILITY_TOGGLE_CLASS,
} from "../constants";
import type { BoundingBox } from "../data/bounding-box";
import { filterSignsByCategories, type SignCategoryKey } from "../data/sign-categories";
import type { SpatialIndex } from "../data/spatial-index";
import { overlapsTurkuCoverage } from "../data/turku-coverage";
import {
  DEFAULT_SIGN_PANEL_SETTINGS,
  type SettingsRepository,
  type SignPanelSettings,
} from "../settings/settings-repository";
import { openSignCategoryFilter, type SignCategoryFilter } from "./category-filter";
import { openSignList, type SignList } from "./sign-list";
import { ensureSignPanelStyles } from "./styles";

export interface SignPanelTabHost {
  registerScriptTab(): Promise<{ tabLabel: HTMLElement; tabPane: HTMLElement }>;
}

export interface SignPanelTabDeps {
  /**
   * The three SDK surfaces the panel touches: its own tab, the map-move event
   * that re-checks coverage, and the viewport bounds.
   */
  sdk: {
    Sidebar: SignPanelTabHost;
    Events: {
      /** Re-checks coverage when the user finishes moving the map. */
      on(args: { eventName: "wme-map-move-end"; eventHandler: () => void }): unknown;
    };
    Map: { getMapExtent(): number[] };
  };
  /** The WME page document (userscript sandboxes run in an isolated world — pass the page's). */
  document: Document;
  settingsRepository: SettingsRepository;
  /** The Visual Overlay state driven by Sign Panel controls (spec §4.5). */
  layer: {
    setVisible(visible: boolean): void;
    setCategoryFilter(categoryFilter: readonly SignCategoryKey[] | null): void;
  };
  /**
   * The in-memory spatial index the viewport list filters against (spec §4.5).
   * Read live rather than captured: the dataset resolves after the panel is
   * opened, and every refresh and map move re-reads whatever is active then.
   */
  spatialIndex: { current(): SpatialIndex };
}

export interface SignPanelTab {
  /**
   * WME state (layers, flags) does not survive reload/logout: re-apply the
   * persisted visibility and Sign Category filters after every wme-ready.
   * Registers the tab on the first ready, re-reads coverage, and keeps coverage
   * current on map moves. Idempotent: extra calls neither re-register nor
   * duplicate controls or the permanent attribution footer.
   */
  refresh(): Promise<void>;
  /**
   * Re-filters the viewport-driven sign list against the in-memory spatial
   * index and re-renders it (spec §4.5, AC-20). The tab already does this on
   * every wme-ready and map move; bootstrap calls it after a dataset swap
   * resolves later still — an ingest finishing after the ready left the list
   * reading the previous index.
   */
  refreshSignList(): void;
}

/** The tab's own controls, created once per registered pane. */
interface SignPanelControls {
  /** The pane holding the controls; WME can replace it between readies. */
  pane: HTMLElement;
  toggle: HTMLInputElement;
  notice: HTMLElement;
  categoryFilter: SignCategoryFilter;
  list: SignList;
}

export async function openSignPanelTab(deps: SignPanelTabDeps): Promise<SignPanelTab> {
  let controls: SignPanelControls | null = null;
  let subscribedToMapMoves = false;
  let invalidViewportWarned = false;
  let currentSettings: SignPanelSettings = DEFAULT_SIGN_PANEL_SETTINGS;
  let settingsWriteQueue: Promise<void> = Promise.resolve();

  return {
    async refresh(): Promise<void> {
      // Spec order (§4.1): register the sidebar tab on wme-ready, then re-apply
      // persisted state. If WME re-rendered the pane, registerScriptTab throws
      // InvalidStateError for this scriptId — bootstrap surfaces it.
      const tabControls = await ensureControls();
      ensureAttributionFooter(deps.document, tabControls.pane);

      currentSettings = await deps.settingsRepository.load();
      applyFlag(tabControls, currentSettings.showSigns);
      applyCategoryFilter(tabControls, currentSettings.categoryFilter);
      applyCoverage(tabControls);
      applySignList(tabControls);
    },

    refreshSignList(): void {
      // The list belongs to the pane the last ready registered; one WME has
      // replaced is rebuilt (and re-populated) by the next ready.
      withAttachedControls(applySignList);
    },
  };

  /** Registers the tab on the first ready, and again whenever WME replaces its pane. */
  async function ensureControls(): Promise<SignPanelControls> {
    const paneDetached = controls !== null && !deps.document.contains(controls.pane);
    if (controls === null || paneDetached) {
      ensureSignPanelStyles(deps.document);
      const registeredTab = await deps.sdk.Sidebar.registerScriptTab();
      registeredTab.tabLabel.textContent = SIGN_PANEL_TAB_LABEL;
      controls = buildControls(
        deps.document,
        registeredTab.tabPane,
        persistVisibility,
        persistCategoryFilter,
      );
    }
    if (!subscribedToMapMoves) {
      // One subscription for the page's life: coverage follows the viewport, and
      // so does the sign list — both re-filter off the finished map move, with
      // zero requests and no debounce (spec §4.5, AC-20).
      deps.sdk.Events.on({ eventName: "wme-map-move-end", eventHandler: onMapMoved });
      subscribedToMapMoves = true;
    }
    return controls;
  }

  function onMapMoved(): void {
    // A pane WME replaced is rebuilt by the next ready; updating a detached one
    // would only write into a document nobody is looking at.
    withAttachedControls((panelControls) => {
      applyCoverage(panelControls);
      applySignList(panelControls);
    });
  }

  /** Runs an update only while WME's current tab pane remains attached. */
  function withAttachedControls(update: (panelControls: SignPanelControls) => void): void {
    const panelControls = controls;
    if (panelControls === null || !deps.document.contains(panelControls.pane)) return;
    update(panelControls);
  }

  /**
   * The persisted flag, as the user last left it. Applied on every ready, and
   * on every click — never on coverage changes: while the toggle is disabled
   * the flag cannot change, so re-reading storage per map move would only
   * widen the window in which a click's save could be clobbered.
   */
  function applyFlag(panelControls: SignPanelControls, visible: boolean): void {
    panelControls.toggle.checked = visible;
    deps.layer.setVisible(visible);
  }

  function applyCategoryFilter(
    panelControls: SignPanelControls,
    categoryFilter: readonly SignCategoryKey[] | null,
  ): void {
    panelControls.categoryFilter.setSelected(categoryFilter);
    deps.layer.setCategoryFilter(categoryFilter);
  }

  /**
   * Coverage decides the panel's controls and nothing else: the toggle's
   * enabled state and the notice. It never touches the layer or its markers
   * (spec §4.5, AC-17) — see the render site in bootstrap for why that is
   * enough.
   */
  function applyCoverage(panelControls: SignPanelControls): void {
    const covered = isCovered();
    panelControls.toggle.disabled = !covered;
    panelControls.notice.hidden = covered;
  }

  /**
   * The viewport-driven list: exactly the signs inside the current viewport,
   * counted in the header (spec §4.5, AC-20). The query runs against the
   * in-memory spatial index, so a re-filter costs no request and is never
   * debounced — the viewport is the only spatial input. Sign Categories filter
   * the same code-prefix groups in both the list and the Visual Overlay.
   */
  function applySignList(panelControls: SignPanelControls): void {
    const viewport = viewportOrNull();
    // An unusable viewport was already warned about, once, by the coverage read
    // on the same event. Clear stale rows rather than claiming they belong to
    // the current viewport.
    if (viewport === null) {
      panelControls.list.markUnavailable();
      return;
    }
    panelControls.list.render(
      filterSignsByCategories(
        deps.spatialIndex.current().query(viewport),
        currentSettings.categoryFilter,
      ),
    );
  }

  /**
   * Whether the viewport overlaps the Turku coverage extent. Bounds the SDK
   * cannot hand back as four finite numbers count as covered: every sign in
   * the registry lies inside the coverage extent, so the worst a broken read can do is
   * show an enabled toggle, while counting it as uncovered would park the
   * panel behind a notice the user cannot act on. Warned once per page load.
   */
  function isCovered(): boolean {
    const viewport = viewportOrNull();
    return viewport === null ? true : overlapsTurkuCoverage(viewport);
  }

  /** The viewport as a Bounding Box, or null when the SDK's bounds are unusable. */
  function viewportOrNull(): BoundingBox | null {
    const [left, bottom, right, top] = deps.sdk.Map.getMapExtent();
    if (
      isFiniteCoordinate(left) &&
      isFiniteCoordinate(bottom) &&
      isFiniteCoordinate(right) &&
      isFiniteCoordinate(top)
    ) {
      return [left, bottom, right, top];
    }
    if (!invalidViewportWarned) {
      invalidViewportWarned = true;
      console.warn(
        "[turku-signs] Map viewport bounds are not four finite coordinates — treating the map as covered by Turku.",
      );
    }
    return null;
  }

  /** Queues whole-settings writes so rapid control changes cannot overwrite each other. */
  function saveSettings(settings: SignPanelSettings): Promise<void> {
    const snapshot: SignPanelSettings = {
      ...settings,
      categoryFilter:
        settings.categoryFilter === null ? null : [...settings.categoryFilter],
    };
    settingsWriteQueue = settingsWriteQueue
      .catch(() => undefined)
      .then(() => deps.settingsRepository.save(snapshot));
    return settingsWriteQueue;
  }

  /** Persists the visibility flag while preserving current category selection. */
  function persistVisibility(visible: boolean): Promise<void> {
    currentSettings = { ...currentSettings, showSigns: visible };
    return saveSettings(currentSettings).then(() => deps.layer.setVisible(visible));
  }

  /** Applies category selection immediately, then persists it with visibility state. */
  function persistCategoryFilter(categoryFilter: readonly SignCategoryKey[] | null): void {
    currentSettings = { ...currentSettings, categoryFilter };
    deps.layer.setCategoryFilter(categoryFilter);
    withAttachedControls(applySignList);
    void saveSettings(currentSettings).catch((error: unknown) => {
      console.error("[turku-signs] Failed to persist Sign Category filter", error);
    });
  }
}

function isFiniteCoordinate(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function buildControls(
  document: Document,
  pane: HTMLElement,
  onVisibilityChange: (visible: boolean) => Promise<void>,
  onCategoryFilterChange: (categoryFilter: readonly SignCategoryKey[] | null) => void,
): SignPanelControls {
  const content = document.createElement("div");
  content.className = SIGN_PANEL_CONTENT_CLASS;

  const categoryFilter = openSignCategoryFilter(document, onCategoryFilterChange);

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
  content.append(categoryFilter.element, container);

  // Below the visibility block, above the permanent footer (which refresh()
  // appends last): the list is the tab's main content, not a control of its own.
  const list = openSignList(document, content);
  pane.append(content);

  toggle.addEventListener("change", () => {
    void onVisibilityChange(toggle.checked).catch((error: unknown) => {
      console.error("[turku-signs] Failed to persist the visibility flag", error);
    });
  });

  return { pane, toggle, notice, categoryFilter, list };
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
