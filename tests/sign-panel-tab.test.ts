import { describe, expect, it, vi } from "vitest";

import { createFakeWmeSdk } from "./support/fake-wme-sdk";

import { openSignPanelTab } from "../src/sign-panel/tab";
import { SettingsRepository } from "../src/settings/settings-repository";
import { createMemoryStore } from "../src/storage/memory-store";

async function paneOf(registerScriptTab: ReturnType<typeof vi.fn>, index = 0): Promise<HTMLElement> {
  const result = registerScriptTab.mock.results[index];
  if (!result) throw new Error("registerScriptTab was never called");
  return (await result.value).tabPane as HTMLElement;
}

describe("Sign Panel tab shell", () => {
  it("does not call into WME before the first wme-ready", async () => {
    const { sdk, registerScriptTab } = createFakeWmeSdk();
    const repository = new SettingsRepository(createMemoryStore());

    await openSignPanelTab({ sdk, document: globalThis.document, settingsRepository: repository });

    expect(registerScriptTab).not.toHaveBeenCalled();
  });

  it("registers the script tab and shows the attribution footer on ready", async () => {
    const { sdk, registerScriptTab } = createFakeWmeSdk();
    const repository = new SettingsRepository(createMemoryStore());
    const tab = await openSignPanelTab({ sdk, document: globalThis.document, settingsRepository: repository });

    await tab.refresh();

    expect(registerScriptTab).toHaveBeenCalledTimes(1);
    const { tabLabel, tabPane } = await registerScriptTab.mock.results[0]!.value;
    expect(tabLabel.textContent).toBe("Sign Panel");
    const pane = tabPane as HTMLElement;
    expect(pane.childElementCount).toBe(1);
    const footer = pane.firstElementChild!;
    expect(footer.textContent).toBe("Traffic sign data © City of Turku, CC BY 4.0");
    expect(footer.className).toContain("turku-signs-attribution");
    expect(await paneOf(registerScriptTab)).toBe(pane);
  });

  it("has no dismiss control anywhere in the tab (footer is permanent)", async () => {
    const { sdk, registerScriptTab } = createFakeWmeSdk();
    const repository = new SettingsRepository(createMemoryStore());
    const tab = await openSignPanelTab({ sdk, document: globalThis.document, settingsRepository: repository });

    await tab.refresh();

    const pane = await paneOf(registerScriptTab);
    const controls = pane.querySelectorAll("button, input, select, textarea, a, [role='button']");
    expect(controls).toHaveLength(0);
  });

  it("does not duplicate the footer when state is re-applied on a later ready", async () => {
    const { sdk, registerScriptTab } = createFakeWmeSdk();
    const repository = new SettingsRepository(createMemoryStore());
    const tab = await openSignPanelTab({ sdk, document: globalThis.document, settingsRepository: repository });

    await tab.refresh();
    await tab.refresh();

    expect(registerScriptTab).toHaveBeenCalledTimes(1);
    expect((await paneOf(registerScriptTab)).childElementCount).toBe(1);
  });

  it("re-creates the footer when WME replaces the tab pane", async () => {
    const { sdk, registerScriptTab } = createFakeWmeSdk();
    const repository = new SettingsRepository(createMemoryStore());
    const tab = await openSignPanelTab({ sdk, document: globalThis.document, settingsRepository: repository });
    await tab.refresh();

    // WME re-renders the pane: the memoized element is detached from the document.
    (await paneOf(registerScriptTab)).remove();
    await tab.refresh();

    expect(registerScriptTab).toHaveBeenCalledTimes(2);
    const freshPane = await paneOf(registerScriptTab, 1);
    expect(freshPane.textContent).toBe("Traffic sign data © City of Turku, CC BY 4.0");
  });

  it("re-applies the persisted visibility flag and category filter on every ready", async () => {
    const { sdk } = createFakeWmeSdk();
    const repository = new SettingsRepository(createMemoryStore());
    const tab = await openSignPanelTab({ sdk, document: globalThis.document, settingsRepository: repository });

    await expect(tab.refresh()).resolves.toEqual({ showSigns: true, categoryFilter: null });

    await repository.save({ showSigns: false, categoryFilter: ["priority"] });
    await expect(tab.refresh()).resolves.toEqual({ showSigns: false, categoryFilter: ["priority"] });
  });
});
