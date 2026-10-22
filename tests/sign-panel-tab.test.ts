import { describe, expect, it, vi } from "vitest";

import { openSignPanelTab } from "../src/sign-panel/tab";
import { buildSpatialIndex } from "../src/data/spatial-index";
import type { TrafficSign } from "../src/data/traffic-sign";
import { officialSignIconUrl } from "../src/visual-overlay/sign-icon";
import { SettingsRepository } from "../src/settings/settings-repository";
import { createMemoryStore } from "../src/storage/memory-store";
import { createFakeWmeSdk } from "./support/fake-wme-sdk";
import {
  fullNotesOf,
  listHeaderOf,
  noticeOf,
  paneOf,
  rowsOf,
  toggleCheckbox,
  toggleOf,
} from "./support/sign-panel-pane";
import { silenceConsole } from "./support/silence-console";
import { sign } from "./support/turku-sign";

/** A viewport around central Turku: inside the coverage extent. */
const INSIDE_TURKU = [22.2, 60.4, 22.3, 60.5];
/** A viewport west of Turku that misses the coverage extent entirely. */
const OUTSIDE_TURKU = [21.5, 60.0, 22.0, 60.2];

/** Stands in for the Visual Overlay; the panel only ever drives its visibility. */
function createFakeLayer() {
  const setVisible = vi.fn();
  return { setVisible, layer: { setVisible } };
}

async function openTab(
  options: {
    covered?: boolean;
    repository?: SettingsRepository;
    /** The active dataset's signs, indexed as the dataset source indexes them. */
    signs?: readonly TrafficSign[];
  } = {},
) {
  const fake = createFakeWmeSdk();
  fake.map.getMapExtent.mockReturnValue(options.covered === false ? OUTSIDE_TURKU : INSIDE_TURKU);
  const repository = options.repository ?? new SettingsRepository(createMemoryStore());
  const layer = createFakeLayer();
  let activeSigns = options.signs ?? [];
  return {
    fake,
    registerScriptTab: fake.registerScriptTab,
    repository,
    layer,
    /** Swaps the active dataset in, as an ingest does after the panel opened. */
    setActiveSigns: (signs: readonly TrafficSign[]) => {
      activeSigns = signs;
    },
    tab: await openSignPanelTab({
      sdk: fake.sdk,
      document: globalThis.document,
      settingsRepository: repository,
      layer: layer.layer,
      spatialIndex: { current: () => buildSpatialIndex(activeSigns) },
    }),
  };
}

describe("Sign Panel tab shell", () => {
  it("does not call into WME before the first wme-ready", async () => {
    const fake = createFakeWmeSdk();
    const layer = createFakeLayer();

    await openSignPanelTab({
      sdk: fake.sdk,
      document: globalThis.document,
      settingsRepository: new SettingsRepository(createMemoryStore()),
      layer: layer.layer,
      spatialIndex: { current: () => buildSpatialIndex([]) },
    });

    expect(fake.registerScriptTab).not.toHaveBeenCalled();
    expect(fake.events.on).not.toHaveBeenCalled();
  });

  it("registers the script tab, its checkbox and the attribution footer on ready", async () => {
    const { registerScriptTab, tab } = await openTab();

    await tab.refresh();

    expect(registerScriptTab).toHaveBeenCalledTimes(1);
    const { tabLabel } = await registerScriptTab.mock.results[0]!.value;
    expect(tabLabel.textContent).toBe("Sign Panel");
    const pane = await paneOf(registerScriptTab);
    const toggle = toggleOf(pane);
    expect(toggle.type).toBe("checkbox");
    expect(toggle.checked).toBe(true);
    expect(toggle.closest("label")?.textContent).toBe("Show traffic signs");
    // The footer stays below the controls, permanent and last.
    expect(pane.lastElementChild?.textContent).toBe("Traffic sign data © City of Turku, CC BY 4.0");
  });

  it("has no control inside the permanent footer (nothing can dismiss it)", async () => {
    const { registerScriptTab, tab } = await openTab({ signs: [sign("1", 22.25, 60.45)] });

    await tab.refresh();

    const pane = await paneOf(registerScriptTab);
    // Rows are disclosure buttons; the footer itself stays inert and permanent.
    const footer = pane.querySelector("footer");
    expect(footer?.textContent).toBe("Traffic sign data © City of Turku, CC BY 4.0");
    expect(footer?.querySelector("button, a, select, textarea, [role='button']")).toBeNull();
    expect(pane.lastElementChild).toBe(footer);
    // The only input the tab owns is the visibility checkbox; list rows are
    // disclosure buttons, never inputs.
    const inputs = pane.querySelectorAll("input");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.className).toBe("turku-signs-visibility-toggle");
  });

  it("does not duplicate the controls or the footer when state is re-applied on a later ready", async () => {
    const { registerScriptTab, layer, tab } = await openTab();

    await tab.refresh();
    await tab.refresh();

    expect(registerScriptTab).toHaveBeenCalledTimes(1);
    const pane = await paneOf(registerScriptTab);
    expect(pane.querySelectorAll("input")).toHaveLength(1);
    expect(pane.lastElementChild?.textContent).toBe("Traffic sign data © City of Turku, CC BY 4.0");
    expect(layer.setVisible).toHaveBeenCalledTimes(2);
  });

  it("re-creates the controls and the footer when WME replaces the tab pane", async () => {
    const { registerScriptTab, tab } = await openTab();

    await tab.refresh();
    // WME re-renders the pane: the memoized element is detached from the document.
    (await paneOf(registerScriptTab)).remove();
    await tab.refresh();

    expect(registerScriptTab).toHaveBeenCalledTimes(2);
    const freshPane = await paneOf(registerScriptTab, 1);
    expect(freshPane.querySelectorAll("input")).toHaveLength(1);
    expect(freshPane.lastElementChild?.textContent).toBe("Traffic sign data © City of Turku, CC BY 4.0");
  });
});

describe("Sign Panel visibility control (AC-16)", () => {
  it("defaults the checkbox on and applies the flag to the overlay layer", async () => {
    const { registerScriptTab, layer, tab } = await openTab();

    await tab.refresh();

    expect(toggleOf(await paneOf(registerScriptTab)).checked).toBe(true);
    expect(layer.setVisible).toHaveBeenCalledWith(true);
  });

  it("re-reads the persisted flag on every ready and applies it", async () => {
    const { layer, repository, tab } = await openTab();

    await tab.refresh();
    await repository.save({ showSigns: false, categoryFilter: null });
    await tab.refresh();

    expect(layer.setVisible).toHaveBeenLastCalledWith(false);
  });

  it("re-applies the persisted flag for a freshly opened tab, as after a reload", async () => {
    const { registerScriptTab, repository, tab } = await openTab();

    await tab.refresh();
    await toggleCheckbox(await paneOf(registerScriptTab), false);
    expect((await repository.load()).showSigns).toBe(false);

    // A fresh page load: a new tab instance over the same storage reads the flag.
    const reloaded = await openTab({ repository });
    await reloaded.tab.refresh();

    expect(reloaded.layer.setVisible).toHaveBeenCalledWith(false);
    expect(toggleOf(await paneOf(reloaded.registerScriptTab)).checked).toBe(false);
  });

  it("writes the flag to storage and moves the layer", async () => {
    const { registerScriptTab, layer, repository, tab } = await openTab();

    await tab.refresh();
    await toggleCheckbox(await paneOf(registerScriptTab), false);

    expect(layer.setVisible).toHaveBeenLastCalledWith(false);
    expect((await repository.load()).showSigns).toBe(false);
  });

  it("keeps the category filter when the visibility flag changes", async () => {
    const { registerScriptTab, repository, tab } = await openTab();

    await repository.save({ showSigns: true, categoryFilter: ["priority"] });
    await tab.refresh();
    await toggleCheckbox(await paneOf(registerScriptTab), false);

    await expect(repository.load()).resolves.toEqual({ showSigns: false, categoryFilter: ["priority"] });
  });
});

describe("Sign Panel outside Turku coverage (AC-17)", () => {
  it("shows the notice, disables the toggle and leaves the map untouched", async () => {
    const { layer, registerScriptTab, tab } = await openTab({ covered: false });

    await tab.refresh();

    const pane = await paneOf(registerScriptTab);
    expect(noticeOf(pane).hidden).toBe(false);
    expect(noticeOf(pane).textContent).toBe(
      "Outside Turku coverage — the sign registry only covers the City of Turku.",
    );
    expect(toggleOf(pane).disabled).toBe(true);
    expect(layer.setVisible).toHaveBeenCalledWith(true);
  });

  it("hides the notice and enables the toggle inside the coverage extent", async () => {
    const { registerScriptTab, tab } = await openTab({ covered: true });

    await tab.refresh();

    const pane = await paneOf(registerScriptTab);
    expect(noticeOf(pane).hidden).toBe(true);
    expect(toggleOf(pane).disabled).toBe(false);
  });

  it("still shows the persisted flag, disabled, outside the coverage extent", async () => {
    const { registerScriptTab, repository, tab } = await openTab({ covered: false });

    await repository.save({ showSigns: false, categoryFilter: null });
    await tab.refresh();

    const pane = await paneOf(registerScriptTab);
    expect(toggleOf(pane).checked).toBe(false);
    expect(toggleOf(pane).disabled).toBe(true);
    expect(noticeOf(pane).hidden).toBe(false);
  });

  it("follows the map into coverage on a map move, without touching the layer", async () => {
    const { fake, layer, registerScriptTab, tab } = await openTab({ covered: false });

    await tab.refresh();
    const pane = await paneOf(registerScriptTab);
    expect(noticeOf(pane).hidden).toBe(false);

    // The user pans Helsinki → Turku: no wme-ready, just a finished map move.
    fake.map.getMapExtent.mockReturnValue(INSIDE_TURKU);
    fake.emitMapMoveEnd();

    expect(noticeOf(pane).hidden).toBe(true);
    expect(toggleOf(pane).disabled).toBe(false);
    // Coverage never drives the layer: only the ready applied the flag, once.
    expect(layer.setVisible).toHaveBeenCalledTimes(1);
  });

  it("re-disables the toggle when the map pans back out", async () => {
    const { fake, layer, registerScriptTab, tab } = await openTab();

    await tab.refresh();
    const pane = await paneOf(registerScriptTab);
    expect(toggleOf(pane).disabled).toBe(false);

    fake.map.getMapExtent.mockReturnValue(OUTSIDE_TURKU);
    fake.emitMapMoveEnd();

    expect(toggleOf(pane).disabled).toBe(true);
    expect(noticeOf(pane).hidden).toBe(false);
    expect(layer.setVisible).toHaveBeenCalledTimes(1);
  });

  it("skips a pane WME has already replaced, leaving it to the next ready", async () => {
    const { fake, registerScriptTab, tab } = await openTab();

    await tab.refresh();
    const stalePane = await paneOf(registerScriptTab);
    stalePane.remove();

    fake.map.getMapExtent.mockReturnValue(OUTSIDE_TURKU);
    expect(() => fake.emitMapMoveEnd()).not.toThrow();

    // The detached pane keeps whatever the last ready left on it.
    expect(noticeOf(stalePane).hidden).toBe(true);
    expect(registerScriptTab).toHaveBeenCalledTimes(1);
  });

  it("subscribes to map moves once, however many readies fire", async () => {
    const { fake, tab } = await openTab();

    await tab.refresh();
    await tab.refresh();

    const mapMoves = fake.events.on.mock.calls.filter(
      ([args]) => (args as { eventName: string }).eventName === "wme-map-move-end",
    );
    expect(mapMoves).toHaveLength(1);
  });

  it("treats an unusable extent as covered and warns once", async () => {
    silenceConsole();
    const { fake, registerScriptTab, tab } = await openTab();

    // Not four coordinates at all.
    fake.map.getMapExtent.mockReturnValue([22.2]);
    await tab.refresh();

    const pane = await paneOf(registerScriptTab);
    expect(noticeOf(pane).hidden).toBe(true);
    expect(toggleOf(pane).disabled).toBe(false);
    expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1);

    // The same broken extent on a later move must not warn again.
    fake.emitMapMoveEnd();
    expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1);
  });

  it("treats a non-finite coordinate as an unusable extent", async () => {
    silenceConsole();
    const { fake, registerScriptTab, tab } = await openTab();

    fake.map.getMapExtent.mockReturnValue([22.2, 60.4, 22.3, Number.NaN]);
    await tab.refresh();

    expect(toggleOf(await paneOf(registerScriptTab)).disabled).toBe(false);
    expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1);
  });
});

describe("Viewport-driven sign list (AC-20, AC-21, AC-24)", () => {
  /** Inside the INSIDE_TURKU viewport. */
  const NEARBY = sign("nearby", 22.25, 60.45);
  /** Also inside the INSIDE_TURKU viewport. */
  const OTHER = sign("other", 22.28, 60.42);
  /** Well east of it, so no extent the panel sees contains it. */
  const FAR_AWAY = sign("far", 23.5, 61.0);

  it("counts the signs inside the extent and re-filters on a finished map move", async () => {
    const { fake, registerScriptTab, tab } = await openTab({ signs: [NEARBY, OTHER, FAR_AWAY] });

    await tab.refresh();

    const pane = await paneOf(registerScriptTab);
    expect(listHeaderOf(pane).textContent).toBe("2 signs in view");
    expect(rowsOf(pane).map((row) => row.querySelector(".turku-signs-row-name")!.textContent)).toEqual([
      "C38 Pysäköinti kielletty",
      "C38 Pysäköinti kielletty",
    ]);

    // The user zooms in: no wme-ready, just a finished map move.
    fake.map.getMapExtent.mockReturnValue([22.24, 60.44, 22.26, 60.46]);
    fake.emitMapMoveEnd();

    expect(listHeaderOf(pane).textContent).toBe("1 sign in view");
    expect(rowsOf(pane)).toHaveLength(1);
    // The single row is still a row of this pane's list — nothing was replaced.
    expect(rowsOf(pane)[0]!.parentElement!.parentElement!.parentElement).toBe(pane);
  });

  it("shows the zero count when the viewport misses every sign", async () => {
    const { registerScriptTab, tab } = await openTab({ signs: [FAR_AWAY] });

    await tab.refresh();

    const pane = await paneOf(registerScriptTab);
    expect(listHeaderOf(pane).textContent).toBe("0 signs in view");
    expect(rowsOf(pane)).toHaveLength(0);
  });

  it("re-reads the active dataset on a map move, as an ingest swap leaves it", async () => {
    const { fake, registerScriptTab, setActiveSigns, tab } = await openTab({ signs: [NEARBY] });

    await tab.refresh();
    const pane = await paneOf(registerScriptTab);
    expect(listHeaderOf(pane).textContent).toBe("1 sign in view");

    setActiveSigns([NEARBY, OTHER]);
    fake.emitMapMoveEnd();

    expect(listHeaderOf(pane).textContent).toBe("2 signs in view");
  });

  it("refreshes the list after a dataset swap without a ready or a map move", async () => {
    const { registerScriptTab, setActiveSigns, tab } = await openTab();

    await tab.refresh();
    const pane = await paneOf(registerScriptTab);
    expect(listHeaderOf(pane).textContent).toBe("0 signs in view");

    // The dataset resolves after the ready rendered the list from an empty index.
    setActiveSigns([NEARBY, OTHER]);
    tab.refreshSignList();

    expect(listHeaderOf(pane).textContent).toBe("2 signs in view");
    expect(rowsOf(pane)).toHaveLength(2);
  });

  it("renders the official icon, the code and the verbatim Finnish name (AC-24)", async () => {
    const { registerScriptTab, tab } = await openTab({
      signs: [sign("nearby", 22.25, 60.45, { signName: "C38 Pysäköinti kielletty" })],
    });

    await tab.refresh();

    const [row] = rowsOf(await paneOf(registerScriptTab));
    expect(row!.querySelector("img")!.src).toBe(officialSignIconUrl("C38"));
    expect(row!.querySelector(".turku-signs-row-code")!.textContent).toBe("C38");
    expect(row!.querySelector(".turku-signs-row-name")!.textContent).toBe("C38 Pysäköinti kielletty");
  });

  it("draws the code plate for a code the pinned collection has no SVG for", async () => {
    const { registerScriptTab, tab } = await openTab({
      signs: [sign("nearby", 22.25, 60.45, { signCode: "ZZ99" })],
    });

    await tab.refresh();

    const [row] = rowsOf(await paneOf(registerScriptTab));
    expect(row!.querySelector("img")!.src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it("expands a row inline to the full note, keeping the list in place", async () => {
    const note = "Pysäköinti kielletty — katualueella, poikkeus poliisin luvalla";
    const { registerScriptTab, tab } = await openTab({
      signs: [sign("nearby", 22.25, 60.45, { notes: note })],
    });

    await tab.refresh();

    const pane = await paneOf(registerScriptTab);
    const [row] = rowsOf(pane);
    expect(row!.querySelector(".turku-signs-row-notes")!.textContent).toBe(note);

    const fullNotes = fullNotesOf(row!);
    expect(fullNotes.textContent).toBe(note);
    expect(fullNotes.hidden).toBe(true);
    expect(row!.getAttribute("aria-expanded")).toBe("false");

    row!.click();

    expect(row!.getAttribute("aria-expanded")).toBe("true");
    expect(fullNotes.hidden).toBe(false);
    // Inline disclosure: the list itself neither moves nor replaces itself.
    expect(pane.contains(fullNotes)).toBe(true);
    expect(rowsOf(pane)).toHaveLength(1);

    row!.click();

    expect(fullNotes.hidden).toBe(true);
    expect(row!.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders no note and no expansion when the registry has none (AC-21)", async () => {
    const { registerScriptTab, tab } = await openTab({ signs: [NEARBY] });

    await tab.refresh();

    const [row] = rowsOf(await paneOf(registerScriptTab));
    expect(row!.querySelector(".turku-signs-row-notes")).toBeNull();
    row!.click();
    expect(row!.parentElement!.querySelector(".turku-signs-row-notes-full")).toBeNull();
  });

  it("keeps the list as it was when the extent is unusable", async () => {
    silenceConsole();
    const { fake, registerScriptTab, tab } = await openTab({ signs: [NEARBY, OTHER] });

    await tab.refresh();
    const pane = await paneOf(registerScriptTab);
    expect(listHeaderOf(pane).textContent).toBe("2 signs in view");

    fake.map.getMapExtent.mockReturnValue([22.2]);
    fake.emitMapMoveEnd();

    expect(listHeaderOf(pane).textContent).toBe("2 signs in view");
    expect(rowsOf(pane)).toHaveLength(2);
  });
});
