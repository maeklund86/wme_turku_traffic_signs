import {
  SIGN_DATABASE_NAME,
  SIGN_DATASET_KEY_PREFIX,
  TURKU_PARTITION_STORE_NAME,
} from "../constants";
import {
  isOlderSchemaDatasetKey,
  signDatasetKey,
  type SignDatasetRecord,
} from "./sign-dataset-record";
import type { DatasetStore } from "./dataset-store";

const LOG_PREFIX = "[turku-signs]";

/** IndexedDB implementation of the Client Cache. */
export function createIndexedDbDatasetStore(): DatasetStore {
  let database: IDBDatabase | null = null;

  const requireStore = (mode: IDBTransactionMode): IDBObjectStore => {
    if (database === null) {
      throw new Error("Client Cache is not open");
    }
    return database
      .transaction(TURKU_PARTITION_STORE_NAME, mode)
      .objectStore(TURKU_PARTITION_STORE_NAME);
  };

  return {
    async open(): Promise<boolean> {
      try {
        database = await openDatabase();
      } catch (error) {
        console.warn(`${LOG_PREFIX} Client Cache unavailable — datasets stay memory-only.`, error);
        return false;
      }
      // Yield the database when another connection wants a schema change or a
      // delete; holding it open would block that work forever.
      database.onversionchange = () => {
        database?.close();
        database = null;
      };
      try {
        await deleteEntriesUnderOlderSchemaVersions(requireStore("readwrite"));
      } catch (error) {
        console.warn(`${LOG_PREFIX} Could not clear stranded Client Cache entries.`, error);
      }
      return true;
    },

    async read(): Promise<SignDatasetRecord | null> {
      // Only entries under the current schema version are ours to read;
      // anything else belongs to another script version's shape.
      const range = IDBKeyRange.bound(SIGN_DATASET_KEY_PREFIX, `${SIGN_DATASET_KEY_PREFIX}\uffff`);
      const entries = await request(requireStore("readonly").getAll(range));
      let newest: SignDatasetRecord | null = null;
      for (const entry of entries) {
        const parsed = parseRecord(entry);
        if (parsed !== null && (newest === null || parsed.storedAt > newest.storedAt)) {
          newest = parsed;
        }
      }
      return newest;
    },

    async write(record: SignDatasetRecord): Promise<void> {
      const store = requireStore("readwrite");
      const transaction = store.transaction;
      // Whole-dataset, version-keyed replacement: clear and put share one
      // transaction, so the new dataset replaces every previous one atomically
      // — a failed write rolls back to the entry that was already there.
      store.clear();
      await request(store.put(record, signDatasetKey(record.timeStamp)));
      await transactionCompleted(transaction);
    },

    async wipe(): Promise<void> {
      const store = requireStore("readwrite");
      const transaction = store.transaction;
      await request(store.clear());
      await transactionCompleted(transaction);
    },
  };
}

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(SIGN_DATABASE_NAME, 1);
    openRequest.onupgradeneeded = () => {
      if (!openRequest.result.objectStoreNames.contains(TURKU_PARTITION_STORE_NAME)) {
        openRequest.result.createObjectStore(TURKU_PARTITION_STORE_NAME);
      }
    };
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () =>
      reject(openRequest.error ?? new Error("Client Cache could not be opened"));
  });
}

/**
 * Stranded entries are entries keyed under an older schema version than
 * this script's (`turku-signs/v<n>/` with n below the current version).
 * Entries under newer versions belong to a later script version and are
 * left alone, as is anything this schema does not claim. Deletion happens
 * on open, before any read.
 */
async function deleteEntriesUnderOlderSchemaVersions(store: IDBObjectStore): Promise<void> {
  const transaction = store.transaction;
  const keys = await request(store.getAllKeys());
  for (const key of keys) {
    if (isOlderSchemaDatasetKey(String(key))) {
      await request(store.delete(key));
    }
  }
  await transactionCompleted(transaction);
}

/** Corrupt or foreign entries read as absent — the cache degrades, never crashes. */
function parseRecord(value: unknown): SignDatasetRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<SignDatasetRecord>;
  if (typeof candidate.timeStamp !== "string" || typeof candidate.storedAt !== "number")
    return null;
  if (!Array.isArray(candidate.signs)) return null;
  return {
    timeStamp: candidate.timeStamp,
    storedAt: candidate.storedAt,
    signs: candidate.signs as SignDatasetRecord["signs"],
  };
}

function request<T>(openRequest: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () =>
      reject(openRequest.error ?? new Error("Client Cache request failed"));
  });
}

/**
 * A request can succeed while the surrounding transaction still aborts
 * (quota exhaustion), so writes resolve only on commit — a rejected promise
 * here is exactly the write failure the recovery policy handles.
 */
function transactionCompleted(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Client Cache transaction aborted"));
  });
}
