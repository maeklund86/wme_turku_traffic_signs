import type { KeyValueStore } from "./key-value-store";

/**
 * Session-only fallback used when userscript storage (GM.*) is unavailable,
 * e.g. when the script runs without its grants declared.
 * Nothing here survives a page reload — the persisted scaffold must.
 */
export function createMemoryStore(): KeyValueStore {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => Promise.resolve(entries.get(key) ?? null),
    setItem: (key, value) => {
      entries.set(key, value);
      return Promise.resolve();
    },
  };
}
