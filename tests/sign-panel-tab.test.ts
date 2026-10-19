import { describe, expect, it, vi } from "vitest";

import { openSignPanelTab } from "../src/sign-panel/tab";
import { SettingsRepository } from "../src/settings/settings-repository";
import { createMemoryStore } from "../src/storage/memory-store";
import { createFakeWmeSdk } from "./support/fake-wme-sdk";
import { noticeOf, paneOf, toggleCheckbox, toggleOf } from "./support/sign-panel-pane";
import { silenceConsole } from "./support/silence-console";

/** A viewport around central Turku: inside the coverage extent. */
const INSIDE_TURKU = [22.2, 60.4, 22.3, 60.5];
/** A viewport west of Turku that misses the coverage extent entirely. */
const OUTSIDE_TURKU = [21.5, 60.0, 22.0, 60.2];

/** Stands in for the Visual Overlay; the panel only ever drives its visibility. */
function createFakeLayer() {
  const setVisible = vi.fn();
  return { setVisible, layer: { setVisible } };
}

async function openTab(options: { covered?: boolean; repository?: SettingsRepository } = {}) {
  const fake = createFakeWmeSdk();
  fake.map.getMapExtent.mockReturnValue(options.covered === false ? OUTSIDE_TURKU : INSIDE_TURKU);
  const repository = options.repository ?? new SettingsRepository(createMemoryStore());
  const layer = createFakeLayer();
  return {
    fake,
    registerScriptTab: fake.registerScriptTab,
    repository,
    layer,
    tab: await openSignPanelTab({
      sdk: fake.sdk,
      document: globalThis.document,
      settingsRepository: repository,
      layer: layer.layer,
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

  it("has no dismiss control anywhere in the tab (footer is permanent)", async () => {
    const { registerScriptTab, tab } = await openTab();

    await tab.refresh();

    const pane = await paneOf(registerScriptTab);
    const dismissControls = pane.querySelectorAll("button, a, select, textarea, [role='button']");
    expect(dismissControls).toHaveLength(0);
    // The one input the tab owns is the visibility checkbox.
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
