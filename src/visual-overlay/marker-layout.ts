import type { BoundingBox } from "../data/bounding-box";
import type { TrafficSign } from "../data/traffic-sign";
import { FALLBACK_MARKER, resolveSignMarkerGraphic } from "./marker-style";
import {
  SIGN_ICON_SIZE,
  SIGN_PLATE_HEIGHT,
  SIGN_PLATE_WIDTH,
  SIGN_POST_CANVAS_HEIGHT,
} from "./marker-graphics";

export interface MarkerLayoutViewport {
  readonly bounds: BoundingBox;
  readonly width: number;
  readonly height: number;
}

export interface MarkerPlacement {
  readonly iconYOffset: number;
  readonly postHeight: number;
  readonly postYOffset: number;
  readonly postShadowAtTop: boolean;
  readonly postHasShadow: boolean;
}

const DEFAULT_ICON_Y_OFFSET = -(SIGN_POST_CANVAS_HEIGHT + SIGN_ICON_SIZE / 2);
const MAX_MARKER_WIDTH = SIGN_PLATE_WIDTH;
const MAX_MARKER_HEIGHT = Math.max(SIGN_ICON_SIZE, SIGN_PLATE_HEIGHT);
const STACK_GAP = 6;
const STACK_SPACING = MAX_MARKER_HEIGHT + STACK_GAP;

/**
 * Returns one placement per sign, in input order. Overlapping icons form a
 * stable vertical stack; short connector segments join adjacent icons, with the
 * stack anchored at its source Traffic Sign point.
 */
export function layoutMarkerIcons(
  signs: readonly TrafficSign[],
  viewport: MarkerLayoutViewport,
): readonly MarkerPlacement[] {
  const placements = signs.map(() => defaultPlacement());
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = viewport.bounds;
  if (
    signs.length < 2 ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    maxLongitude <= minLongitude ||
    maxLatitude <= minLatitude
  ) {
    return placements;
  }

  const projected = signs.map((sign, index) => projectMarker(sign, index, viewport));
  const parents = projected.map((marker) => marker.index);
  const cells = new Map<string, ProjectedMarker[]>();

  for (const marker of projected) {
    const cellX = Math.floor(marker.x / MAX_MARKER_WIDTH);
    const cellY = Math.floor(marker.iconCenterY / MAX_MARKER_HEIGHT);
    for (let x = cellX - 1; x <= cellX + 1; x += 1) {
      for (let y = cellY - 1; y <= cellY + 1; y += 1) {
        for (const candidate of cells.get(cellKey(x, y)) ?? []) {
          if (iconsOverlap(marker, candidate)) union(parents, marker.index, candidate.index);
        }
      }
    }
    const key = cellKey(cellX, cellY);
    const bucket = cells.get(key);
    if (bucket === undefined) cells.set(key, [marker]);
    else bucket.push(marker);
  }

  const groups = new Map<number, ProjectedMarker[]>();
  for (const marker of projected) {
    const root = findRoot(parents, marker.index);
    const group = groups.get(root);
    if (group === undefined) groups.set(root, [marker]);
    else group.push(marker);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const topmostPoint = Math.min(...group.map((marker) => marker.y));
    const bottommostPoint = Math.max(...group.map((marker) => marker.y));
    const stackAbove = topmostPoint >= viewport.height - bottommostPoint;
    const stableOrder = [...group].sort((left, right) => {
      const verticalOrder = stackAbove ? left.y - right.y : right.y - left.y;
      return verticalOrder || compareMarkers(left, right);
    });
    const targetCenters = stableOrder.map((marker, stackIndex) => {
      const targetIconCenterY = stackAbove
        ? topmostPoint + DEFAULT_ICON_Y_OFFSET - stackIndex * STACK_SPACING
        : bottommostPoint - DEFAULT_ICON_Y_OFFSET + stackIndex * STACK_SPACING;
      return targetIconCenterY;
    });
    stableOrder.forEach((marker, stackIndex) => {
      const targetCenterY = targetCenters[stackIndex]!;
      const iconEdge = stackAbove
        ? targetCenterY + marker.height / 2
        : targetCenterY - marker.height / 2;
      const connectorEdge =
        stackIndex === 0
          ? marker.y
          : stackAbove
            ? targetCenters[stackIndex - 1]! - stableOrder[stackIndex - 1]!.height / 2
            : targetCenters[stackIndex - 1]! + stableOrder[stackIndex - 1]!.height / 2;
      const connectorTop = Math.min(iconEdge, connectorEdge);
      const connectorBottom = Math.max(iconEdge, connectorEdge);
      const connectorHeight = Math.max(1, Math.ceil(connectorBottom - connectorTop));
      placements[marker.index] = {
        iconYOffset: targetCenterY - marker.y,
        postHeight: connectorHeight,
        postYOffset: (connectorTop + connectorBottom) / 2 - marker.y,
        postShadowAtTop: !stackAbove && stackIndex === 0,
        postHasShadow: stackIndex === 0,
      };
    });
  }

  return placements;
}

function defaultPlacement(): MarkerPlacement {
  return {
    iconYOffset: DEFAULT_ICON_Y_OFFSET,
    postHeight: SIGN_POST_CANVAS_HEIGHT,
    postYOffset: -SIGN_POST_CANVAS_HEIGHT / 2,
    postShadowAtTop: false,
    postHasShadow: true,
  };
}

interface ProjectedMarker {
  readonly index: number;
  readonly sign: TrafficSign;
  readonly x: number;
  readonly y: number;
  readonly iconCenterY: number;
  readonly width: number;
  readonly height: number;
}

function projectMarker(
  sign: TrafficSign,
  index: number,
  viewport: MarkerLayoutViewport,
): ProjectedMarker {
  const [longitude, latitude] = sign.coordinates;
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = viewport.bounds;
  const x = mercatorX(longitude);
  const y = mercatorY(latitude);
  const minX = mercatorX(minLongitude);
  const maxX = mercatorX(maxLongitude);
  const minY = mercatorY(minLatitude);
  const maxY = mercatorY(maxLatitude);
  const isFallback = resolveSignMarkerGraphic(sign.signCode).kind === FALLBACK_MARKER;
  const width = isFallback ? SIGN_PLATE_WIDTH : SIGN_ICON_SIZE;
  const height = isFallback ? SIGN_PLATE_HEIGHT : SIGN_ICON_SIZE;
  const screenX = ((x - minX) / (maxX - minX)) * viewport.width;
  const screenY = ((maxY - y) / (maxY - minY)) * viewport.height;

  return {
    index,
    sign,
    x: screenX,
    y: screenY,
    iconCenterY: screenY + DEFAULT_ICON_Y_OFFSET,
    width,
    height,
  };
}

function iconsOverlap(left: ProjectedMarker, right: ProjectedMarker): boolean {
  return (
    Math.abs(left.x - right.x) < (left.width + right.width) / 2 &&
    Math.abs(left.iconCenterY - right.iconCenterY) < (left.height + right.height) / 2
  );
}

function compareMarkers(left: ProjectedMarker, right: ProjectedMarker): number {
  return (
    compareText(left.sign.signCode, right.sign.signCode) ||
    compareText(left.sign.key, right.sign.key) ||
    left.index - right.index
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function findRoot(parents: number[], index: number): number {
  if (parents[index] !== index) parents[index] = findRoot(parents, parents[index]!);
  return parents[index]!;
}

function union(parents: number[], left: number, right: number): void {
  const leftRoot = findRoot(parents, left);
  const rightRoot = findRoot(parents, right);
  if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function mercatorX(longitude: number): number {
  return (longitude * Math.PI) / 180;
}

function mercatorY(latitude: number): number {
  const radians = (latitude * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}
