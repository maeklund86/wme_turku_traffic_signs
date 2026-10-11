import type { BoundingBox } from "./bounding-box";
import type { TrafficSign } from "./traffic-sign";

/**
 * In-memory spatial index over a whole Turku dataset, built at load for
 * client-side filtering and rendering (spec §4.3): the whole registry is
 * ~36k points, small enough to hold and index in memory, which is why
 * panning and zooming never touch the network.
 */
export interface SpatialIndex {
  /** Every sign in the dataset, in fetch order. */
  readonly signs: readonly TrafficSign[];
  /** Signs inside the Bounding Box (edges inclusive), in fetch order. */
  query(bounds: BoundingBox): readonly TrafficSign[];
}

/** Grid cell size in degrees (~1 km at Turku's latitude). */
const CELL_SIZE = 0.01;

export function buildSpatialIndex(signs: readonly TrafficSign[]): SpatialIndex {
  const cells = new Map<string, number[]>();
  signs.forEach((sign, position) => {
    const [longitude, latitude] = sign.coordinates;
    const cell = cellKey(longitude, latitude);
    const bucket = cells.get(cell);
    if (bucket === undefined) {
      cells.set(cell, [position]);
    } else {
      bucket.push(position);
    }
  });

  return {
    signs,
    query: (bounds) => queryCells(signs, cells, bounds),
  };
}

function queryCells(signs: readonly TrafficSign[], cells: Map<string, number[]>, bounds: BoundingBox): readonly TrafficSign[] {
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = bounds;
  const positions: number[] = [];
  const fromLongitude = Math.floor(minLongitude / CELL_SIZE);
  const fromLatitude = Math.floor(minLatitude / CELL_SIZE);
  const toLongitude = Math.floor(maxLongitude / CELL_SIZE);
  const toLatitude = Math.floor(maxLatitude / CELL_SIZE);
  for (let cellLongitude = fromLongitude; cellLongitude <= toLongitude; cellLongitude += 1) {
    for (let cellLatitude = fromLatitude; cellLatitude <= toLatitude; cellLatitude += 1) {
      const bucket = cells.get(`${cellLongitude}:${cellLatitude}`);
      if (bucket === undefined) continue;
      for (const position of bucket) {
        const [longitude, latitude] = signs[position]!.coordinates;
        if (
          longitude >= minLongitude &&
          longitude <= maxLongitude &&
          latitude >= minLatitude &&
          latitude <= maxLatitude
        ) {
          positions.push(position);
        }
      }
    }
  }
  // Cell traversal order is grid order; callers get fetch order, so list and
  // marker rendering stay stable regardless of where the signs sit.
  return positions.sort((left, right) => left - right).map((position) => signs[position]!);
}

function cellKey(longitude: number, latitude: number): string {
  return `${Math.floor(longitude / CELL_SIZE)}:${Math.floor(latitude / CELL_SIZE)}`;
}
