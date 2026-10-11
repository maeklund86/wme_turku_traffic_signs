/**
 * A rectangular geographic coordinate boundary (GLOSSARY: Bounding Box),
 * WGS84 `[minLongitude, minLatitude, maxLongitude, maxLatitude]` — the same
 * order as a GeoJSON bbox and WME's `getMapExtent()`.
 */
export type BoundingBox = readonly [number, number, number, number];
