import type { SignDatasetRecord } from "./sign-dataset-record";

/**
 * Client Cache persistence seam (spec §4.3): one object store per partition
 * ("Turku"), datasets keyed `turku-signs/v1/<timeStamp>`. Kept behind an
 * interface so the TTL/failure policy above it is testable without a browser,
 * and so the memory-only degradation needs no special case.
 */
export interface DatasetStore {
  /**
   * Opens the store and deletes entries stranded under older schema
   * versions. Resolves false when the store cannot be opened at all
   * (e.g. storage disabled in private browsing) — the caller then holds
   * datasets memory-only.
   */
  open(): Promise<boolean>;
  /** The newest stored dataset, or null when the store holds none. */
  read(): Promise<SignDatasetRecord | null>;
  /** Persists a fully fetched dataset, replacing the version-keyed entry. */
  write(record: SignDatasetRecord): Promise<void>;
  /** Drops every stored dataset entry — the write-failure recovery step. */
  wipe(): Promise<void>;
}
