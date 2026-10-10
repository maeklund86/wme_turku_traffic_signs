# Research: WME SDK Layer Visibility and LayerSwitcher Control

**Related Ticket**: [#13 (Control SDK marker-layer visibility from the script's own sidebar tab, outside the LayerSwitcher)](https://github.com/maeklund86/wme_turku_traffic_signs/issues/13)  
**Date**: 2026-10-10  
**Author**: Wayfinder Agent  
**Scope**: How a WME userscript keeps an SDK-created feature layer out of WME's right-hand LayerSwitcher while still rendering it on the map, how layer visibility is controlled programmatically, and how the current map extent/viewport is read for a viewport-driven sign list. Supersedes the `LayerSwitcher.addLayerCheckbox` toggle recorded in [#4](https://github.com/maeklund86/wme_turku_traffic_signs/issues/4) / [#6](https://github.com/maeklund86/wme_turku_traffic_signs/issues/6).

---

## 1. Executive Summary

- **A layer added with `sdk.Map.addLayer` renders on the map without appearing in the LayerSwitcher — the LayerSwitcher entry is strictly opt-in.** There is no "hide from LayerSwitcher" flag to set: the LayerSwitcher entry only exists because something called `sdk.LayerSwitcher.addLayerCheckbox({ name, isChecked })`. Never call it, and the layer is invisible to the switcher but still drawn. Verified from the current TypeScript typings (`addLayer` accepts only `layerName`, `styleContext`, `styleRules`, `zIndexing`) and from shipped scripts that do exactly this (WME Falcon Eye, WME Place Interface Enhancements).
- **Programmatic visibility exists and is the sanctioned toggle: `sdk.Map.setLayerVisibility({ layerName, visibility })`** (with the getter `sdk.Map.isLayerVisible({ layerName })`). Added in SDK **v2.247** and present in the current docs/typings (WME version `v2.370-3-gaa6183241e`). It only works for layers **created through the SDK**. There is no `Layer.setVisible` — `addLayer` returns `void`, so there is no layer object to call it on.
- **Remove-and-re-add is NOT the toggle pattern.** Nothing in the SDK docs, changelog, or shipped scripts presents `removeLayer` + `addLayer` as a visibility mechanism. It exists only as an idempotent *re-create* (style rebuild), and it forces a full feature re-registration plus a map flicker. The only "remove+re-add is the workaround" comment in a shipped script refers to the *checkbox*, not the layer, and is commented out in favour of `setLayerCheckboxChecked`.
- **Shipped scripts drive layer visibility from their own sidebar tab today.** WME Place Interface Enhancements adds three layers with no LayerSwitcher checkbox at all and toggles them from checkboxes inside its `Sidebar.registerScriptTab` pane; WME-GIS-Layers and WME-FC-Layer put a power button in their sidebar tab that calls `setLayerVisibility` and mirrors the state into the switcher checkbox they *also* registered.
- **For the viewport-driven list (#12), use the SDK, not the OL2 map:** `sdk.Map.getMapExtent()` returns the visible area as a GeoJSON BBox `[left, bottom, right, top]` in WGS84 (since v2.229), refreshed on `wme-map-move-end`. `W.map.getOLMap()` is unnecessary.
- **Recommendation (§7):** create the layer once with `addLayer`, **never call `addLayerCheckbox`**, and drive `setLayerVisibility` from a checkbox in our own sidebar tab, persisting the flag and re-applying it after every `wme-ready`.

---

## 2. Keeping a Layer Out of the LayerSwitcher While It Still Renders

### 2.1 There is no visibility/LayerSwitcher option on `addLayer`

The published typings (`wme-sdk-typings` v2.370-3-gaa6183241e) define `Map.addLayer` as:

```typescript
addLayer(args: {
  layerName: string;
  styleContext?: SdkFeatureStyleContext;
  styleRules?: SdkFeatureStyleRule[];
  zIndexing?: boolean;
}): void;
```

Sources: [`index.SDK.Map`](https://www.waze.com/editor/sdk/classes/index.SDK.Map.html) and the typings package published next to the docs ([`wme-sdk-typings.tgz`](https://web-assets.waze.com/wme_sdk_docs/production/latest/wme-sdk-typings.tgz)). **No `displayInLayerSwitcher`, no `visible`, no `uniqueName`.**

The SDK overview describes the module split as "LayerSwitcher: Add or remove custom Map layers checkboxes" ([SDK index](https://www.waze.com/editor/sdk/index.html)) — i.e. the *only* thing the LayerSwitcher module does for script layers is add/remove checkboxes.

### 2.2 The switcher entry is created solely by `addLayerCheckbox`

```typescript
// sdk.LayerSwitcher.addLayerCheckbox
addLayerCheckbox({ name, isChecked }: {
  isChecked?: boolean;  // Optional. Initial checked state of the checkbox. Defaults to false.
  name: string;
}): void;
// "Add a new checkbox to the SDK Layer checkboxes list"
// @throws InvalidStateError if the checkbox with the specified name already exists for this script
```

Source: [`index.SDK.LayerSwitcher`](https://www.waze.com/editor/sdk/classes/index.SDK.LayerSwitcher.html). The SDK **CHANGELOG** records the arrival of this entry point as *"Add layers to the menu via SDK"* in **v2.254** ([CHANGELOG](https://www.waze.com/editor/sdk/documents/CHANGELOG.html)).

**Consequence (the answer to question 1):** a layer created by `sdk.Map.addLayer` is rendered on the map by default and is *not* listed in the LayerSwitcher unless the script explicitly registers a checkbox. Removing the checkbox later is `LayerSwitcher.removeLayerCheckbox({ name })`.

### 2.3 Shipped proof — layers render with no switcher entry

| Script | Evidence |
| :--- | :--- |
| **WME Falcon Eye** ([`wme-falcon-eye-1.2.1.user.js`](https://github.com/bedo2991/wme-falcon-eye/blob/main/releases/wme-falcon-eye-1.2.1.user.js), commit `21994cd`) | Calls `wmeSDK.Map.addLayer(...)` twice, then `addFeaturesToLayer`/`addFeatureToLayer`; **no `LayerSwitcher` call anywhere in the file** and no `setLayerVisibility` call — the layers simply draw. |
| **WME Place Interface Enhancements** ([`WMEPIE.js`](https://github.com/WazeDev/WME-Place-Interface-Enhancements/blob/master/WMEPIE.js) L531-535, L786, commit `84286fa`) | `sdk.Map.addLayer({ layerName: 'PIEPlaceNameLayer', displayInLayerSwitcher: false, uniqueName: '__PIEPlaceNameLayer', ... })`, `setLayerVisibility({ ..., visibility: true })`, and the only `LayerSwitcher.addLayerCheckbox` calls in the file are **commented out** (L938-939, L1117-1118). Visibility is toggled from the script's own sidebar tab. |
| **WME Digitraffic vaihtuvat opasteet** ([`WME-digitraffic-vaihtuvat-opasteet.user.js`](https://github.com/Metroseksuaali/Waze-Finland-Scripts/blob/main/scripts/digitraffic-vaihtuvat-liikenneopasteet/WME-digitraffic-vaihtuvat-opasteet.user.js) L217-236, commit `ba8e1ab`) | Adds `LAYER_SUUNTA` plus two sign layers, sets `setLayerVisibility({ ..., visibility: true })` on each, and registers LayerSwitcher checkboxes for only **two** of them. |

### 2.4 Two caveats

1. **`displayInLayerSwitcher: false` and `uniqueName` are undocumented.** They appear in PIE's calls (above) but are absent from the published typings. They are almost certainly ignored today (the LayerSwitcher entry never existed, so there is nothing to suppress). **Do not rely on them; the documented and sufficient mechanism is simply not calling `addLayerCheckbox`.**
2. **Native (non-SDK) WME layers are different.** `LayerSwitcher.setWMELayerVisibility({ layerName, isVisible })` and `getWMELayerVisibility({ layerName })` control WME's own layers and *also* update the switcher checkbox — added in **v2.365** ("Add generic layer visibility to LayerSwitcher"). Not applicable to script layers.

---

## 3. Programmatic Visibility Control (Question 2)

### 3.1 Exact API

```typescript
// sdk.Map.setLayerVisibility
setLayerVisibility(args: { layerName: string; visibility: boolean }): void;
// "Change map layer visibility (layer must be created through the SDK)."
// @throws InvalidStateError if a layer doesn't exist.

// sdk.Map.isLayerVisible
isLayerVisible(args: { layerName: string }): boolean;
// "Check if map layer is visible."  true if layer is visible, false otherwise
// @throws InvalidStateError if the layer doesn't exist
```

Sources: [`index.SDK.Map`](https://www.waze.com/editor/sdk/classes/index.SDK.Map.html) and the typings package. SDK **CHANGELOG v2.247**: *"Add methods to get & set layer visibility and opacity — SDK methods can only modify layers that were created using the SDK. add Map.isLayerVisible(), add Map.setLayerVisibility(), add Map.getLayerOpacity(), add Map.setLayerOpacity()"*.

### 3.2 There is no `Layer.setVisible` / no layer handle

`addLayer` returns `void`, so no layer object is ever handed back and there is nothing to call `setVisible` on. The legacy OpenLayers 2 equivalent (`OpenLayers.Layer.Vector#setVisibility` on `W.map.getOLMap()`) applies only to non-SDK layers, and SDK methods explicitly refuse to touch them ("layer must be created through the SDK", v2.247 note). Related, for reference: `setLayerOpacity({ layerName, opacity })` / `getLayerOpacity({ layerName })` (also v2.247), and `redrawLayer({ layerName })`.

### 3.3 Visibility-change events

`wme-layer-visibility-changed` → `{ layerName: string }`, documented as *"The event happens when a tracked layer visibility has been changed"* ([`index.SDK.SdkEvents`](https://www.waze.com/editor/sdk/interfaces/index.SDK.SdkEvents.html)), added in **v2.253** ("Provide layer visibility change event").

**Caveat (unverified):** the docs do not state whether it fires when *the script itself* calls `setLayerVisibility`, or only when the user changes visibility through the switcher. The one shipped usage found reacts to user-driven changes: WME-Show-Alt-Names listens to it and re-runs `checkSelection()` when the user flips its hand-rolled switcher checkbox. Also available: `wme-map-layer-added` / `wme-map-layer-removed` / `wme-map-layer-changed` (all `{ layerName }`); PIE's migration record maps the legacy `W.map.events.register('changelayer')` hook to `wme-map-layer-changed`.

**Design consequence:** since our own sidebar tab is the only writer, we should keep the boolean in our own state and not depend on `wme-layer-visibility-changed` echo. If we want a safety net, reconcile with `sdk.Map.isLayerVisible({ layerName })`.

---

## 4. Is Remove-and-Re-Add a Sanctioned Toggle? (Question 3)

**No.** Nothing in the SDK docs, the SDK changelog, or any shipped script uses `removeLayer` → `addLayer` → `addFeaturesToLayer` as a visibility mechanism. Its documented use is idempotent re-creation, and it is expensive:

| Cost | Evidence |
| :--- | :--- |
| **All features must be re-registered.** `removeLayer` takes the layer (and its features) off the map; the feature API is per-layer (`addFeatureToLayer`/`addFeaturesToLayer`/`removeFeatureFromLayer`/`removeAllFeaturesFromLayer`), so the features go with it. | [`index.SDK.Map`](https://www.waze.com/editor/sdk/classes/index.SDK.Map.html) |
| **`addLayer` throws `InvalidStateError` if the name still exists**, so the remove must be guarded (the pattern used by WME-GIS-Layers: `try { sdk.Map.removeLayer(...) } catch (e) { if (!(e instanceof sdk.Errors.InvalidStateError)) throw e; }`). | WME-GIS-Layers L6597-6623, commit `d5d0387` |
| **Feature re-validation.** `addFeatureToLayer`/`addFeaturesToLayer` validate against the OGC Simple Features Access standard; `dangerouslyAddFeaturesToLayerWithoutValidation` exists precisely to *skip* that work, which shows it is real cost. | [`index.SDK.Map`](https://www.waze.com/editor/sdk/classes/index.SDK.Map.html) |
| **Layer-event tracking must be re-established.** `sdk.Events.trackLayerEvents({ layerName })` throws `InvalidStateError` if the layer doesn't exist, so after a re-add the script must track again or `wme-layer-feature-clicked` stops firing. | [`index.SDK.Map`](https://www.waze.com/editor/sdk/classes/index.SDK.Map.html) |
| **Layer parameters must be re-applied** (`setLayerZIndex`, `setLayerOpacity`, `setLayerVisibility`). | WME-GIS-Layers L6635-6636 re-applies visibility immediately after re-adding. |
| **User-visible churn.** `wme-map-layer-removed` + `wme-map-layer-added` fire and every marker is re-created — a flicker on the map. | [`index.SDK.SdkEvents`](https://www.waze.com/editor/sdk/interfaces/index.SDK.SdkEvents.html) |

The one "remove+re-add is the workaround" comment in shipped source is about the **checkbox**, not the layer, and it is commented out: WME Place Interface Enhancements L937-939 (`// The SDK has no setter for custom layer checkboxes, so remove+re-add is the workaround.` above a commented-out `removeLayerCheckbox`/`addLayerCheckbox` pair, replaced by `setLayerCheckboxChecked` — a method that arrived in v2.279, *"Add ability to manually set layerSwitcher checkbox value"*).

**If only some features need hiding**, the sanctioned primitives are `removeFeaturesFromLayer` / `removeAllFeaturesFromLayer` + re-add, or a style predicate + `redrawLayer`. For a whole-layer on/off, use `setLayerVisibility`.

---

## 5. How Shipped Userscripts Drive Layer Visibility from Their Own Sidebar Tab (Question 4)

| Script | LayerSwitcher entry? | Visibility control | Pinned commit |
| :--- | :--- | :--- | :--- |
| **WME Place Interface Enhancements** | **None** (its only `addLayerCheckbox` calls are commented out) | `#_cbShowPlaceNames` checkbox inside `Sidebar.registerScriptTab` pane → `sdk.Map.setLayerVisibility({ layerName: 'PIEPlaceNameLayer', visibility: this.checked })` | [`84286fa`](https://github.com/WazeDev/WME-Place-Interface-Enhancements/blob/84286faa766e7947b1a6f707573744391451b127/WMEPIE.js) (2026-06-09, master, not archived) |
| **WME-GIS-Layers** | Yes (`'GIS Layers'`) | Power button `#gis-layers-power-btn` **inside its sidebar tab** → `setEnabled(value)` → `setLayerVisibility` for `DEFAULT_LAYER_NAME` + `ROAD_LAYER_NAME`, mirrored with `LayerSwitcher.setLayerCheckboxChecked({ name: 'GIS Layers', isChecked: value })` | [`d5d0387`](https://github.com/WazeDev/WME-GIS-Layers/blob/d5d0387df39d09829c82db2a6e0aa7f7b8d55941/WME-GIS-Layers.js) (2026-04-14, master) |
| **WME CA Government Boundaries** | Yes (5 per-layer checkboxes) | `.cagb-visibility-toggle` buttons in its own sidebar tab → `toggleLayerVisibility(layerKey)` → `setLayerVisibility` + `setLayerCheckboxChecked` | [`1c6b96e`](https://github.com/WazeDev/WME-CA-Government-Boundaries/blob/1c6b96e577c1d2331f65b4fecd3d7317794ed088/WME%20CA%20Government%20Boundaries.js) (2026-09-14, main) |
| **WME FC Layer** | Yes (`'FC Layer'`) | `#fc-layer-power-btn` in its sidebar tab → `setEnabled(value)` → `setLayerVisibility` + `setLayerCheckboxChecked` | [`682d8ba`](https://github.com/WazeDev/WME-FC-Layer/blob/682d8bab5fa621661d1363c67a2d2b9fa6f6d4b5/WME-FC-Layer.js) (2026-06-24, master) |
| **WME CH Street Name Checker** | Yes | Thin wrapper `HighlightLayer.setVisible(visible)` → `setLayerVisibility`, called from the `wme-layer-checkbox-toggled` handler | [`91ac74c`](https://github.com/Waze-Dev-CH/WME-CH-Street-Name-Checker/blob/91ac74c59ef0bd3c49addaf878bee601c5a88176/src/map-layer.ts) (2026-06-16, main, **archived**) |
| **WME-Show-Alt-Names** | Yes, hand-rolled DOM inside `.layer-switcher` | `changeLayerVisibility(checked)` → two `setLayerVisibility` calls; listens to `wme-layer-visibility-changed` to re-sync | current `master` (no release SHA) |

**Pattern distilled:** keep a boolean in the script's own settings, wire a control inside the `tabPane` returned by `sdk.Sidebar.registerScriptTab()`, and call `sdk.Map.setLayerVisibility`. If a switcher checkbox *does* exist, mirror it with `LayerSwitcher.setLayerCheckboxChecked` and subscribe to `wme-layer-checkbox-toggled` (`{ checked, name }`) for the reverse direction — that bi-directional sync is what WME-GIS-Layers / CA-Gov / FC-Layer do.

---

## 6. Map Extent / Viewport for the Sign List (Question 5, bonus)

**Use the SDK — no need for `W.map.getOLMap()`.**

```typescript
getMapExtent(): BBox;   // "the map's currently visible area as a GeoJSON BBox ...
                        //  [left, bottom, right, top]"  (WGS84)
```

Source: [`index.SDK.Map`](https://www.waze.com/editor/sdk/classes/index.SDK.Map.html); added in **v2.229** ("Add Map.getMapExtent() method", "Add Map.getMapViewportElement() method").

Related viewport surface (same source):

| Method | Returns |
| :--- | :--- |
| `getMapCenter()` | `LonLat` (WGS84) |
| `getZoomLevel()` | `ZoomLevel`; also `MIN_ZOOM_LEVEL` / `MAX_ZOOM_LEVEL` |
| `getMapResolution()` | number — map units per pixel at the current zoom |
| `getMapViewportElement()` | `HTMLElement` (throws `MissingElementError`) |
| `getPixelFromLonLat` / `getLonLatFromPixel` | screen-relative pixels ↔ WGS84 |
| `getMapPixelFromLonLat` / `getLonLatFromMapPixel` | map-relative pixels ↔ WGS84 (matches `SdkMouseEvent` payload) |

Refresh triggers: `wme-map-move-end`, `wme-map-move`, `wme-map-zoom-changed` ([`index.SDK.SdkEvents`](https://www.waze.com/editor/sdk/interfaces/index.SDK.SdkEvents.html)).

**Shipped template for a viewport-driven sidebar list** — WME CH Street Name Checker, `src/ui/tab.ts` L223-231 and L428-446 (commit `91ac74c`):

```typescript
this.sdk.Events.on({
  eventName: "wme-map-move-end",
  eventHandler: () => {
    if (this.settings.get().viewportOnly) this.render(this.scanner.getSnapshot(), true);
  },
});
...
/** Read the visible map extent; null (filter disabled) on any SDK failure. */
private currentViewport(): Bbox | null {
  try { return this.sdk.Map.getMapExtent() as Bbox; } catch { return null; }
}
```

Note: the SDK migration table on the index page says "Use `Map.getExtent`" for `W.map.getExtent` — a **docs typo**; the real method is `getMapExtent()` ([SDK index](https://www.waze.com/editor/sdk/index.html)).

---

## 7. Recommendation for the Toggle

1. **Create the layer once, never register a switcher checkbox.**

```javascript
const sdk = getWmeSdk({ scriptId: "wme-turku-traffic-signs", scriptName: "Turku Traffic Signs" });
const LAYER = "turku_traffic_signs";

await sdk.Events.once({ eventName: "wme-ready" });   // layers don't survive a reload / logout

sdk.Map.addLayer({ layerName: LAYER, styleContext, styleRules, zIndexing: true });
// Deliberately NO sdk.LayerSwitcher.addLayerCheckbox(...) — that is what keeps the layer
// out of WME's right-hand LayerSwitcher while it still renders on the map.
sdk.Map.setLayerVisibility({ layerName: LAYER, visibility: settings.showSigns });
```

2. **Drive visibility from our own sidebar tab.**

```javascript
const { tabLabel, tabPane } = await sdk.Sidebar.registerScriptTab();
tabLabel.textContent = "Turku signs";
const toggle = tabPane.querySelector("#turku-signs-visible");
toggle.checked = settings.showSigns;
toggle.addEventListener("change", () => {
  settings.showSigns = toggle.checked;
  sdk.Map.setLayerVisibility({ layerName: LAYER, visibility: settings.showSigns });
  renderSignList();          // viewport-driven list from §6
});
```

3. **Re-apply after every `wme-ready`** (and after any `wme-map-layer-removed`), because layers are gone on reload/logout; wrap the initial `addLayer` in the idempotent `try { sdk.Map.removeLayer(...) } catch (e) { if (!(e instanceof sdk.Errors.InvalidStateError)) throw e; }` guard if re-init is possible.
4. **Optional reconciliation:** `sdk.Map.isLayerVisible({ layerName: LAYER })` to confirm the state instead of trusting `wme-layer-visibility-changed` (whose semantics for script-initiated changes are undocumented — §3.3).
5. **Do not use `removeLayer` + re-add as a toggle** (§4) — it drops every feature and forces re-validation, re-tracking and a redraw.

---

## 8. Verified vs Uncertain

**Verified from primary sources:** `addLayer`'s exact signature (typings v2.370-3-gaa6183241e) and the absence of any visibility/switcher option; `addLayerCheckbox` as the only path to a LayerSwitcher entry (v2.254); `setLayerVisibility` / `isLayerVisible` signature, docs text and version (v2.247); `getMapExtent` signature, BBox order and version (v2.229); `registerScriptTab` contract; `wme-layer-visibility-changed` payload; the cost items in §4; every shipped-script claim in §2.3 and §5 (read at the pinned commits).

**Not documented / uncertain:**
- Whether a freshly added layer is visible by default. The docs are silent; in practice shipped scripts either call `setLayerVisibility({..., visibility: true})` right after `addLayer` or (Falcon Eye) never touch it and the layer draws. **Assume visible, but call `setLayerVisibility` explicitly once after creation** — costs nothing and removes the doubt.
- Whether `wme-layer-visibility-changed` fires for a *script-initiated* `setLayerVisibility` (only user-driven usage is observed in shipped code). Our recommendation does not depend on it.
- Whether `displayInLayerSwitcher` / `uniqueName` still have any effect — absent from published typings, so assume ignored.
- Any documented feature-count or size limits for `addFeaturesToLayer`. WME-GIS-Layers' most recent commit ("Chunked async feature processing — large layers no longer freeze WME", `d5d0387`) is evidence that very large single batches are a real performance concern, but that is community inference, not an SDK-documented limit.

---

## 9. Checklist

- [x] Confirmed `Map.addLayer` signature and that it has no LayerSwitcher/visibility option (typings v2.370-3-gaa6183241e).
- [x] Confirmed `LayerSwitcher.addLayerCheckbox` is the sole path to a switcher entry (docs + SDK changelog v2.254).
- [x] Found shipped scripts with SDK layers that render with no switcher entry (Falcon Eye, PIE, Digitraffic vaihtuvat opasteet).
- [x] Confirmed `Map.setLayerVisibility` / `Map.isLayerVisible` exact names, signatures, docs text and SDK version (v2.247).
- [x] Confirmed there is no `Layer.setVisible` (no layer handle: `addLayer` returns `void`).
- [x] Confirmed remove-and-re-add is not documented as a toggle; enumerated its costs.
- [x] Collected sidebar-tab-driven visibility examples with pinned commits (PIE, GIS-Layers, CA Gov Boundaries, FC Layer, CH SNC, Show Alt Names).
- [x] Confirmed `Map.getMapExtent` (v2.229) as the SDK viewport source, with a shipped viewport-driven sidebar-list template.
- [x] Noted the "Use `Map.getExtent`" docs typo (real name: `getMapExtent`).

---

## 10. Sources

**Official Waze SDK**
- SDK home / module overview / migration guide: <https://www.waze.com/editor/sdk/index.html>
- SDK CHANGELOG (version attribution): <https://www.waze.com/editor/sdk/documents/CHANGELOG.html>
- `index.SDK.Map`: <https://www.waze.com/editor/sdk/classes/index.SDK.Map.html>
- `index.SDK.LayerSwitcher`: <https://www.waze.com/editor/sdk/classes/index.SDK.LayerSwitcher.html>
- `index.SDK.Sidebar`: <https://www.waze.com/editor/sdk/classes/index.SDK.Sidebar.html>
- `index.SDK.SdkEvents`: <https://www.waze.com/editor/sdk/interfaces/index.SDK.SdkEvents.html>
- TypeScript typings package (same version as docs): <https://web-assets.waze.com/wme_sdk_docs/production/latest/wme-sdk-typings.tgz>

**Shipped userscript sources (read at the pinned commits)**
- WazeDev/WME-Place-Interface-Enhancements @ `84286faa766e7947b1a6f707573744391451b127` — <https://github.com/WazeDev/WME-Place-Interface-Enhancements/blob/84286faa766e7947b1a6f707573744391451b127/WMEPIE.js> (+ `SKD Migration Record.md`)
- WazeDev/WME-GIS-Layers @ `d5d0387df39d09829c82db2a6e0aa7f7b8d55941` — <https://github.com/WazeDev/WME-GIS-Layers/blob/d5d0387df39d09829c82db2a6e0aa7f7b8d55941/WME-GIS-Layers.js>
- WazeDev/WME-CA-Government-Boundaries @ `1c6b96e577c1d2331f65b4fecd3d7317794ed088` — <https://github.com/WazeDev/WME-CA-Government-Boundaries/blob/1c6b96e577c1d2331f65b4fecd3d7317794ed088/WME%20CA%20Government%20Boundaries.js>
- WazeDev/WME-FC-Layer @ `682d8bab5fa621661d1363c67a2d2b9fa6f6d4b5` — <https://github.com/WazeDev/WME-FC-Layer/blob/682d8bab5fa621661d1363c67a2d2b9fa6f6d4b5/WME-FC-Layer.js>
- Waze-Dev-CH/WME-CH-Street-Name-Checker @ `91ac74c59ef0bd3c49addaf878bee601c5a88176` — <https://github.com/Waze-Dev-CH/WME-CH-Street-Name-Checker/blob/91ac74c59ef0bd3c49addaf878bee601c5a88176/src/map-layer.ts>, `src/ui/tab.ts`
- bedo2991/wme-falcon-eye @ `21994cd433d3c80ba8f35d0fb22994ceb78f67af` — <https://github.com/bedo2991/wme-falcon-eye/blob/21994cd433d3c80ba8f35d0fb22994ceb78f67af/releases/wme-falcon-eye-1.2.1.user.js>
- Metroseksuaali/Waze-Finland-Scripts @ `ba8e1ab1b1f6466f77b4a3e8203ffcd2bd132a48` — <https://github.com/Metroseksuaali/Waze-Finland-Scripts/blob/ba8e1ab1b1f6466f77b4a3e8203ffcd2bd132a48/scripts/digitraffic-vaihtuvat-liikenneopasteet/WME-digitraffic-vaihtuvat-opasteet.user.js>
- kid4rm90s/WME-Show-Alt-Names (current master) — <https://github.com/kid4rm90s/WME-Show-Alt-name/blob/master/WME-Show-Alt-Names.user.js>

**Repo-internal context (already settled, not re-derived here)**
- `docs/research/wme-openlayers-vector-integration.md` on branch `research/wme-openlayers-vector-integration` (issue #4) — SDK bootstrap, `addLayer`/`addFeatureToLayer`, `trackLayerEvents`, `wme-layer-feature-clicked`, projection.
- Resolution comments of #4 and #6 — SDK-only path, WGS84, marker presentation.
