// IndexedDB pitfalls under vitest+jsdom (cursor-delete hangs; an open
// connection blocks deleteDatabase and queues later opens): read
// support/INDEXEDDB-NOTES.md before changing how this test seeds or scans.
import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vite-plus/test";

import { SIGN_DATABASE_NAME, TURKU_PARTITION_STORE_NAME } from "../src/constants";
import { createIndexedDbDatasetStore } from "../src/data/indexed-db-dataset-store";
import { signDatasetKey } from "../src/data/sign-dataset-record";
import { record, sign } from "./support/turku-sign";

const TURKU_RECORD = record("2026-10-11T19:50:25.6808150Z", 1_764_000_000_000, [
  sign("321020431", 22.27617187661397, 60.443853785959234),
  sign("345919110", 22.223991014087638, 60.434167846403504),
]);

/** Seeds raw entries into the Client Cache database, bypassing the seam. */
async function seedRawEntries(entries: Record<string, unknown>): Promise<void> {
  const database = await openRawDatabase();
  const transaction = database.transaction(TURKU_PARTITION_STORE_NAME, "readwrite");
  const store = transaction.objectStore(TURKU_PARTITION_STORE_NAME);
  for (const [key, value] of Object.entries(entries)) {
    store.put(value, key);
  }
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function rawEntryKeys(): Promise<string[]> {
  const database = await openRawDatabase();
  const keys = await new Promise<string[]>((resolve, reject) => {
    const cursorRequest = database
      .transaction(TURKU_PARTITION_STORE_NAME, "readonly")
      .objectStore(TURKU_PARTITION_STORE_NAME)
      .openKeyCursor();
    const collected: string[] = [];
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor === null) {
        resolve(collected);
        return;
      }
      if (typeof cursor.key !== "string") {
        reject(new Error("Expected Client Cache entry key to be a string"));
        return;
      }
      collected.push(cursor.key);
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
  database.close();
  return keys;
}

function openRawDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(SIGN_DATABASE_NAME, 1);
    openRequest.onupgradeneeded = () => {
      openRequest.result.createObjectStore(TURKU_PARTITION_STORE_NAME);
    };
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
  });
}

beforeEach(async () => {
  await new Promise<void>((resolve) => {
    const deleteRequest = indexedDB.deleteDatabase(SIGN_DATABASE_NAME);
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => resolve();
    deleteRequest.onblocked = () => resolve();
  });
});

describe("Client Cache (IndexedDB dataset store)", () => {
  it("round-trips a fetched dataset", async () => {
    const store = createIndexedDbDatasetStore();
    await store.open();

    await store.write(TURKU_RECORD);

    await expect(store.read()).resolves.toEqual(TURKU_RECORD);
  });

  it("stores datasets under the schema-versioned key turku-signs/v1/<timeStamp>", async () => {
    const store = createIndexedDbDatasetStore();
    await store.open();

    await store.write(TURKU_RECORD);

    await expect(rawEntryKeys()).resolves.toEqual([signDatasetKey("2026-10-11T19:50:25.6808150Z")]);
  });

  it("replaces the previous dataset when a refetch writes a new one", async () => {
    const store = createIndexedDbDatasetStore();
    await store.open();
    await store.write(record("2026-10-01T00:00:00.000Z", 1_000, [sign("old", 22.1, 60.4)]));
    await store.write(record("2026-10-11T00:00:00.000Z", 2_000, [sign("new", 22.2, 60.5)]));

    await expect(rawEntryKeys()).resolves.toEqual(["turku-signs/v1/2026-10-11T00:00:00.000Z"]);
    await expect(store.read()).resolves.toEqual(
      record("2026-10-11T00:00:00.000Z", 2_000, [sign("new", 22.2, 60.5)]),
    );
  });

  it("deletes entries under older schema versions on open, keeping the current one", async () => {
    await seedRawEntries({
      "turku-signs/v0/2026-10-01T00:00:00.000Z": record("2026-10-01T00:00:00.000Z", 1_000, []),
      "turku-signs/settings/v1": "not a dataset, not a dataset-schema entry",
    });
    await seedRawEntries({ [signDatasetKey(TURKU_RECORD.timeStamp)]: TURKU_RECORD });

    const store = createIndexedDbDatasetStore();
    await expect(store.open()).resolves.toBe(true);

    await expect(rawEntryKeys()).resolves.toEqual([
      "turku-signs/settings/v1",
      signDatasetKey(TURKU_RECORD.timeStamp),
    ]);
    await expect(store.read()).resolves.toEqual(TURKU_RECORD);
  });

  it("leaves entries under newer schema versions alone", async () => {
    await seedRawEntries({
      "turku-signs/v2/2099-01-01T00:00:00.000Z": record("2099-01-01T00:00:00.000Z", 9_999, []),
    });

    const store = createIndexedDbDatasetStore();
    await expect(store.open()).resolves.toBe(true);

    await expect(rawEntryKeys()).resolves.toEqual(["turku-signs/v2/2099-01-01T00:00:00.000Z"]);
    await expect(store.read()).resolves.toBeNull();
  });

  it("wipes every dataset entry", async () => {
    const store = createIndexedDbDatasetStore();
    await store.open();
    await store.write(TURKU_RECORD);

    await store.wipe();

    await expect(rawEntryKeys()).resolves.toEqual([]);
    await expect(store.read()).resolves.toBeNull();
  });

  it("rejects cache operations before the store is opened", async () => {
    const store = createIndexedDbDatasetStore();

    await expect(store.read()).rejects.toThrow(/not open/i);
    await expect(store.write(TURKU_RECORD)).rejects.toThrow(/not open/i);
    await expect(store.wipe()).rejects.toThrow(/not open/i);
  });
});
