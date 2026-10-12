export const SCRIPT_ID = "wme-turku-traffic-signs";
export const SCRIPT_NAME = "WME Turku Traffic Signs";

export const SIGN_PANEL_TAB_LABEL = "Sign Panel";
export const ATTRIBUTION_TEXT = "Traffic sign data © City of Turku, CC BY 4.0";
export const ATTRIBUTION_FOOTER_CLASS = "turku-signs-attribution";

/** Name of the single SDK marker layer the Visual Overlay creates (spec §4.4). */
export const SIGN_LAYER_NAME = "turku_traffic_signs";

/**
 * Commit SHA the official sign SVGs are pinned to inside the asset URL
 * (AC-14). jsDelivr resolves the SHA, so the rendered icons never change when
 * the upstream repository's `main` moves.
 */
export const SIGN_ICON_ASSET_COMMIT = "35be7a6593e70c8ed5f4e3ef54372d69a3fef558";
/** Base URL of the pinned Väylävirasto CC0 sign-SVG collection on jsDelivr. */
export const SIGN_ICON_ASSET_BASE_URL =
  "https://cdn.jsdelivr.net/gh/finnishtransportagency/liikennemerkit" +
  `@${SIGN_ICON_ASSET_COMMIT}/collections`;
/** Post-2020 signs carry letter-prefixed codes (spec §4.4). */
export const NEW_SIGN_SVG_PATH = "new_signs/svg";
/** Pre-2020 signs carry numeric codes (spec §4.4). */
export const OLD_SIGN_SVG_PATH = "old_signs/svg";

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
