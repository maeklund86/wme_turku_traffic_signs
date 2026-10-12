# MVP Specification: WME Turku Traffic Signs

**Status:** Ready for implementation handoff (pending map owner's approval)
**Deliverable:** A personal Tampermonkey userscript for private use that overlays official City of Turku traffic signs inside the Waze Map Editor (WME).
**Sources of record:** [GLOSSARY.md](../../GLOSSARY.md), [ADR 0001](0001-userscript-visual-overlay.md), [ADR 0002](0002-trimble-ogc-api-over-wfs.md), and map [#1](https://github.com/maeklund86/wme_turku_traffic_signs/issues/1) tickets #2–#13 whose resolutions this document synthesizes.

---

## 1. Overview

A client-side Tampermonkey userscript runs in the WME page context. On load it fetches the City of Turku's complete traffic-sign registry (~36,281 features) once through the Trimble OGC API, caches it in IndexedDB, and presents it through two surfaces:

1. **Visual Overlay** — the official sign SVGs rendered bare on thin neutral posts on the WME map, via the WME SDK marker layer. No LayerSwitcher entry.
2. **Sign Panel** — the script's own sidebar tab (`Sidebar.registerScriptTab`), holding the visibility control, the Sign Category filter, the viewport-driven sign list, sign detail, and the attribution footer.

The script is strictly read-only and visual: it never writes to Waze objects and never touches Waze's native editing selection (ADR 0001). Integration is **WME SDK only**; no legacy OpenLayers 2.x path.

## 2. Scope and usage boundary

- **In scope:** private, personal use of the script by its owner inside WME, including local testing in the WME test environment.
- **Out of scope (explicit):**
  - Automated editing or modification of WME segments, turns, or attributes (ADR 0001; Waze community policy).
  - Public distribution (GreasyFork, community sharing) — the City of Turku dataset is **not on Waze's accredited data list**, and Waze's data-integrity policy requires accredited sources for deployed scripts. Public release is a separate future effort ([#10](https://github.com/maeklund86/wme_turku_traffic_signs/issues/10), [#11](https://github.com/maeklund86/wme_turku_traffic_signs/issues/11)).
  - Legacy Tekla WFS / GML / ETRS-GK23 projection handling (superseded by ADR 0002).
  - Any backend server or intermediary proxy; everything runs client-side in the userscript.
  - Sign editing or submission of records back to the City of Turku.
  - Custom query builder / arbitrary attribute filters.
  - Free-text sign-code search in the Sign Panel; scoping the list to the WME selection (deferred, see map [#1](https://github.com/maeklund86/wme_turku_traffic_signs/issues/1) "Not yet specified").
- **Boundary recorded in-product:** the Sign Panel footer carries the data attribution; the script is for private use until Waze accreditation is confirmed.

## 3. Domain model

Terms are defined in [GLOSSARY.md](../../GLOSSARY.md) and used here with exactly those meanings: **Traffic Sign**, **Visual Overlay**, **Sign Panel**, **Sign Category**, **Bounding Box**, **Client Cache**, **Trimble OGC API**, **WME**, **Userscript**.

### Feature model

Trimble properties map 1:1 with no transformation ([#5](https://github.com/maeklund86/wme_turku_traffic_signs/issues/5)):

| Internal field | Source property | Role |
| --- | --- | --- |
| feature key | `Id` | Internal identity only; **never rendered** |
| sign code | `Varustelaji_koodi` (e.g. `C38`) | Displayed; sole filter source; SVG asset key |
| sign name | `Varustelaji` (e.g. `C38 Pysäköinti kielletty`) | Displayed verbatim (Finnish) |
| notes | `Huomautus` (nullable free text) | Displayed; row hidden when null |

No installation-date or direction attribute exists in the API; neither is specced.

## 4. Architecture

### 4.1 Bootstrap

1. Tampermonkey injects the script on `waze.com/editor/*`.
2. Wait for `window.SDK_INITIALIZED`.
3. `getWmeSdk({ scriptId, scriptName })`.
4. On `wme-ready`: register the sidebar tab, create the marker layer, re-apply persisted visibility flag and category filters, then load/render from Client Cache.
5. Layers and flags do **not** survive WME reload/logout — re-apply after every `wme-ready`.

### 4.2 Data ingestion (Trimble OGC API)

Per [#2](https://github.com/maeklund86/wme_turku_traffic_signs/issues/2):

- Endpoint: `https://opaskartta.turku.fi/trimbleogcapi/collections/GIS:Liikennemerkit/items`
- Query: `f=application/geo+json`, `bbox=minLon,minLat,maxLon,maxLat` (WGS84 / CRS84 decimal degrees) covering the **whole City of Turku extent**, `limit=10000` (max), `offset` pagination following `rel="next"` links until exhausted.
- Whole-dataset fetch, not viewport tiling: ~36,281 features ≈ 4 paginated requests ≈ 13.5 MB raw GeoJSON.
- Server-side property filters are ignored — all filtering is client-side.
- **Empty pages:** the endpoint intermittently returns an entirely empty page (`HTTP 200`, `numberReturned: 0`, no `rel="next"` link) under load, and its default page size is 50 when no `limit` is sent. Treat a fully paginated **empty** result as inconclusive — retry — rather than as a complete 0-sign dataset, so a transient empty page cannot be ingested as the whole registry. Always send `limit=10000` explicitly.
- Geometry: GeoJSON Point `[longitude, latitude]`; feeds the SDK directly with **no reprojection** (SDK speaks WGS84).

### 4.3 Client Cache (IndexedDB)

Per [#7](https://github.com/maeklund86/wme_turku_traffic_signs/issues/7):

- **Store:** IndexedDB (localStorage's ~5 MB cap cannot hold the dataset). One object store per partition ("Turku"), keyed `turku-signs/v1/<timeStamp>`, where `<timeStamp>` is the OGC API response dataset timestamp.
- **Schema versioning:** the `v1` prefix is the userscript data-schema version. On store open, entries under older schema versions are stranded and deleted.
- **Freshness:** 7-day TTL with background revalidation. Cached data renders immediately on load; when age > 7 days a background refetch runs and swaps the index in when it resolves. Rendering never blocks on the network.
- **Triggers:** TTL only — no per-session version probe.
- **Failure policy:**
  - Incomplete pagination (any page fails): discard the partial dataset, keep the previous cache live; replacement is atomic — only a fully fetched dataset is written.
  - IndexedDB write failure (quota, private browsing): wipe the dataset store, retry the write once; on second failure degrade to **memory-only for the session** (fetch still works, nothing persists). The overlay must keep functioning for private-mode users.
- **Eviction:** none beyond whole-dataset, version-keyed replacement. There is nothing to LRU.
- **In-memory spatial index** built at load for client-side filtering and rendering.
- **Pan/zoom trigger zero requests** — consequently no fetch debounce on map movement and no per-tile TTL.

### 4.4 Visual Overlay (map markers)

Per [#6](https://github.com/maeklund86/wme_turku_traffic_signs/issues/6) and [#12](https://github.com/maeklund86/wme_turku_traffic_signs/issues/12):

- Layer created once via `sdk.Map.addLayer({ layerName, styleContext, styleRules, zIndexing })`, features added via `sdk.Map.addFeatureToLayer` (one feature per sign, WGS84).
- **Marker:** the official sign SVG rendered **bare** — Finnish signs carry their own shape and colour, so no plate, no background, no category colour. Anchored on a **thin neutral post** (~2 px, grey) with a subtle drop shadow. Fixed ~22 px icon size, tuned for legibility at typical editor zooms. Clickable (`cursor: pointer`).
- **Missing-asset fallback:** when no official SVG resolves for a sign code, render a **bordered fallback plate** on the same post: light fill, dark 1.5 px border, rounded corners, containing the sign code with a tiny "no icon" sublabel. The sign stays locatable and identifiable; the fallback never invents a substitute icon and never hides the sign.
- **Assets** ([#3](https://github.com/maeklund86/wme_turku_traffic_signs/issues/3)): official CC0 (public domain) SVGs published by the Finnish Transport Infrastructure Agency (Väylävirasto), `finnishtransportagency/liikennemerkit` — post-2020 signs in `collections/new_signs/svg`, pre-2020 in `collections/old_signs/svg`. File basenames match `Varustelaji_koodi` directly. Delivered on demand via jsDelivr CDN pinned to commit SHA `35be7a6593e70c8ed5f4e3ef54372d69a3fef558` (immutable, long-term cached, CORS-enabled); an SVG data-URI fallback covers unmatched codes.
- **Style vocabulary:** SDK `FeatureStyle` is the OL2 style vocabulary — `externalGraphic`, `graphicWidth`, `label` etc. still apply.
- **No LayerSwitcher entry:** `sdk.LayerSwitcher.addLayerCheckbox` is never called — the switcher entry is opt-in and absent by default (verified, SDK typings v2.370; [#13](https://github.com/maeklund86/wme_turku_traffic_signs/issues/13)).
- **Visibility:** `sdk.Map.setLayerVisibility({ layerName, visibility })` (v2.247+), getter `sdk.Map.isLayerVisible({ layerName })`. Set explicitly once on layer creation (default-on inside the Turku extent is not documented behaviour). No remove-and-re-add toggling.
- **Clicks:** SDK events only — `sdk.Events.trackLayerEvents` + `wme-layer-feature-clicked` (`{ featureId, layerName }`). No legacy OL2 `SelectFeature`.

### 4.5 Sign Panel (sidebar tab)

Per [#12](https://github.com/maeklund86/wme_turku_traffic_signs/issues/12) and [#13](https://github.com/maeklund86/wme_turku_traffic_signs/issues/13):

- An own sidebar tab via `sdk.Sidebar.registerScriptTab`, **always registered**.
- **Visibility control:** checkbox driving `setLayerVisibility`, default on inside the Turku extent, flag persisted in userscript storage and re-applied after every `wme-ready`. Display-only: toggling never touches the network (fetch/cache independence, §4.3). Outside the Turku coverage extent the tab shows a one-line "outside Turku coverage" notice and the toggle is disabled; no signs render.
- **Sign Category filter block:** collapsible, at the top of the tab; chips per category with select-all/none; state survives viewport moves. Filtering is on `Varustelaji_koodi` **prefix** grouped into Sign Categories — never the localized name.
- **Viewport-driven sign list:** extent from `sdk.Map.getMapExtent()` (GeoJSON BBox `[left, bottom, right, top]`, WGS84), re-filtered client-side on `wme-map-move-end` against the in-memory spatial index — zero requests, no debounce. Header shows a count ("N signs in view"). Rows are self-contained: icon (CC0 SVG, or code plate where unmatched) + sign code + official name + truncated notes; a row **expands inline** for full notes — no popup, no list replacement.
- **Marker → panel resolution:** clicking a marker highlights and expands the matching list row, one selection at a time, and switches the sidebar to the script tab. Clicking the map with no sign clears the panel to its empty state. Details are never pushed to `Editing.setSelection`.
- **Attribution footer:** permanent, non-dismissible — "Traffic sign data © City of Turku, CC BY 4.0" — visible in every mode including private testing.
- **Language:** UI labels in English; all sign data rendered verbatim in Finnish (official registry values, never translated).

## 5. UX surface map

| Surface | Behaviour |
| --- | --- |
| Map | Bare official SVG markers on thin neutral posts; code-plate fallback for missing assets; no LayerSwitcher entry |
| Sign Panel — header | Attribution footer (always visible); visibility checkbox |
| Sign Panel — filter block | Sign Category chips, select-all/none, persisted |
| Sign Panel — list | "N signs in view" count; self-contained inline-expanding rows |
| Sign Panel — detail | Inline row expansion: sign code, sign name, notes (row hidden when null) |

## 6. Acceptance criteria

Testable; verify in a WME test environment with the script installed via Tampermonkey. (The manual end-to-end verification checklist is deliberately not specced yet — see map [#1](https://github.com/maeklund86/wme_turku_traffic_signs/issues/1) "Not yet specified".)

### Data ingestion and cache

1. **AC-1** — First load on an empty cache issues paginated requests (`limit=10000`, ascending `offset`) until the full ~36,281-feature dataset is retrieved, then stops.
2. **AC-2** — After initial load, panning and zooming the map issue **zero** HTTP requests.
3. **AC-3** — If any page fails mid-pagination, the partial dataset is discarded, the previous cache remains active, and no partial write replaces it.
4. **AC-4** — The dataset persists in IndexedDB under key `turku-signs/v1/<timeStamp>`; opening the store deletes entries whose schema-version prefix is older than `v1`.
5. **AC-5** — With fresh cache (age ≤ 7 days), markers and list render immediately with no network request on load.
6. **AC-6** — With stale cache (age > 7 days), rendering is immediate and a background refetch swaps the index in; the UI never blocks waiting for it.
7. **AC-7** — Simulated IndexedDB write failure: the store is wiped and the write retried once; on a second failure the script continues memory-only for the session with full functionality.
8. **AC-8** — No fetch debounce logic exists for map movement (consequence of AC-2), and no LRU/per-tile eviction runs.

### Visual Overlay

9. **AC-9** — One SDK marker layer is created; each sign appears as one feature at its WGS84 point; coordinates are consumed without reprojection.
10. **AC-10** — Markers render the official sign SVG bare (no plate, background, or category colour), ~22 px, on a thin neutral post, with pointer cursor.
11. **AC-11** — A sign whose code has no matching SVG renders a bordered code plate on the same post, showing the code and a "no icon" sublabel; the sign remains locatable; no substitute icon is invented and no sign is hidden.
12. **AC-12** — No entry for the script's layer appears in WME's LayerSwitcher at any time.
13. **AC-13** — Marker clicks are handled exclusively via `sdk.Events.trackLayerEvents` / `wme-layer-feature-clicked`; no OL2 `SelectFeature` path exists in the codebase.
14. **AC-14** — Sign icons load from the pinned jsDelivr commit SHA `35be7a6593e70c8ed5f4e3ef54372d69a3fef558`; changing the upstream repo's `main` does not change the rendered icons.

### Sign Panel

15. **AC-15** — The script's sidebar tab is always registered after `wme-ready`, in every WME area including outside Turku coverage.
16. **AC-16** — The visibility checkbox defaults on inside the Turku extent, drives `setLayerVisibility`, and after a WME reload/re-login the persisted flag is re-applied automatically.
17. **AC-17** — Outside the Turku extent the panel shows the "outside Turku coverage" notice, the toggle is disabled, and no markers render.
18. **AC-18** — Toggling visibility issues no network requests and does not re-fetch or re-cache data.
19. **AC-19** — Selecting/deselecting Sign Category chips filters list and markers on `Varustelaji_koodi` prefix grouping only; state persists across viewport moves and reloads.
20. **AC-20** — The list header shows "N signs in view" re-filtered on `wme-map-move-end` via `getMapExtent()`; N matches the markers visible in the extent.
21. **AC-21** — Rows show icon (or code plate) + code + name + truncated notes and expand inline to full notes; the notes row is hidden entirely when `Huomautus` is null.
22. **AC-22** — Clicking a marker switches the sidebar to the script tab, highlights and expands exactly the matching row, and replaces any previous selection; clicking empty map clears the panel to its empty state.
23. **AC-23** — The footer "Traffic sign data © City of Turku, CC BY 4.0" is permanently visible in every mode, including private testing, and cannot be dismissed.
24. **AC-24** — All UI labels are English; all sign data (codes, names, notes) is verbatim Finnish registry values.
25. **AC-25** — No code path calls `Editing.setSelection` or writes to any Waze object; nothing in the script mutates map data.

## 7. Implementation handoff notes

- **Runtime:** Tampermonkey/Violentmonkey userscript, WME page context, no bundler mandated — bundle the data-schema/timestamp handling and SDK glue as plain ES modules if the toolchain stays simple.
- **SDK surface used:** `SDK_INITIALIZED` / `getWmeSdk`, `Map.addLayer`, `Map.addFeatureToLayer`, `Map.setLayerVisibility`, `Map.isLayerVisible`, `Map.getMapExtent`, `Events.trackLayerEvents` (`wme-layer-feature-clicked`), `Sidebar.registerScriptTab`, `wme-ready`, `wme-map-move-end`. Verified against published `wme-sdk-typings` (v2.370-3) — pin the SDK version in the script's expectations.
- **Do not carry forward:** `LayerSwitcher.addLayerCheckbox` as the visibility mechanism (superseded — see #12/#13).
- **Prototype reference (throwaway, never merged):** branch `prototype/wme-overlay-rendering`, `prototypes/wme-overlay-rendering/index.html` — validated marker presentation and fallback only; reimplement properly against this spec.
- **Research archives (never merged):** `research/trimble-ogc-api-schema`, `research/finnish-traffic-sign-svgs`, `research/wme-openlayers-vector-integration`, `research/waze-source-accreditation`, `research/wme-sdk-layer-visibility`.
- **Rendering reference:** [`docs/reference/wme-overlay-rendering.md`](wme-overlay-rendering.md) — the OL2/SDK rendering facts `FeatureStyle` leans on (graphic anchoring, offset direction, the opacity fallback, cursor) plus the typings traps. None of it is in this spec or in the vendored typings, and marker work keeps re-deriving it.
- **Attribution obligations:** icons CC0 (Väylävirasto, attribution optional but recorded); dataset CC BY 4.0 (City of Turku — the footer is the attribution mechanism).
- **Acceptance:** criteria in §6 are the handoff checklist; owner's sign-off on this document releases implementation.
