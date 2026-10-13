# WME Turku Traffic Signs

A browser-based tool assisting Waze Map Editor volunteers in Turku by providing visual reference of official municipal traffic signage.

## Language

**Traffic Sign**:
A physical road sign recorded in the municipal sign registry, identified by its Finnish national sign code and geographic position.
_Avoid_: Road sign, marker, placard

**Visual Overlay**:
A toggleable map layer rendered within WME that displays sign markers and attribute popups for editor reference.
_Avoid_: Sign bot, auto-editor, patcher

**Sign Panel**:
The script's own tab in the WME sidebar, holding the visibility control, sign category filters, the viewport-driven sign list, sign detail and attribution.
_Avoid_: Overlay, side panel, sign bot

**Sign Category**:
A grouping of traffic signs sharing a common regulatory function (e.g., speed limits, priority, parking).
_Avoid_: Tag, folder, bucket

**Bounding Box**:
The rectangular geographic coordinate boundary defined by the currently visible WME map viewport.
_Avoid_: Screen box, tile box, crop

**Turku Coverage Extent**:
The WGS84 bounding box of the City of Turku sign registry's coverage. Outside it the Sign Panel shows a one-line "outside Turku coverage" notice, its visibility toggle is disabled, and no signs render.
_Avoid_: Map extent, viewport box, city limits

**Client Cache**:
Local browser persistence storing retrieved traffic sign geographic data to reduce requests to the municipal API.
_Avoid_: Database, local store, sync cache

**Trimble OGC API**:
The modern OGC API - Features REST service provided by the City of Turku serving sign data as GeoJSON in WGS84.
_Avoid_: WFS, Tekla WFS, XML feed

**WME**:
The web-based Waze Map Editor used by community volunteers to maintain road segments and navigation data.
_Avoid_: Waze editor, map maker

**Userscript**:
A client-side script executed via a browser script manager (such as Tampermonkey or Violentmonkey) within the WME page context.
_Avoid_: Standalone extension, native plugin
