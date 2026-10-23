import { vi } from "vite-plus/test";

import type { DatasetStore } from "../../src/data/dataset-store";
import type { SignDatasetRecord } from "../../src/data/sign-dataset-record";

/**
 * In-memory stand-in for the Client Cache persistence boundary (IndexedDB):
 * writes persist for later reads, and `writeFailures` injects the write
 * failures the recovery policy must survive.
 */
export function createFakeDatasetStore(
  options: {
    open?: boolean;
    record?: SignDatasetRecord | null;
    writeFailures?: number;
  } = {},
) {
  let stored: SignDatasetRecord | null = options.record ?? null;
  let writeFailuresLeft = options.writeFailures ?? 0;
  const write = vi.fn(async (record: SignDatasetRecord) => {
    if (writeFailuresLeft > 0) {
      writeFailuresLeft -= 1;
      throw new Error("QuotaExceededError");
    }
    stored = record;
  });
  const store: DatasetStore = {
    open: vi.fn(async () => options.open ?? true),
    read: vi.fn(async () => stored),
    write,
    wipe: vi.fn(async () => {}),
  };
  return store;
}
