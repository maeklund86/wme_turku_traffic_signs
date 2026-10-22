export const SCRIPT_ID = "wme-turku-traffic-signs";
export const SCRIPT_NAME = "WME Turku Traffic Signs";

export const SIGN_PANEL_TAB_LABEL = "Sign Panel";
export const ATTRIBUTION_TEXT = "Traffic sign data © City of Turku, CC BY 4.0";
export const ATTRIBUTION_FOOTER_CLASS = "turku-signs-attribution";

/** Name of the single SDK marker layer the Visual Overlay creates (spec §4.4). */
export const SIGN_LAYER_NAME = "turku_traffic_signs";

/** Label on the Sign Panel's visibility checkbox (spec §4.5). */
export const SIGN_VISIBILITY_LABEL_TEXT = "Show traffic signs";
/** Wrapper for the visibility checkbox and the coverage notice (spec §4.5). */
export const SIGN_VISIBILITY_CLASS = "turku-signs-visibility";
export const SIGN_VISIBILITY_TOGGLE_CLASS = "turku-signs-visibility-toggle";
/** The collapsible Sign Category filter and its chip controls. */
export const SIGN_CATEGORY_FILTER_CLASS = "turku-signs-category-filter";
export const SIGN_CATEGORY_FILTER_ACTIONS_CLASS = "turku-signs-category-filter-actions";
export const SIGN_CATEGORY_FILTER_ACTION_CLASS = "turku-signs-category-filter-action";
export const SIGN_CATEGORY_CHIPS_CLASS = "turku-signs-category-chips";
export const SIGN_CATEGORY_CHIP_CLASS = "turku-signs-category-chip";
/**
 * One-line notice the Sign Panel shows outside the Turku coverage extent,
 * where the toggle is disabled and nothing renders (spec §4.5, AC-17).
 */
export const OUTSIDE_TURKU_COVERAGE_TEXT =
  "Outside Turku coverage — the sign registry only covers the City of Turku.";
export const OUTSIDE_TURKU_COVERAGE_CLASS = "turku-signs-outside-coverage";

/**
 * The viewport-driven sign list (spec §4.5): a count header over one row per
 * sign inside the extent, each row expanding inline to its full notes.
 */
export const SIGN_LIST_CLASS = "turku-signs-list";
export const SIGN_LIST_HEADER_CLASS = "turku-signs-list-header";
/** Wrapper for all Sign Panel content except the permanent attribution footer. */
export const SIGN_PANEL_CONTENT_CLASS = "turku-signs-content";
export const SIGN_ROW_CLASS = "turku-signs-row";
export const SIGN_ROW_ICON_CLASS = "turku-signs-row-icon";
export const SIGN_ROW_CODE_CLASS = "turku-signs-row-code";
/** Column holding the name, the notes preview, or neither. */
export const SIGN_ROW_BODY_CLASS = "turku-signs-row-body";
export const SIGN_ROW_NAME_CLASS = "turku-signs-row-name";
/** The one-line, ellipsised notes preview; absent when the sign has none. */
export const SIGN_ROW_NOTES_CLASS = "turku-signs-row-notes";
/** The full notes a row expands to; absent when the sign has none. */
export const SIGN_ROW_NOTES_FULL_CLASS = "turku-signs-row-notes-full";

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
