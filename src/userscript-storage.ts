import type { KeyValueStore } from "./storage/key-value-store";
import { createMemoryStore } from "./storage/memory-store";

/**
 * Userscript storage (Tampermonkey GM.*) — the persistence the Sign Panel
 * scaffold re-applies after every wme-ready, since WME state does not
 * survive reload/logout. Falls back to session memory if GM is unavailable.
 */
export function createUserscriptStore(): KeyValueStore {
  const gm = globalThis.GM;
  if (gm && typeof gm.getValue === "function" && typeof gm.setValue === "function") {
    return {
      getItem: (key) => gm.getValue(key, null),
      setItem: (key, value) => gm.setValue(key, value),
    };
  }
  console.warn("[turku-signs] GM storage unavailable — falling back to session memory.");
  return createMemoryStore();
}
