export const SCRIPT_ID = "wme-turku-traffic-signs";
export const SCRIPT_NAME = "WME Turku Traffic Signs";

export const SIGN_PANEL_TAB_LABEL = "Sign Panel";
export const ATTRIBUTION_TEXT = "Traffic sign data © City of Turku, CC BY 4.0";
export const ATTRIBUTION_FOOTER_CLASS = "turku-signs-attribution";

/** Trimble OGC API items endpoint for the municipal sign registry (spec §4.2). */
export const TRIMBLE_ITEMS_ENDPOINT =
  "https://opaskartta.turku.fi/trimbleogcapi/collections/GIS:Liikennemerkit/items";

/** Whole City of Turku extent, WGS84 `[minLon, minLat, maxLon, maxLat]` — the collection's declared spatial extent, padded. */
export const TURKU_EXTENT = [22.09, 60.35, 22.39, 60.61] as const;

/** The API's maximum page size (verified against the service). */
export const PAGE_SIZE_LIMIT = 10000;

/**
 * Schema-versioned key for Sign Panel state in userscript storage.
 * The `v1` prefix is the userscript data-schema version; entries under
 * older versions are ignored.
 */
export const SIGN_PANEL_SETTINGS_KEY = "turku-signs/settings/v1";

/** Client Cache IndexedDB database name. */
export const SIGN_DATABASE_NAME = "turku-signs";
/** One object store per partition; today the single "Turku" partition (spec §4.3). */
export const TURKU_PARTITION_STORE_NAME = "turku-signs--Turku";
/**
 * Schema-versioned Client Cache key prefix. Dataset keys are
 * `turku-signs/v1/<timeStamp>`; entries under older prefixes are stranded
 * and deleted on store open.
 */
export const SIGN_DATASET_KEY_PREFIX = "turku-signs/v1/";
/** 7-day freshness TTL for cached datasets (spec §4.3). */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
