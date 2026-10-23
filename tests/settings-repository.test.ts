import { describe, expect, it } from "vite-plus/test";

import { SIGN_PANEL_SETTINGS_KEY } from "../src/constants";
import { createMemoryStore } from "../src/storage/memory-store";
import {
  DEFAULT_SIGN_PANEL_SETTINGS,
  SettingsRepository,
} from "../src/settings/settings-repository";
import { createStoreSeededWith } from "./support/seeded-store";

describe("SettingsRepository (Sign Panel persisted state)", () => {
  it("returns the defaults when nothing is persisted yet", async () => {
    const repository = new SettingsRepository(createMemoryStore());

    await expect(repository.load()).resolves.toEqual(DEFAULT_SIGN_PANEL_SETTINGS);
  });

  it("restores the visibility flag and Sign Category filter after a later wme-ready", async () => {
    const repository = new SettingsRepository(createMemoryStore());
    await repository.save({ showSigns: false, categoryFilter: ["speed-limits", "priority"] });

    await expect(repository.load()).resolves.toEqual({
      showSigns: false,
      categoryFilter: ["speed-limits", "priority"],
    });
  });

  it("falls back to the defaults when the persisted value is corrupt", async () => {
    const store = await createStoreSeededWith({ [SIGN_PANEL_SETTINGS_KEY]: "not json" });
    const repository = new SettingsRepository(store);

    await expect(repository.load()).resolves.toEqual(DEFAULT_SIGN_PANEL_SETTINGS);
  });

  it("falls back to per-field defaults when a persisted field has the wrong type", async () => {
    const store = await createStoreSeededWith({
      [SIGN_PANEL_SETTINGS_KEY]: JSON.stringify({ showSigns: "yes", categoryFilter: 7 }),
    });
    const repository = new SettingsRepository(store);

    await expect(repository.load()).resolves.toEqual(DEFAULT_SIGN_PANEL_SETTINGS);
  });

  it("ignores entries persisted under an older schema version key", async () => {
    const store = await createStoreSeededWith({
      "turku-signs/settings/v0": JSON.stringify({ showSigns: false }),
    });
    const repository = new SettingsRepository(store);

    await expect(repository.load()).resolves.toEqual(DEFAULT_SIGN_PANEL_SETTINGS);
  });
});
