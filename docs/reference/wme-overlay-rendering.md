# WME Overlay Rendering Reference

Facts the Visual Overlay (and any later map-surface ticket) depends on, which
are not in the spec, not in the vendored typings, and not in the `research/*`
branches. Everything here was read out of primary sources during implementation
of [#16](https://github.com/maeklund86/wme_turku_traffic_signs/issues/16);
each row says how, so a later reader can re-check rather than trust.

Reached from `AGENTS.md` and spec §7.

## OL2 point rendering

The SDK `FeatureStyle` vocabulary *is* the OL2 vocabulary: `addFeatureToLayer`
hands the style straight to an `OpenLayers.Layer.Vector`. These come from
`OpenLayers.Renderer.Canvas.drawExternalGraphic` and the matching SVG path
(`Renderer.Elements`), read from the OL2 2.13 source.

| Fact | Consequence |
| --- | --- |
| A point graphic is **centred** on the feature: the default offset is `-w/2, -h/2` | The icon sits over the sign's point; lift it by `graphicYOffset` to rest it on a post |
| Positive `graphicYOffset` is **downward** in screen space (it is added to the canvas/SVG y) | Post and icon offsets are both negative-to-lift |
| `backgroundGraphic` is drawn first and uses the **same anchoring and offsets**, via `backgroundXOffset`/`backgroundYOffset`/`backgroundWidth`/`backgroundHeight` | A post behind an icon needs exactly one offset, and none if both are centred |
| `graphicOpacity` falls back to `fillOpacity`, then carries the **previous** feature's alpha forward when neither is set | Always set `graphicOpacity: 1` explicitly, or one translucent marker bleeds onto its neighbours |
| `style.cursor` is applied per feature (`a.style.cursor = style.cursor`) in the SVG renderer path | Per-feature cursor is impossible on the Canvas renderer, which is what SDK layers use — see below |
| No filter property exists | A drop shadow cannot be styled — bake it into the asset's own SVG (as `marker-graphics.ts` does for the post) |

Composing an icon on a post in pure `FeatureStyle` (no offsets beyond the
lift): `externalGraphic` = the icon at its fixed size, `backgroundGraphic` = the
post, both centred, with the icon lifted by the post's canvas height. See
`src/visual-overlay/marker-style.ts`.

**Cursor.** `FeatureStyle.cursor` cannot put a pointer over a marker. OL2 only
applies it in the SVG renderer path; SDK layers draw on the Canvas renderer,
where the entire layer is one `<canvas>` and no per-feature cursor can exist.
The SDK exposes no cursor API either — only hover events
(`wme-layer-feature-mouse-enter` / `-mouse-leave`, which require
`Events.trackLayerEvents`) and `Map.getMapViewportElement()`. So
`src/visual-overlay/marker-pointer.ts` drives the cursor from those hover
events instead: renderer-independent, documented SDK surface only. It counts
markers under the pointer so moving between adjacent markers cannot strand the
pointer, and clears itself when the layer is hidden.

## WME SDK

| Fact | Where verified |
| --- | --- |
| `Map.addLayer` accepts only `layerName`, `styleContext`, `styleRules`, `zIndexing`, and returns `void` | `wme-sdk-typings` (v2.370-3, vendored) |
| `addLayer` throws `InvalidStateError` when the layer name already exists | SDK docs, `index.SDK.Map` |
| `LayerSwitcher.addLayerCheckbox` is the **only** path to a LayerSwitcher entry — never call it and the layer renders unlisted | SDK changelog v2.254; shipped scripts (Falcon Eye, WME Place Interface Enhancements) |
| `Map.setLayerVisibility` / `isLayerVisible` (v2.247+); `Map.getMapExtent` (v2.229) | SDK docs |
| `styleContext` values are interpolated into `styleRules` as `${key}`; the context function receives `{ feature, zoomLevel }` | SDK docs, `index.SDK.Map` dynamic-style example |

**`${key}` interpolation for `externalGraphic`: verified, 2026-10-12.** It was
left unresolved here because the SDK runtime is not published and no shipped
script was found doing it. A WME test-environment run confirmed markers render,
so dynamic per-feature icon URLs work through the style context — the mechanism
`marker-style.ts` and `marker-pointer.ts` both rest on. Recorded here so it
stays verified rather than re-derived.

## Typings traps that cost a compile round-trip

- `SdkFeatureProperties` is `Record<string, string | number | null | undefined | geometry>` — **no boolean**, so a discriminated feature property is a string union.
- `FeatureStyle` is declared but not exported; annotate a style as `SdkFeatureStyleRule["style"]`.
- `addLayer`'s `styleRules` parameter is a mutable `SdkFeatureStyleRule[]`, so a `readonly` rule list needs a spread at the call site.

## Related

- Spec §4.4 (Visual Overlay) — the behaviour these facts implement.
- `scripts/refresh-sign-icon-catalogue.mjs` — the asset catalogue, pinned by SHA.
