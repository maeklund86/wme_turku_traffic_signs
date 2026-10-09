# Research: WME OpenLayers Vector Integration Patterns

**Related Ticket**: [#4 (Inspect WME OpenLayers vector layer integration patterns)](https://github.com/maeklund86/wme_turku_traffic_signs/issues/4)  
**Date**: 2026-10-09  
**Author**: Wayfinder Agent  
**Scope**: How a WME userscript adds a custom vector layer + geometry + styling + feature click handler to the WME map canvas (`W.map`) in modern WME, and how to do it without hijacking the editor.

---

## 1. Executive Summary

- **Canonical modern path — use the official WME JavaScript SDK.** Waze ships a supported SDK exposed as `window.getWmeSdk({ scriptId, scriptName })`, initialized via `window.SDK_INITIALIZED.then(...)`. The `sdk.Map` module adds feature layers and GeoJSON features, and the SDK works **entirely in WGS84** (`{ lon, lat }`), so no manual OpenLayers reprojection is needed for our `EPSG:4326` sign data.
- **`W.map` today is still OpenLayers 2.x** — a trimmed ("light") build of OL 2.12, with the global `OpenLayers` object still exposed. The legacy direct path (`new OpenLayers.Layer.Vector(...)` → `W.map.addLayer(...)`) still works, but Waze has stated that **legacy scripts which bypass the managed SDK "will eventually cease to function"** (official announcement, April 2026).
- **The SDK does not replace OpenLayers internally** — its `FeatureStyle` interface is literally the OpenLayers 2 style property list ("List of OpenLayers supported styles taken from OL 2 docs"). This means the OL2 styling vocabulary (`externalGraphic`, `graphicWidth`, `strokeColor`, `label`, …) is stable across both paths.
- **Feature click handling** is first-class in the SDK: `sdk.Events.trackLayerEvents({ layerName })`, then listen for `"wme-layer-feature-clicked"` with payload `{ featureId, layerName }`. This is far safer than adding a legacy `OpenLayers.Control.SelectFeature` (which competes with WME's own editing controls).
- **Recommended for this project**: an SDK-based read-only marker layer (one feature per sign, `externalGraphic` = sign SVG), styled via `styleRules`, toggled via `LayerSwitcher.addLayerCheckbox`, with clicks surfaced through `wme-layer-feature-clicked` and rendered in a `Sidebar.registerScriptTab` panel. This keeps all data read-only and avoids touching the Waze editing model.
- **Compliance caveat (important)**: the April 2026 Waze policy requires scripts/overlays to source data only from **accredited sources** (see [Waze Map Data Attribution](https://support.google.com/waze/answer/12075833)) and encourages migration to the managed SDK. The Turku municipal sign dataset's accreditation should be confirmed before public deployment (see §7.4).

---

## 2. What `W.map` Is Today

| Aspect | Finding | Source |
| :--- | :--- | :--- |
| Renderer / library | OpenLayers **2.x** (a reduced "light" build of OpenLayers 2.12), not OL3+ and not a WebGL rewrite. | Glodenox, *WME OpenLayers Library Upgrade* ([greasyfork.org/scripts/21007](https://greasyfork.org/en/scripts/21007-wme-openlayers-library-upgrade)) |
| Style vocabulary | SDK `FeatureStyle` is documented as the OL2 style property list. | SDK [`FeatureStyle`](https://www.waze.com/editor/sdk/interfaces/index.SDK.FeatureStyle.html) |
| Global `OpenLayers` | Still exposed; current WME-GIS-Layers patches `OpenLayers.Renderer.SVG` (2026). | `WazeDev/WME-GIS-Layers` @ `d5d0387` |
| `W.map` API surface | Wrapper around the OL map. Since **Nov 2019** many OL methods were removed from `W.map`; the originals remain accessible via `W.map.getOLMap()`. | Glodenox, *Script authors: W.map API changed* ([discuss/169227](https://www.waze.com/discuss/t/script-authors-w-map-api-changed/169227)) |
| `W.map.olMap` | No longer a public property; use `W.map.getOLMap()`. | same |
| Common `W.map` methods that still exist | `addLayer`, `getLayersByName`, `getLayerByUniqueName`, `getLayerIndex`, `getCenter`, `getZoom`, `getProjectionObject`, `getExtent`, `getOLMap`, `addPopup`, etc. | Glodenox post; legacy scripts (WME Hectometering, WME Client Tile Borders) |

**Version differences / evolution (verified timeline):**
- **2016–2019**: scripts freely used `W.map.olMap` and the full OL2 API.
- **Nov 2019**: WME removed/hid a large subset of `W.map`; `W.map.getOLMap()` became the escape hatch ([discuss/169227](https://www.waze.com/discuss/t/script-authors-w-map-api-changed/169227)).
- **2024–2026**: the supported surface moved to the **managed SDK**; the SDK migration guide explicitly maps `OpenLayers.Layer.Vector` / `OpenLayers.Feature.Vector` → `Map.addLayer` + `Map.addFeatureToLayer`, and `OpenLayers.Style` / `StyleMap` / `Rule` → `Map.addLayer` with a style object ([SDK index — Migration Guide](https://www.waze.com/editor/sdk/index.html)).
- **April 2026**: Waze announced the transition to the managed SDK; "legacy scripts that bypass this interface will eventually cease to function" ([official announcement](https://www.waze.com/discuss/t/important-reminder-ensuring-map-data-integrity-and-compliance-in-wme-scripting/402288)).

> **Verified vs inference.** The renderer/library identity (OL2 light build), the 2019 API change, and the SDK style vocabulary are **verified** from the sources above. Any claim that the renderer is being replaced by a non-OpenLayers engine is **not supported** by current primary sources and is treated as **inference/rumour** here.

---

## 3. The Official WME SDK

**Yes — an official WME JavaScript SDK exists and is the canonical modern integration path.** It is documented at:

- Primary docs: <https://www.waze.com/editor/sdk/index.html>
- Mirror: <https://web-assets.waze.com/wme_sdk_docs/production/latest/index.html>
- Version banner at time of writing: **WME version v2.370-3-gaa6183241e**
- TypeScript typings: `https://web-assets.waze.com/wme_sdk_docs/production/latest/wme-sdk-typings.tgz` (`npm install --save-dev <url>`)

### 3.1 Initialization

```javascript
// @grant none  // SDK requires same window; with any @grant use unsafeWindow instead
// @run-at document-idle

window.SDK_INITIALIZED.then(initScript);

function initScript() {
  const sdk = getWmeSdk({
    scriptId: "wme-turku-traffic-signs",
    scriptName: "Turku Traffic Signs",
  });
  // ... use sdk
}
```

Bootstrap caveats (from the SDK troubleshooting section):
- If your `@run-at` runs before `DOMContentLoaded`, wrap in `document.addEventListener("DOMContentLoaded", () => window.SDK_INITIALIZED.then(initScript))`.
- With any `@grant` other than `none`, the script gets an isolated `window`; add `// @grant unsafeWindow` and use `unsafeWindow.SDK_INITIALIZED`.
- `getWmeSdk` is exposed both as a bare global (`getWmeSdk(...)`) and as `window.getWmeSdk(...)`.

Wait for full readiness with `sdk.Events.once({ eventName: "wme-ready" })` (fires once, after `wme-initialized` + `wme-logged-in` + `wme-map-initial-data-loaded`).

### 3.2 `sdk.Map` — relevant surface (verified)

Layer / feature lifecycle:

| Method | Purpose |
| :--- | :--- |
| `addLayer({ layerName, styleContext?, styleRules?, zIndexing? })` | Create a feature layer (throws if name exists). |
| `addFeatureToLayer({ feature, layerName })` | Add one OGC-SFA/GeoJSON feature. |
| `addFeaturesToLayer({ features, layerName })` | Bulk add GeoJSON features. |
| `removeFeatureFromLayer` / `removeFeaturesFromLayer` / `removeAllFeaturesFromLayer` | Remove features. |
| `removeLayer({ layerName })` | Remove a layer. |
| `setLayerVisibility({ layerName, visibility })` | Show/hide (SDK-created layer). |
| `setLayerOpacity({ layerName, opacity })` | Opacity 0.0–1.0. |
| `getLayerZIndex` / `setLayerZIndex({ layerName, zIndex })` | z-order control. |
| `redrawLayer({ layerName })` | Force visual refresh. |
| `addStyleRuleToLayer({ layerName: WME_LAYER_NAMES.*, styleRules })` | Style a **native** WME layer via a predicate. |
| `addTileLayer({ layerName, layerOptions })` | Raster tile overlay. |
| `drawPoint` / `drawLine` / `drawPolygon` | Interactive drawing (returns geometry, not persisted). |
| `getMapCenter` / `setMapCenter` | WGS84 `{ lon, lat }`. |
| `getMapExtent` | WGS84 bbox `[left, bottom, right, top]`. |
| `getZoomLevel` / `setZoomLevel` / `MIN_ZOOM_LEVEL` / `MAX_ZOOM_LEVEL` | Zoom. |
| `getMapViewportElement` | DOM node of the map viewport. |
| `centerMapOnGeometry` / `zoomToExtent({ bbox })` | Viewport navigation. |
| `getLonLatFromPixel` / `getPixelFromLonLat` / `getLonLatFromMapPixel` / `getMapPixelFromLonLat` | Pixel ↔ WGS84 conversions. |

Source: [`index.SDK.Map`](https://www.waze.com/editor/sdk/classes/index.SDK.Map.html).

**Important:** `addLayer`/`addFeatureToLayer` throw `InvalidStateError` if a layer doesn't exist or wasn't created through the SDK, and `addLayer` throws if the name already exists. Wrap re-init in `try { sdk.Map.removeLayer(...) } catch (e) { if (!(e instanceof sdk.Errors.InvalidStateError)) throw e; }` — this is exactly the idempotent pattern used by `WME-GIS-Layers` (`/tmp/opencode/gis.js` ≈ line 6600).

---

## 4. Canonical Code: Add a Vector Layer + Feature + Style

### 4.1 Modern SDK path (recommended)

Sign data from the Trimble OGC API is GeoJSON in WGS84 (`EPSG:4326`); the SDK consumes GeoJSON directly, so **no projection transform is required**.

```javascript
const sdk = getWmeSdk({ scriptId: "wme-turku-traffic-signs", scriptName: "Turku Traffic Signs" });

const LAYER = "turku_traffic_signs";

// 1) Create the layer with styling rules.
//    Predicate receives (featureProperties, zoomLevel); later rules win.
sdk.Map.addLayer({
  layerName: LAYER,
  styleContext: {
    // dynamic values referenced from style as "${fn}"
    getIcon: ({ feature }) => feature?.properties?.svgUrl,
    getLabel: ({ feature }) => feature?.properties?.code,
  },
  styleRules: [
    {
      // default: sign icon, clickable
      style: {
        externalGraphic: "${getIcon}",     // URL or data: URI (SVG/PNG)
        graphicWidth: 28,
        graphicHeight: 28,
        graphicXOffset: -14,
        graphicYOffset: -14,
        label: "${getLabel}",
        fontSize: "10px",
        fontColor: "#111",
        labelOutlineColor: "#fff",
        labelOutlineWidth: 3,
        labelYOffset: 18,
        cursor: "pointer",
      },
    },
    {
      // highlight selected/hovered by a property flag (optional)
      predicate: (props) => props.selected === true,
      style: { strokeColor: "#ff0", strokeWidth: 3 },
    },
  ],
  zIndexing: true,
});

// 2) Add sign features (already WGS84 GeoJSON: coordinates = [lon, lat]).
sdk.Map.addFeaturesToLayer({
  layerName: LAYER,
  features: signs.map((sign) => ({
    type: "Feature",
    id: String(sign.Id),
    geometry: { type: "Point", coordinates: [sign.lon, sign.lat] },
    properties: {
      code: sign.Varustelaji_koodi,
      name: sign.Varustelaji,
      note: sign.Huomautus,
      svgUrl: signSvgUrl(sign.Varustelaji_koodi),
    },
  })),
});

// 3) Show in the layer switcher.
sdk.LayerSwitcher.addLayerCheckbox({ name: "Turku traffic signs", isChecked: false });
```

`externalGraphic` accepts **base64 data URIs and URL-encoded images** (SDK `addLayer` example, §"Layer with external graphic"). For sign SVGs this means either an inline data URI or the jsDelivr CDN URL identified in [#3](https://github.com/maeklund86/wme_turku_traffic_signs/issues/3).

**Style API vocabulary** (`FeatureStyle`, verified): `externalGraphic`, `backgroundGraphic`, `graphicWidth/Height/XOffset/YOffset/Opacity/ZIndex`, `graphicName` (`circle|square|star|x|cross|triangle`), `pointRadius`, `strokeColor/Width/Opacity/Dashstyle/Linecap`, `fillColor/Opacity`, `label`, `labelAlign/XOffset/YOffset/Outline*`, `fontColor/Family/Size/Style/Weight/Opacity`, `cursor`, `title`, `rotation`, `display`, `pointerEvents` ([`FeatureStyle`](https://www.waze.com/editor/sdk/interfaces/index.SDK.FeatureStyle.html)).

**Static vs dynamic styling.** `styleRules[].style` values may be literals, or strings like `"${myFn}"` resolved against `styleContext` functions. Predicates can depend on `featureProperties` **and `zoomLevel`** (zoom-aware labeling; documented as available "as of v2.306" per WME-GIS-Layers comment).

### 4.2 Legacy OpenLayers 2 path (works today, deprecated future)

```javascript
/* global W, OpenLayers */

const layer = new OpenLayers.Layer.Vector("turku_traffic_signs", {
  styleMap: new OpenLayers.StyleMap({
    default: new OpenLayers.Style({
      externalGraphic: "${icon}",
      graphicWidth: 28,
      graphicHeight: 28,
      graphicXOffset: -14,
      graphicYOffset: -14,
      cursor: "pointer",
    }),
    select: new OpenLayers.Style({ strokeColor: "#ff0", strokeWidth: 3 }),
  }),
});
W.map.addLayer(layer);
W.map.setLayerIndex(layer, W.map.getLayerIndex(W.map.getLayersByName("Roads")[0]) + 1); // ordering

// From WGS84 (EPSG:4326) to the map projection:
const mapProj = W.map.getProjectionObject();
const geom = new OpenLayers.Geometry.Point(sign.lon, sign.lat)
  .transform(new OpenLayers.Projection("EPSG:4326"), mapProj);

layer.addFeatures([new OpenLayers.Feature.Vector(geom, {
  icon: signSvgUrl(sign.Varustelaji_koodi),
  code: sign.Varustelaji_koodi,
})]);
```

GeoJSON import alternative:

```javascript
const format = new OpenLayers.Format.GeoJSON({
  internalProjection: W.map.getProjectionObject(),
  externalProjection: new OpenLayers.Projection("EPSG:4326"),
});
layer.addFeatures(format.read(signsGeoJson).features);
```

---

## 5. Feature Click / Selection Handlers, Popup & Attribute Panel

### 5.1 SDK layer events (recommended, isolated)

Layer events must be **tracked** before they fire:

```javascript
sdk.Events.trackLayerEvents({ layerName: LAYER });

sdk.Events.on({
  eventName: "wme-layer-feature-clicked",
  eventHandler: ({ featureId, layerName }) => {
    const sign = signById.get(String(featureId));
    showSignPanel(sign); // your own sidebar tab / popup
  },
});

sdk.Events.on({ eventName: "wme-layer-feature-mouse-enter",
                eventHandler: ({ featureId }) => setMarkerProperty(featureId, "selected", true) });
sdk.Events.on({ eventName: "wme-layer-feature-mouse-leave",
                eventHandler: ({ featureId }) => setMarkerProperty(featureId, "selected", false) });

// Toggle visibility via the checkbox event
sdk.Events.on({
  eventName: "wme-layer-checkbox-toggled",
  eventHandler: ({ name, checked }) => {
    if (name === "Turku traffic signs")
      sdk.Map.setLayerVisibility({ layerName: LAYER, visibility: checked });
  },
});
```

Payload types are defined by [`SdkEvents`](https://www.waze.com/editor/sdk/interfaces/index.SDK.SdkEvents.html): `wme-layer-feature-clicked` → `{ featureId: string | number; layerName: string }`; `mouse-enter`/`mouse-leave` → `{ featureId, layerName }`; `wme-layer-checkbox-toggled` → `{ checked: boolean; name: string }`; `wme-layer-visibility-changed` → `{ layerName }`. Deactivate with `sdk.Events.stopLayerEventsTracking({ layerName: LAYER })`.

Other useful global events: `wme-ready`, `wme-map-move-end`, `wme-map-data-loaded`, `wme-selection-changed`, `wme-map-zoom-changed`, `wme-after-edit`.

**No native popup API in the SDK.** For the attribute panel, use:
- `sdk.Sidebar.registerScriptTab()` → `Promise<{ tabLabel, tabPane }>`; append your own DOM/HTML. ([Sidebar](https://www.waze.com/editor/sdk/classes/index.SDK.Sidebar.html))
- `sdk.Map.getFeatureDomElement({ featureId, layerName })` to get the feature's rendered `HTMLElement`/`SVGElement` and position a custom HTML popover relative to it.
- Or `sdk.Editing.setSelection({ selection: { type, ids: [id] } })` to push the clicked sign into Waze's own selection — **but this mutates Waze's selection model**, so it conflicts with editor selection (see below). Prefer the isolated sidebar panel for a read-only overlay.

### 5.2 Legacy selection integration

Plain `OpenLayers.Control.SelectFeature`:

```javascript
const select = new OpenLayers.Control.SelectFeature(layer, {
  hover: false,
  onSelect: (f) => showPopup(f),
  onUnselect: () => hidePopup(),
});
W.map.addControl(select);
select.activate();
```

To make features participate in Waze's **own** selection/highlight cycle (the technique used by Glodenox's showcase), hook the selection mediator's root container:

```javascript
const root = W.selectionManager.selectionMediator._rootContainerLayer;
root.layers.push(layer);
root.collectRoots();

W.selectionManager.selectionMediator.on({
  "map:selection:featureIn":  (e) => e.layer === layer && highlight(e),
  "map:selection:featureOut": (e) => e.layer === layer && unhighlight(e),
});
W.selectionManager.events.on({
  selectionchanged: (e) => {
    const hit = e.selected.find((f) => f.layer === layer);
    hit ? onSelect(hit) : onUnselect();
  },
});
// Feature attributes must include a `repositoryObject` implementing
// isDeleted / setSelected / isNew / getType / getID for Waze's logic.
```

Source: Glodenox, *Showcase: selectable features in WME map* ([greasyfork.org/scripts/467559](https://greasyfork.org/en/scripts/467559-showcase-selectable-features-in-wme-map/code)). Legacy popups use `new OpenLayers.Popup.FramedCloud(...)` / `new OpenLayers.Popup(...)` + `W.map.addPopup(popup)`.

### 5.3 Conflicts with WME editing handlers (verified rationale + inference)

- The legacy map is a **single OpenLayers control stack**. A `SelectFeature` control intercepts mouse events and can **prevent WME from selecting/editing segments/nodes/venues** underneath your markers — that is precisely why the SDK's `wme-layer-feature-clicked` event exists (it does not add a control that steals clicks).
- Injecting features into Waze's selection model (`selectionMediator`, `Editing.setSelection`) means a click on your sign can **clear/override** the editor's current selection; acceptable for a reference tool, but it changes editor state. **Inference:** for a strictly read-only overlay, prefer SDK layer events + a script sidebar tab, and avoid registering the overlay in Waze's selection mediator.
- `externalGraphic` markers capture pointer events by default; set `cursor: "pointer"` for affordance and consider `pointerEvents` if you need clicks to pass through.

---

## 6. Projection (Signs Are WGS84 `EPSG:4326`)

| Path | Map internal projection | Transform needed for `EPSG:4326` input |
| :--- | :--- | :--- |
| **SDK** | Abstracted; SDK APIs speak **WGS84** only | **No.** Feed GeoJSON `[lon, lat]`; use `{ lon, lat }` for center/extent. `getMapExtent()` returns `[left, bottom, right, top]` in WGS84. |
| **Legacy OL2** | Web Mercator (`EPSG:900913`; spherical Mercator, equivalent to `EPSG:3857`) | **Yes.** `new OpenLayers.Projection("EPSG:4326") → W.map.getProjectionObject()` |

Canonical legacy transform:

```javascript
new OpenLayers.Geometry.Point(lon, lat)
  .transform(new OpenLayers.Projection("EPSG:4326"), W.map.getProjectionObject());
```

`getMapCenter()` / `getMapExtent()` behavior in the SDK (WGS84) is verified from [`index.SDK.Map`](https://www.waze.com/editor/sdk/classes/index.SDK.Map.html). The legacy map projection identity is **inference from OpenLayers 2 / WME norms** (OL2 default `EPSG:900913`); always resolve it at runtime via `W.map.getProjectionObject()` rather than hard-coding.

---

## 7. Practical Gotchas

### 7.1 Bootstrap timing
- **SDK**: `window.SDK_INITIALIZED.then(initScript)`; optionally gate on `sdk.Events.once({ eventName: "wme-ready" })`. `wme-initialized` fires before map data is fetched; `wme-map-initial-data-loaded` once data is ready. Handle pre-`DOMContentLoaded` `@run-at` and `@grant` isolation as in §3.1.
- **Legacy**: `W.userscripts?.state?.isReady` + `document.addEventListener("wme-ready", ...)`; many older scripts poll with `setTimeout` because `W` appears asynchronously.
- Register listeners **before/at** ready; re-registering without teardown causes duplicate handlers.

### 7.2 z-index / layer order
- SDK: pass `zIndexing: true` to `addLayer` (required for z-index support), then `setLayerZIndex`/`getLayerZIndex`. `WME-GIS-Layers` uses `zIndexing: true` for its marker layer.
- Legacy: `W.map.setLayerIndex(layer, idx)` or `W.map.getOLMap().setLayerIndex(...)`; insert above the Roads layer (see §4.2).
- **Inference**: keep overlays above base tiles but below Waze's editor handles so edit affordances remain visible; test zoom ranges.

### 7.3 Cleanup / toggling / re-init
- Idempotent create: `removeLayer` first, catching `sdk.Errors.InvalidStateError` (SDK throws otherwise).
- Toggle: `setLayerVisibility` + `LayerSwitcher.setLayerCheckboxChecked`; stop event tracking with `stopLayerEventsTracking`; remove checkbox with `LayerSwitcher.removeLayerCheckbox`.
- On `wme-logged-out`/reloads, layers are gone — rebuild on `wme-ready`.

### 7.4 Licensing / community policy (read before shipping)
- **Official Waze announcement (2026-04-06)**: scripts/overlays "must rely exclusively on accredited data sources"; use [Waze Map Data Attribution](https://support.google.com/waze/answer/12075833) as the definitive list; adding open-source data requires submitting [this form](https://forms.gle/K8GxrHtqpe8MRTxB9). Waze is "continuing our transition to the managed SDK"; legacy scripts "will eventually cease to function." ([announcement](https://www.waze.com/discuss/t/important-reminder-ensuring-map-data-integrity-and-compliance-in-wme-scripting/402288))
- Waze Community Terms reference the SDK and disclaim any guarantee of script functionality ([support.google.com/waze/answer/14013702](https://support.google.com/waze/answer/14013702)).
- Bulk-edit guidance (`discuss/407412`) is **not** triggered here — this project is strictly **read-only visual**. But the sign dataset's provenance/accreditation still needs confirming against the attribution list before public deployment. See related research [#2](https://github.com/maeklund86/wme_turku_traffic_signs/issues/2)/[#3](https://github.com/maeklund86/wme_turku_traffic_signs/issues/3).

### 7.5 Example open-source userscripts (with pinned HEAD commits)

| Repo / script | Pattern demonstrated | HEAD |
| :--- | :--- | :--- |
| [WazeDev/WME-GIS-Layers](https://github.com/WazeDev/WME-GIS-Layers) | SDK `addLayer` + `styleRules` + `styleContext` + `zIndexing`; `LayerSwitcher.addLayerCheckbox`; `Sidebar.registerScriptTab`; patches OL2 SVG renderer | `d5d0387df39d09829c82db2a6e0aa7f7b8d55941` |
| [WazeDev/WazeWrap](https://github.com/WazeDev/WazeWrap) | Legacy helper `WazeWrap.Interface.AddLayerCheckbox` | `723b0e8fcdd0ee15bbb60cd62f91ec32b0edbd92` |
| [Waze-Dev-CH/WME-CH-Street-Name-Checker](https://github.com/Waze-Dev-CH/WME-CH-Street-Name-Checker) | Clean TypeScript SDK map-layer example (`src/map-layer.ts`) | `91ac74c59ef0bd3c49addaf878bee601c5a88176` |
| [MrTimbones/WME-Color-Highlights](https://github.com/MrTimbones/WME-Color-Highlights) | Segment styling/highlighting | `e892bdb2bf70ec5c27c526bfd955ffcc7f77aeea` |
| [WazeDev/WME-Place-Interface-Enhancements](https://github.com/WazeDev/WME-Place-Interface-Enhancements) | Contains an "SKD Migration Record" | `84286faa766e7947b1a6f707573744391451b127` |
| [Glodenox — selectable features showcase](https://greasyfork.org/en/scripts/467559-showcase-selectable-features-in-wme-map/code) | Legacy vector layer + Waze selection-mediator integration | v0.3 |
| [WME Geometries (Timbones)](https://greasyfork.org/en/scripts/8129-wme-geometries) | File-geometry overlay, now SDK-based | — |
| WME Canada Webcams | SDK marker layer + `wme-layer-feature-clicked` | — |
| WME Quick HN Importer | SDK click handler + `Editing.setSelection` | — |
| WME Hectometering / WME Client Tile Borders | Legacy OL2 `SelectFeature`/`Popup`; `W.map.addLayer` | — |

---

## 8. Verification Checklist

- [x] Confirmed official SDK exists, its init contract (`window.SDK_INITIALIZED` / `getWmeSdk`) and current version banner (v2.370-3-gaa6183241e).
- [x] Enumerated SDK `Map` layer/feature/style/z-index/extent methods from primary docs.
- [x] Captured SDK `FeatureStyle` (OL2 vocabulary) and `SdkFeature`/`SdkFeatureStyleRule` shapes.
- [x] Captured layer-event payloads from `SdkEvents` and layer-switcher/sidebar APIs.
- [x] Confirmed renderer is OpenLayers 2 (light build) with global `OpenLayers` still present (2026 WME-GIS-Layers patch).
- [x] Confirmed the Nov 2019 `W.map` API reduction and `getOLMap()` escape hatch.
- [x] Confirmed SDK path needs **no** projection transform (WGS84), legacy path needs `EPSG:4326 → map projection`.
- [x] Captured the current Waze scripting-compliance policy and the managed-SDK migration directive.
- [x] Pinned HEAD commit SHAs for the example repositories.

**Explicitly inference (not directly sourced):** recommended z-order relative to editor handles; the claim that legacy `SelectFeature` specifically breaks WME editing (derived from the existence of the SDK's click-event API and community practice); and using a `Sidebar` tab rather than Waze's selection model for a read-only tool.

---

## 9. Sources

**Official Waze SDK**
- SDK home / migration guide: <https://www.waze.com/editor/sdk/index.html>
- SDK mirror: <https://web-assets.waze.com/wme_sdk_docs/production/latest/index.html>
- `index.SDK.Map`: <https://www.waze.com/editor/sdk/classes/index.SDK.Map.html>
- `index.SDK.FeatureStyle`: <https://www.waze.com/editor/sdk/interfaces/index.SDK.FeatureStyle.html>
- `index.SDK.SdkFeature`: <https://www.waze.com/editor/sdk/interfaces/index.SDK.SdkFeature.html>
- `index.SDK.SdkFeatureStyleRule`: <https://www.waze.com/editor/sdk/interfaces/index.SDK.SdkFeatureStyleRule.html>
- `index.SDK.SdkEvents`: <https://www.waze.com/editor/sdk/interfaces/index.SDK.SdkEvents.html>
- `index.SDK.LayerSwitcher`: <https://www.waze.com/editor/sdk/classes/index.SDK.LayerSwitcher.html>
- `index.SDK.Sidebar`: <https://www.waze.com/editor/sdk/classes/index.SDK.Sidebar.html>
- `index.SDK.Editing`: <https://www.waze.com/editor/sdk/classes/index.SDK.Editing.html>

**Community / renderer**
- Glodenox, *Script authors: W.map API changed* (2019): <https://www.waze.com/discuss/t/script-authors-w-map-api-changed/169227>
- Glodenox, *WME OpenLayers Library Upgrade*: <https://greasyfork.org/en/scripts/21007-wme-openlayers-library-upgrade>
- Glodenox, *Showcase: selectable features in WME map*: <https://greasyfork.org/en/scripts/467559-showcase-selectable-features-in-wme-map/code>
- OpenLayers 2 docs (vector styling): <https://docs.openlayers.org/library/feature_styling.html>

**Policy / licensing**
- Waze announcement, *Ensuring Map Data Integrity and Compliance in WME Scripting* (2026-04-06): <https://www.waze.com/discuss/t/important-reminder-ensuring-map-data-integrity-and-compliance-in-wme-scripting/402288>
- Waze Map Data Attribution: <https://support.google.com/waze/answer/12075833>
- Waze Community / ToS: <https://support.google.com/waze/answer/14013702>
- Additional open-source data form: <https://forms.gle/K8GxrHtqpe8MRTxB9>

**Example repositories**
- WazeDev/WME-GIS-Layers: <https://github.com/WazeDev/WME-GIS-Layers>
- WazeDev/WazeWrap: <https://github.com/WazeDev/WazeWrap>
- Waze-Dev-CH/WME-CH-Street-Name-Checker: <https://github.com/Waze-Dev-CH/WME-CH-Street-Name-Checker>
- MrTimbones/WME-Color-Highlights: <https://github.com/MrTimbones/WME-Color-Highlights>
- WazeDev/WME-Place-Interface-Enhancements: <https://github.com/WazeDev/WME-Place-Interface-Enhancements>
