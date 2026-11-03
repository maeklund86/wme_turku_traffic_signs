import { SIGN_PANEL_SETTINGS_KEY } from "../constants";
import {
  filterKeysForCategory,
  isSignCategoryKey,
  isSignFilterKey,
  SIGN_FILTER_KEYS,
  type SignFilterKey,
} from "../data/sign-categories";
import { isPlainObject } from "../json";
import type { KeyValueStore } from "../storage/key-value-store";

export interface SignPanelSettings {
  /** Visibility flag for the Visual Overlay; re-applied on every wme-ready. */
  readonly showSigns: boolean;
  /** Selected terminal category/subcategory keys; null means the whole tree. */
  readonly categoryFilter: readonly SignFilterKey[] | null;
}

export const DEFAULT_SIGN_PANEL_SETTINGS: SignPanelSettings = {
  showSigns: true,
  categoryFilter: null,
};

export class SettingsRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly key: string = SIGN_PANEL_SETTINGS_KEY,
  ) {}

  async load(): Promise<SignPanelSettings> {
    return parseSettings(await this.store.getItem(this.key));
  }

  async save(settings: SignPanelSettings): Promise<void> {
    await this.store.setItem(this.key, serializeSettings(settings));
  }
}

function serializeSettings(settings: SignPanelSettings): string {
  return JSON.stringify({
    showSigns: settings.showSigns,
    categoryFilter: settings.categoryFilter,
  });
}

/** Corrupt or partial persisted state degrades to defaults, never throws. */
function parseSettings(raw: string | null): SignPanelSettings {
  if (raw === null) return DEFAULT_SIGN_PANEL_SETTINGS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_SIGN_PANEL_SETTINGS;
  }
  if (!isPlainObject(parsed)) return DEFAULT_SIGN_PANEL_SETTINGS;
  const { showSigns, categoryFilter } = parsed;
  return {
    showSigns: typeof showSigns === "boolean" ? showSigns : DEFAULT_SIGN_PANEL_SETTINGS.showSigns,
    categoryFilter: parseCategoryFilter(categoryFilter),
  };
}

function parseCategoryFilter(value: unknown): readonly SignFilterKey[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) return DEFAULT_SIGN_PANEL_SETTINGS.categoryFilter;
  const selected = new Set<SignFilterKey>();
  for (const entry of value) {
    if (isSignCategoryKey(entry)) {
      for (const key of filterKeysForCategory(entry)) selected.add(key);
    } else if (isSignFilterKey(entry)) {
      selected.add(entry);
    } else {
      return DEFAULT_SIGN_PANEL_SETTINGS.categoryFilter;
    }
  }
  return SIGN_FILTER_KEYS.filter((key) => selected.has(key));
}
