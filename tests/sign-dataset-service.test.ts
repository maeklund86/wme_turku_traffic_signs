import { describe, expect, it, vi } from "vite-plus/test";

import { openSignDatasetSource } from "../src/data/sign-dataset-service";
import { CACHE_TTL_MS } from "../src/constants";
import type { SignDatasetRecord } from "../src/data/sign-dataset-record";
import { createFakeDatasetStore } from "./support/fake-dataset-store";
import { silenceConsole } from "./support/silence-console";
import { record, sign } from "./support/turku-sign";

const NOW = 1_764_000_000_000;
const OLD_TIME_STAMP = "2026-10-01T00:00:00.000Z";
const NEW_TIME_STAMP = "2026-10-11T19:50:25.6808150Z";
const TURKU_RECORD = record(NEW_TIME_STAMP, NOW, [
  sign("321020431", 22.27617187661397, 60.443853785959234),
  sign("345919110", 22.223991014087638, 60.434167846403504),
]);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });
  return { promise, resolve, reject };
}

describe("Sign dataset service (Client Cache policy)", () => {
  it("renders from the Client Cache without touching the network when fresh", async () => {
    silenceConsole();
    const store = createFakeDatasetStore({ record: TURKU_RECORD });
    const fetchDataset = vi.fn(async () => TURKU_RECORD);
    const service = await openSignDatasetSource({ store, fetchDataset, now: () => NOW });
    expect(store.open).toHaveBeenCalledTimes(1);

    const dataset = await service.load();

    expect(dataset.timeStamp).toBe(NEW_TIME_STAMP);
    expect(dataset.index.signs).toHaveLength(2);
    expect(fetchDataset).not.toHaveBeenCalled();
  });

  it("fetches the whole registry once on an empty cache and persists it", async () => {
    silenceConsole();
    const store = createFakeDatasetStore({ record: null });
    const fetchDataset = vi.fn(async () => TURKU_RECORD);
    const service = await openSignDatasetSource({ store, fetchDataset, now: () => NOW });

    const dataset = await service.load();
    await service.load();

    expect(dataset.timeStamp).toBe(NEW_TIME_STAMP);
    expect(fetchDataset).toHaveBeenCalledTimes(1);
    expect(store.write).toHaveBeenCalledTimes(1);
    expect(store.write).toHaveBeenCalledWith(TURKU_RECORD);
  });

  it("keeps the cache untouched when the first ingest fails", async () => {
    silenceConsole();
    const store = createFakeDatasetStore({ record: null });
    const service = await openSignDatasetSource({
      store,
      fetchDataset: async () => {
        throw new Error("page 2 failed");
      },
      now: () => NOW,
    });

    const dataset = await service.load();

    expect(dataset.index.signs).toHaveLength(0);
    expect(store.write).not.toHaveBeenCalled();
    expect(store.wipe).not.toHaveBeenCalled();
  });

  it("re-renders immediately from stale cache and swaps in the background refetch", async () => {
    silenceConsole();
    const staleRecord = record(OLD_TIME_STAMP, NOW - CACHE_TTL_MS - 1000, [
      sign("cached", 22.1, 60.4),
    ]);
    const store = createFakeDatasetStore({ record: staleRecord });
    const pending = deferred<SignDatasetRecord>();
    const fetchDataset = vi.fn(() => pending.promise);
    const service = await openSignDatasetSource({ store, fetchDataset, now: () => NOW });

    const dataset = await service.load();

    expect(dataset.timeStamp).toBe(OLD_TIME_STAMP);
    expect(dataset.index.signs).toHaveLength(1);
    expect(fetchDataset).toHaveBeenCalledTimes(1);

    pending.resolve(TURKU_RECORD);
    await vi.waitFor(() => expect(service.current().timeStamp).toBe(NEW_TIME_STAMP));
    expect(store.write).toHaveBeenCalledWith(TURKU_RECORD);
  });

  it("keeps the stale dataset when the background refetch fails", async () => {
    silenceConsole();
    const staleRecord = record(OLD_TIME_STAMP, NOW - CACHE_TTL_MS - 1000, [
      sign("cached", 22.1, 60.4),
    ]);
    const store = createFakeDatasetStore({ record: staleRecord });
    const rejection = deferred<never>();
    const fetchDataset = vi.fn(() => rejection.promise);
    const service = await openSignDatasetSource({ store, fetchDataset, now: () => NOW });

    await service.load();
    rejection.reject(new Error("network down"));
    await expect(rejection.promise).rejects.toThrow("network down");

    expect(service.current().timeStamp).toBe(OLD_TIME_STAMP);
    expect(service.current().index.signs).toHaveLength(1);
    expect(store.write).not.toHaveBeenCalled();
    expect(store.wipe).not.toHaveBeenCalled();
  });

  it("wipes the store and retries the write once when the first write fails", async () => {
    silenceConsole();
    const store = createFakeDatasetStore({ record: null, writeFailures: 1 });
    const service = await openSignDatasetSource({
      store,
      fetchDataset: async () => TURKU_RECORD,
      now: () => NOW,
    });

    const dataset = await service.load();

    expect(dataset.timeStamp).toBe(NEW_TIME_STAMP);
    expect(store.wipe).toHaveBeenCalledTimes(1);
    expect(store.write).toHaveBeenCalledTimes(2);
  });

  it("degrades to memory-only for the session when the second write fails", async () => {
    silenceConsole();
    const store = createFakeDatasetStore({ record: null, writeFailures: Number.POSITIVE_INFINITY });
    const service = await openSignDatasetSource({
      store,
      fetchDataset: async () => TURKU_RECORD,
      now: () => NOW,
    });

    const dataset = await service.load();

    expect(dataset.timeStamp).toBe(NEW_TIME_STAMP);
    expect(dataset.index.signs).toHaveLength(2);
    expect(store.wipe).toHaveBeenCalledTimes(1);
    expect(store.write).toHaveBeenCalledTimes(2);

    await service.load();
    expect(store.write).toHaveBeenCalledTimes(2);
  });

  it("serves memory-only when the store cannot be opened at all", async () => {
    silenceConsole();
    const store = createFakeDatasetStore({ open: false });
    const service = await openSignDatasetSource({
      store,
      fetchDataset: async () => TURKU_RECORD,
      now: () => NOW,
    });

    const dataset = await service.load();

    expect(dataset.timeStamp).toBe(NEW_TIME_STAMP);
    expect(store.read).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });
});
