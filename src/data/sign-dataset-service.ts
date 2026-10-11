import { CACHE_TTL_MS } from "../constants";
import type { DatasetStore } from "./dataset-store";
import type { SignDatasetRecord } from "./sign-dataset-record";
import { buildSpatialIndex, type SpatialIndex } from "./spatial-index";

/** The active Turku sign dataset, ready for client-side filtering and rendering. */
export interface SignDataset {
  /** OGC API response dataset timestamp of the active dataset. */
  readonly timeStamp: string;
  readonly index: SpatialIndex;
}

/**
 * The dataset the script renders from: cache-first, never blocking a render
 * on the network (spec §4.3). First load pulls the whole registry; later
 * loads render instantly from the Client Cache.
 */
export interface SignDatasetSource {
  /**
   * Resolves with the active dataset: the Client Cache entry when one exists
   * and is fresh, the cached dataset immediately when it is stale (with a
   * background refetch), or the freshly ingested whole registry on an empty
   * cache. Never rejects — a failed fetch leaves the previous dataset, or an
   * empty one when nothing was ever cached.
   */
  load(): Promise<SignDataset>;
  /** The active dataset snapshot; empty until the first load resolves. */
  current(): SignDataset;
}

export interface SignDatasetServiceDeps {
  /** Client Cache persistence; its open result decides persistence availability. */
  readonly store: DatasetStore;
  /** Ingests the whole registry through the Trimble OGC API. */
  readonly fetchDataset: () => Promise<SignDatasetRecord>;
  /** Clock seam for the TTL decision; defaults to `Date.now`. */
  readonly now?: () => number;
}

const LOG_PREFIX = "[turku-signs]";
const EMPTY_DATASET: SignDataset = { timeStamp: "", index: buildSpatialIndex([]) };

/**
 * Opens the Client Cache and wires the freshness/failure policy: the cached
 * dataset renders immediately; ingestion happens only on an empty cache or
 * behind a 7-day-stale entry; every persisted write goes through the
 * wipe-and-retry-once, then memory-only degradation.
 */
export async function openSignDatasetSource(
  deps: SignDatasetServiceDeps,
): Promise<SignDatasetSource> {
  const now = deps.now ?? Date.now;
  const persistingAtStart = await deps.store.open();
  let persisting = persistingAtStart;
  let currentDataset: SignDataset = EMPTY_DATASET;
  let loading: Promise<SignDataset> | null = null;

  return {
    load,
    current: () => currentDataset,
  };

  /** Coalesces concurrent loads; a settled failed attempt can be retried by a later load. */
  function load(): Promise<SignDataset> {
    loading ??= loadFromCacheOrIngest().finally(() => {
      loading = null;
    });
    return loading;
  }

  async function loadFromCacheOrIngest(): Promise<SignDataset> {
    const cached = await readCache();
    if (cached !== null) {
      currentDataset = datasetOf(cached);
      if (now() - cached.storedAt > CACHE_TTL_MS) {
        revalidateInBackground();
      }
      return currentDataset;
    }
    return ingestFirst();
  }

  async function readCache(): Promise<SignDatasetRecord | null> {
    if (!persisting) return null;
    try {
      return await deps.store.read();
    } catch (error) {
      console.error(`${LOG_PREFIX} Client Cache read failed — datasets stay memory-only.`, error);
      persisting = false;
      return null;
    }
  }

  async function ingestFirst(): Promise<SignDataset> {
    try {
      return await ingest(await deps.fetchDataset());
    } catch (error) {
      // An incomplete pagination rejects the ingest; the partial dataset is
      // discarded with it, and whatever the Client Cache already held stays
      // active. Nothing is written unless the whole dataset arrived.
      console.error(`${LOG_PREFIX} Ingest failed — the previous dataset stays active.`, error);
      return currentDataset;
    }
  }

  function revalidateInBackground(): void {
    void deps.fetchDataset().then(
      (record) => {
        void ingest(record).catch((error: unknown) => {
          console.error(`${LOG_PREFIX} Revalidation ingest failed after fetch.`, error);
        });
      },
      (error: unknown) => {
        console.error(
          `${LOG_PREFIX} Background revalidation failed — the cached dataset stays active.`,
          error,
        );
      },
    );
  }

  /** Persists the dataset, then swaps it into memory for rendering. */
  async function ingest(record: SignDatasetRecord): Promise<SignDataset> {
    await persist(record);
    currentDataset = datasetOf(record);
    return currentDataset;
  }

  async function persist(record: SignDatasetRecord): Promise<void> {
    if (!persisting) return;
    try {
      await deps.store.write(record);
    } catch (error) {
      console.warn(
        `${LOG_PREFIX} Client Cache write failed — wiping the dataset store and retrying.`,
        error,
      );
      await wipeCacheQuietly();
      try {
        await deps.store.write(record);
      } catch (retryError) {
        persisting = false;
        console.warn(
          `${LOG_PREFIX} Client Cache write failed again — datasets stay memory-only for this session.`,
          retryError,
        );
      }
    }
  }

  async function wipeCacheQuietly(): Promise<void> {
    try {
      await deps.store.wipe();
    } catch (error) {
      console.warn(`${LOG_PREFIX} Client Cache wipe failed.`, error);
    }
  }
}

function datasetOf(record: SignDatasetRecord): SignDataset {
  return { timeStamp: record.timeStamp, index: buildSpatialIndex(record.signs) };
}
