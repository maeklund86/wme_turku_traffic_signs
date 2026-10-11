import { isPlainObject } from "../json";

/**
 * One Traffic Sign as served by the Trimble OGC API and held in the Client
 * Cache: the municipal feature key, the sign code, the official Finnish name,
 * optional notes, and the WGS84 point. Properties map 1:1 from the API with
 * no transformation (GLOSSARY: Traffic Sign; spec §3).
 */
export interface TrafficSign {
  /** Internal identity only; never rendered. Source property `Id`. */
  readonly key: string;
  /** Source property `Varustelaji_koodi` (e.g. `C38`); sole filter source. */
  readonly signCode: string;
  /** Source property `Varustelaji`; displayed verbatim in Finnish. */
  readonly signName: string;
  /** Source property `Huomautus`; null when absent from the feature. */
  readonly notes: string | null;
  /** GeoJSON Point `[longitude, latitude]` in WGS84; consumed unreprojected. */
  readonly coordinates: readonly [longitude: number, latitude: number];
}

/**
 * Parses one GeoJSON feature from the Trimble OGC API. Returns null for rows
 * that cannot be presented as a Traffic Sign — registry rows carrying neither
 * `Varustelaji_koodi` nor `Varustelaji`, and anything that is not a Point —
 * so a placeholder row drops out of the dataset instead of surfacing blank.
 */
export function parseTrafficSignFeature(value: unknown): TrafficSign | null {
  if (!isPlainObject(value)) return null;
  const properties = isPlainObject(value.properties) ? value.properties : null;
  if (properties === null) return null;

  const signCode = nonEmptyString(properties.Varustelaji_koodi);
  const signName = nonEmptyString(properties.Varustelaji);
  if (signCode === null || signName === null) return null;

  const point = parsePoint(value.geometry);
  if (point === null) return null;

  const huomautus = properties.Huomautus;
  const key = nonEmptyString(properties.Id) ?? "";

  return {
    key,
    signCode,
    signName,
    notes: typeof huomautus === "string" ? huomautus : null,
    coordinates: point,
  };
}

/** GeoJSON Point `[longitude, latitude]`; ignores any trailing elevation. */
function parsePoint(value: unknown): readonly [number, number] | null {
  if (!isPlainObject(value) || value.type !== "Point") return null;
  const coordinates = value.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [longitude, latitude] = coordinates as unknown[];
  return typeof longitude === "number" && Number.isFinite(longitude) &&
    typeof latitude === "number" && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
