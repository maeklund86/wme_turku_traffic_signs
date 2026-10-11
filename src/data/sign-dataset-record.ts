import { SIGN_DATASET_KEY_PREFIX } from "../constants";
import type { TrafficSign } from "./traffic-sign";

/**
 * One fully fetched Turku sign dataset as persisted in the Client Cache
 * (one object store per partition "Turku", spec §4.3).
 */
export interface SignDatasetRecord {
  /** OGC API response dataset timestamp; the Client Cache key suffix. */
  readonly timeStamp: string;
  /** When this record entered the Client Cache (ms since epoch); drives the TTL. */
  readonly storedAt: number;
  readonly signs: readonly TrafficSign[];
}

/** The dataset schema version carried by the key prefix (`v1`). */
const CURRENT_SCHEMA_VERSION = 1;

/** Client Cache key: `turku-signs/v1/<timeStamp>` — schema version + dataset version. */
export function signDatasetKey(timeStamp: string): string {
  return `${SIGN_DATASET_KEY_PREFIX}${timeStamp}`;
}

/** True when a stored key belongs to the current data-schema version. */
export function isCurrentSchemaDatasetKey(key: string): boolean {
  return key.startsWith(SIGN_DATASET_KEY_PREFIX);
}

/**
 * True when a stored key belongs to an older schema version than this script
 * (`turku-signs/v<n>/` with n below the current version). Keys under newer
 * versions belong to a later script version and are left untouched, as is
 * anything this schema does not claim.
 */
export function isOlderSchemaDatasetKey(key: string): boolean {
  const version = /^turku-signs\/v(\d+)\//.exec(key)?.[1];
  if (version === undefined) return false;
  const parsed = Number(version);
  return Number.isSafeInteger(parsed) && parsed < CURRENT_SCHEMA_VERSION;
}
