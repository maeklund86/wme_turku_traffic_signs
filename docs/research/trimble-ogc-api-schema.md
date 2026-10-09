# Research: Trimble OGC API Endpoint Schema and Capabilities

**Source Endpoint**: `https://opaskartta.turku.fi/trimbleogcapi/collections/GIS:Liikennemerkit/items`  
**OpenAPI Specification**: `https://opaskartta.turku.fi/trimbleogcapi/api`  
**Conformance**: `https://opaskartta.turku.fi/trimbleogcapi/conformance`  
**Related Ticket**: [#2 (Verify Trimble OGC API endpoint schema and capabilities)](https://github.com/maeklund86/wme_turku_traffic_signs/issues/2)

---

## 1. Conformance Classes

The City of Turku's Trimble OGC API service implements the following standards:
- `http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core` (OGC API - Features Part 1: Core)
- `http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/oas30` (OpenAPI 3.0 definition)
- `http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/html` (HTML representation)
- `http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson` (GeoJSON output)
- `http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/gmlsf2` (GML Simple Features profile)
- `http://www.opengis.net/spec/ogcapi-features-2/1.0/conf/crs` (OGC API - Features Part 2: Coordinate Reference Systems)

---

## 2. Query Parameters for `/items`

| Parameter | Type / Format | Required | Default | Description & Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `f` | string | No | `application/geo+json` | Response format. Supports `application/geo+json`, `application/gml+xml;version=3.2`, `text/html`. Trimble also accepts `f=json` as an alias for GeoJSON. |
| `bbox` | comma-separated numbers (`array<number>`) | No | Full extent | Bounding box spatial filter. Coordinates in order: `minLon,minLat,maxLon,maxLat` in WGS84 CRS84 (e.g. `22.26,60.45,22.28,60.46`). |
| `bbox-crs` | URI string | No | `http://www.opengis.net/def/crs/OGC/1.3/CRS84` | CRS of the bounding box parameter. |
| `crs` | URI string | No | `http://www.opengis.net/def/crs/OGC/1.3/CRS84` | CRS of returned feature geometries. Supported: CRS84, EPSG:4326, EPSG:3067, EPSG:3877. |
| `limit` | integer (1–10000) | No | `1000` | Maximum number of items returned per response page. Verified server max limit is `10000`. |
| `offset` | integer (>= 0) | No | `0` | Zero-based pagination offset index, linked dynamically via `rel="next"` links. |

*Note on property filtering*: The server does not support ad-hoc property filtering in the query string (e.g. `Varustelaji_koodi=C38` is ignored by the backend). All filtering by sign code or category must be performed client-side in the userscript.

---

## 3. Coordinate Reference System and Coordinate Order

- **Query `bbox` order**: `[minLon, minLat, maxLon, maxLat]` (i.e. lower-left longitude, lower-left latitude, upper-right longitude, upper-right latitude in decimal degrees).
- **Geometry representation**: GeoJSON `Point`.
- **Coordinates array order**: `[longitude, latitude, elevation]` where elevation is `0` (e.g. `[22.27617187661397, 60.443853785959234, 0]`).
- **CRS Alignment**: Coordinates are natively in WGS84 (OGC CRS84 / EPSG:4326), meaning no coordinate reprojection library (`proj4js`) is required before passing them into OpenLayers / WME `W.map` coordinates.

---

## 4. Feature Properties Schema

Verified against 10,000 features in the `GIS:Liikennemerkit` collection:

| Property Name | Data Type | Nullable | Example Value | Description |
| :--- | :--- | :--- | :--- | :--- |
| `Id` | string / integer | No | `"321020431"` | Unique municipal identifier for the traffic sign entity. |
| `Varustelaji` | string | No | `"C38 Pysäköinti kielletty"` | Human-readable sign description including the sign code and Finnish name. |
| `Varustelaji_koodi` | string | No | `"C38"` | Official Finnish national traffic sign code (e.g. `"A1"`, `"C38"`, `"E1"`). |
| `Huomautus` | string | Yes | `"Artukainen..."` or `null` | Optional free-form notes or supplementary municipal records. |

---

## 5. Sample GeoJSON Feature

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [
      22.27617187661397,
      60.443853785959234,
      0
    ]
  },
  "properties": {
    "Id": "321020431",
    "Varustelaji": "C38 Pysäköinti kielletty",
    "Varustelaji_koodi": "C38",
    "Huomautus": null
  }
}
```
