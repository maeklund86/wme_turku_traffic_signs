import { createMemoryStore } from "../../src/storage/memory-store";
import type { KeyValueStore } from "../../src/storage/key-value-store";

/** Seed a store through the public KeyValueStore interface only — no production internals exposed. */
export async function createStoreSeededWith(
  entries: Record<string, string> = {},
): Promise<KeyValueStore> {
  const store = createMemoryStore();
  for (const [key, value] of Object.entries(entries)) {
    await store.setItem(key, value);
  }
  return store;
}
