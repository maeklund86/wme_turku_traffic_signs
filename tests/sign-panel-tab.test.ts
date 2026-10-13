import { describe, expect, it, vi } from "vitest";

import {
  ATTRIBUTION_TEXT,
  OUTSIDE_TURKU_COVERAGE_CLASS,
  OUTSIDE_TURKU_COVERAGE_TEXT,
  SIGN_VISIBILITY_LABEL_TEXT,
  SIGN_VISIBILITY_TOGGLE_CLASS,
} from "../src/constants";
import { openSignPanelTab } from "../src/sign-panel/tab";
import { SettingsRepository } from "../src/settings/settings-repository";
import { createMemoryStore } from "../src/storage/memory-store";
import type { SignMarkerLayer } from "../src/visual-overlay/sign-marker-layer";
import { createFakeWmeSdk } from "./support/fake-wme-sdk";

async function paneOf(registerScriptTab: ReturnType<typeof vi.fn>, index = 0): Promise<HTMLElement> {
  const result = registerScriptTab.mock.results[index];
  if (!result) throw new Error("registerScriptTab was never called");
  return (await result.value).tabPane as HTMLElement;
}

function toggleOf(pane: HTMLElement): HTMLInputElement {
  const toggle = pane.querySelector<HTMLInputElement>(`.${SIGN_VISIBILITY_TOGGLE_CLASS}`);
  if (!toggle) throw new Error("the visibility checkbox was never rendered");
  return toggle;
}

function noticeOf(pane: HTMLElement): HTMLElement {
  const notice = pane.querySelector<HTMLElement>(`.${OUTSIDE_TURKU_COVERAGE_CLASS}`);
  if (!notice) throw new Error("the coverage notice was never rendered");
  return notice;
}

/** Stands in for the Visual Overlay; the panel only ever drives its visibility. */
function createFakeLayer() {
  const setVisible = vi.fn();
  const render = vi.fn();
  return { setVisible, render, layer: { setVisible, render } as SignMarkerLayer };
}

/** Reads the persisted flag straight back, as a fresh page load would. */
async function showSignsFlag(repository: SettingsRepository): Promise<boolean> {
  return (await repository.load()).showSigns;
}

async function openTab(options: { covered?: boolean; repository?: SettingsRepository } = {}) {
  const { sdk, registerScriptTab } = createFakeWmeSdk();
  const repository = options.repository ?? new SettingsRepository(createMemoryStore());
  const layer = createFakeLayer();
  const isCovered = vi.fn(() => options.covered ?? true);
  return {
    sdk,
    registerScriptTab,
    repository,
    layer,
    isCovered,
    tab: await openSignPanelTab({
      sdk,
      document: globalThis.document,
      settingsRepository: repository,
      layer: layer.layer,
      coverage: { isCovered },
    }),
  };
}

/** Clicks the checkbox the way a user does: set the state, fire the change. */
async function toggleCheckbox(pane: HTMLElement, checked: boolean): Promise<void> {
  const toggle = toggleOf(pane);
  toggle.checked = checked;
  toggle.dispatchEvent(new Event("change", { bubbles: true }));
  // The handler persists asynchronously; let it settle before asserting.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Sign Panel tab shell", () => {
  it("does not call into WME before the first wme-ready", async () => {
    const { sdk, registerScriptTab } = createFakeWmeSdk();
    const layer = createFakeLayer();

    await openSignPanelTab({
      sdk,
      document: globalThis.document,
      settingsRepository: new SettingsRepository(createMemoryStore()),
      layer: layer.layer,
      coverage: { isCovered: () => true },
    });

    expect(registerScriptTab).not.toHaveBeenCalled();
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
    expect(toggle.closest("label")?.textContent).toBe(SIGN_VISIBILITY_LABEL_TEXT);
    // The footer stays below the controls, permanent and last.
    expect(pane.lastElementChild?.textContent).toBe(ATTRIBUTION_TEXT);
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
    expect(inputs[0]!.className).toBe(SIGN_VISIBILITY_TOGGLE_CLASS);
  });

  it("does not duplicate the controls or the footer when state is re-applied on a later ready", async () => {
    const { registerScriptTab, layer, tab } = await openTab();

    await tab.refresh();
    await tab.refresh();

    expect(registerScriptTab).toHaveBeenCalledTimes(1);
    const pane = await paneOf(registerScriptTab);
    expect(pane.querySelectorAll("input")).toHaveLength(1);
    expect(pane.lastElementChild?.textContent).toBe(ATTRIBUTION_TEXT);
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
    expect(freshPane.lastElementChild?.textContent).toBe(ATTRIBUTION_TEXT);
  });

  it("re-applies the persisted visibility flag and category filter on every ready", async () => {
    const { repository, tab } = await openTab();

    await expect(tab.refresh()).resolves.toEqual({ showSigns: true, categoryFilter: null });

    await repository.save({ showSigns: false, categoryFilter: ["priority"] });
    await expect(tab.refresh()).resolves.toEqual({ showSigns: false, categoryFilter: ["priority"] });
  });
});

describe("Sign Panel visibility control (AC-16)", () => {
  it("defaults the checkbox on and applies the flag to the overlay layer", async () => {
    const { registerScriptTab, layer, tab } = await openTab();

    await tab.refresh();

    expect(toggleOf(await paneOf(registerScriptTab)).checked).toBe(true);
    expect(layer.setVisible).toHaveBeenCalledWith(true);
  });

  it("applies the persisted flag to the overlay layer on every ready", async () => {
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
    expect(await showSignsFlag(repository)).toBe(false);

    // A fresh page load: a new tab instance over the same storage reads the flag.
    const reloaded = await openTab({ repository });
    await reloaded.tab.refresh();

    expect(reloaded.layer.setVisible).toHaveBeenCalledWith(false);
    expect(toggleOf(await paneOf(reloaded.registerScriptTab)).checked).toBe(false);
  });

  it("writes the flag and moves the layer without re-rendering the markers", async () => {
    const { registerScriptTab, layer, repository, tab } = await openTab();

    await tab.refresh();
    await toggleCheckbox(await paneOf(registerScriptTab), false);

    expect(layer.setVisible).toHaveBeenLastCalledWith(false);
    expect(layer.render).not.toHaveBeenCalled();
    expect(await showSignsFlag(repository)).toBe(false);
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
    const { isCovered, layer, registerScriptTab, tab } = await openTab({ covered: false });

    await tab.refresh();

    const pane = await paneOf(registerScriptTab);
    expect(noticeOf(pane).hidden).toBe(false);
    expect(noticeOf(pane).textContent).toBe(OUTSIDE_TURKU_COVERAGE_TEXT);
    expect(toggleOf(pane).disabled).toBe(true);
    expect(isCovered).toHaveBeenCalled();
    expect(layer.setVisible).not.toHaveBeenCalled();
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
});
