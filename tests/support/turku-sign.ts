import type { SignDatasetRecord } from "../../src/data/sign-dataset-record";
import type { TrafficSign } from "../../src/data/traffic-sign";

/** A minimal Traffic Sign at a point; override any field as the test needs. */
export function sign(
  key: string,
  longitude: number,
  latitude: number,
  overrides: Partial<Omit<TrafficSign, "coordinates">> = {},
): TrafficSign {
  return {
    key,
    signCode: "C38",
    signName: "C38 Pysäköinti kielletty",
    notes: null,
    coordinates: [longitude, latitude],
    ...overrides,
  };
}

/** A Client Cache record, as fetched datasets are persisted. */
export function record(
  timeStamp: string,
  storedAt: number,
  signs: readonly TrafficSign[],
): SignDatasetRecord {
  return { timeStamp, storedAt, signs };
}
