/**
 * The two graphics the Visual Overlay owns itself: the neutral post every
 * marker stands on, and the bordered plate a sign renders when the pinned
 * collection has no SVG for its code (spec §4.4; AC-10, AC-11).
 *
 * Both are SVG data URIs because the SDK `FeatureStyle` vocabulary is the OL2
 * one — `externalGraphic` / `backgroundGraphic` take an image and OL2 draws it
 * raw, with no filter, so anything the marker needs beyond a bare rectangle
 * (the post's subtle drop shadow, the plate's code and sublabel) has to be
 * baked into the asset.
 */

/** Fixed icon size in CSS pixels: legible at typical editor zooms (spec §4.4). */
export const SIGN_ICON_SIZE = 22;

/** The thin neutral post: ~2 px, grey (spec §4.4). */
export const SIGN_POST_WIDTH = 2;
export const SIGN_POST_HEIGHT = 10;
export const SIGN_POST_COLOR = "#8a949e";

/** Canvas around the post, leaving room for the drop shadow to bleed. */
export const SIGN_POST_CANVAS_WIDTH = 10;
export const SIGN_POST_CANVAS_HEIGHT = 12;
export const SIGN_POST_SHADOW_COLOR = "#000000";
export const SIGN_POST_SHADOW_OPACITY = 0.45;

/**
 * Fallback plate geometry: light fill, dark 1.5 px border, rounded corners,
 * the sign code and a tiny "no icon" sublabel (spec §4.4).
 */
export const SIGN_PLATE_WIDTH = 32;
export const SIGN_PLATE_HEIGHT = 22;
export const SIGN_PLATE_FILL_COLOR = "#fdfdf8";
export const SIGN_PLATE_BORDER_COLOR = "#1c1f24";
export const SIGN_PLATE_BORDER_WIDTH = 1.5;
export const SIGN_PLATE_RADIUS = 3;
export const SIGN_PLATE_TEXT_COLOR = "#1c1f24";
export const SIGN_PLATE_SUBLABEL_COLOR = "#555555";
export const SIGN_PLATE_SUBLABEL = "no icon";
export const SIGN_PLATE_SUBLABEL_FONT_SIZE = 5.5;
export const SIGN_PLATE_CODE_FONT_SIZE = 9;
export const SIGN_PLATE_CODE_FONT_SIZE_MIN = 5.5;
/** Width of an average code glyph in em, for shrinking the code to fit the plate. */
export const SIGN_PLATE_CODE_GLYPH_RATIO = 0.62;
export const SIGN_PLATE_FONT_FAMILY = "Arial, Helvetica, sans-serif";

/** What the code may occupy before it reaches the border. */
export const SIGN_PLATE_INNER_WIDTH =
  SIGN_PLATE_WIDTH - 2 * SIGN_PLATE_BORDER_WIDTH;

/** The post every marker stands on, with its subtle drop shadow baked in. */
export const SIGN_POST_GRAPHIC: string = svgDataUri(postSvg());

/**
 * The bordered plate a sign with no official SVG renders on the same post:
 * the sign code plus a tiny "no icon" sublabel, so the sign stays locatable
 * and identifiable without inventing a substitute icon (AC-11).
 */
export function fallbackPlateGraphic(signCode: string): string {
  return svgDataUri(plateSvg(signCode));
}

function postSvg(): string {
  // The shadow ellipse is drawn first so the post overlays it at the foot.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIGN_POST_CANVAS_WIDTH}" ` +
    `height="${SIGN_POST_CANVAS_HEIGHT}" viewBox="0 0 ${SIGN_POST_CANVAS_WIDTH} ` +
    `${SIGN_POST_CANVAS_HEIGHT}">` +
    `<defs><radialGradient id="turku-sign-post-shadow" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%" stop-color="${SIGN_POST_SHADOW_COLOR}" ` +
    `stop-opacity="${SIGN_POST_SHADOW_OPACITY}"/>` +
    `<stop offset="100%" stop-color="${SIGN_POST_SHADOW_COLOR}" stop-opacity="0"/>` +
    `</radialGradient></defs>` +
    `<ellipse cx="5" cy="10.6" rx="4.6" ry="1.8" fill="url(#turku-sign-post-shadow)"/>` +
    `<rect x="4" y="0" width="${SIGN_POST_WIDTH}" height="${SIGN_POST_HEIGHT}" rx="1" ` +
    `fill="${SIGN_POST_COLOR}"/>` +
    `</svg>`
  );
}

function plateSvg(signCode: string): string {
  // The border rides inside the canvas: nudge by half the stroke so the outer
  // edge lands exactly on the plate's bounds and nothing is clipped.
  const inset = SIGN_PLATE_BORDER_WIDTH / 2;
  const centerX = SIGN_PLATE_WIDTH / 2;
  const code = plateCodeStyle(signCode);
  // textLength only appears once the smallest readable size would still
  // overshoot, so ordinary codes render completely undistorted.
  const forcedWidth =
    code.textLength === undefined ? "" : `textLength="${code.textLength}" lengthAdjust="spacingAndGlyphs" `;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIGN_PLATE_WIDTH}" ` +
    `height="${SIGN_PLATE_HEIGHT}" viewBox="0 0 ${SIGN_PLATE_WIDTH} ${SIGN_PLATE_HEIGHT}">` +
    `<rect x="${inset}" y="${inset}" width="${SIGN_PLATE_WIDTH - SIGN_PLATE_BORDER_WIDTH}" ` +
    `height="${SIGN_PLATE_HEIGHT - SIGN_PLATE_BORDER_WIDTH}" rx="${SIGN_PLATE_RADIUS}" ` +
    `fill="${SIGN_PLATE_FILL_COLOR}" stroke="${SIGN_PLATE_BORDER_COLOR}" ` +
    `stroke-width="${SIGN_PLATE_BORDER_WIDTH}"/>` +
    `<text x="${centerX}" y="12.5" text-anchor="middle" ` +
    `font-family="${SIGN_PLATE_FONT_FAMILY}" font-size="${code.fontSize}" ${forcedWidth}` +
    `font-weight="bold" fill="${SIGN_PLATE_TEXT_COLOR}">${escapeXml(signCode)}</text>` +
    `<text x="${centerX}" y="19" text-anchor="middle" ` +
    `font-family="${SIGN_PLATE_FONT_FAMILY}" font-size="${SIGN_PLATE_SUBLABEL_FONT_SIZE}" ` +
    `fill="${SIGN_PLATE_SUBLABEL_COLOR}">${SIGN_PLATE_SUBLABEL}</text>` +
    `</svg>`
  );
}

/**
 * Keeps the code legible and inside the plate: shrink the type as the code
 * grows, and force the rendered width once even the smallest size would
 * overshoot. The sign has to stay identifiable, so no code may run past the
 * border (AC-11).
 */
function plateCodeStyle(signCode: string): { fontSize: number; textLength?: number } {
  const innerWidth = SIGN_PLATE_INNER_WIDTH;
  const atSmallest = Math.max(signCode.length, 1) * SIGN_PLATE_CODE_FONT_SIZE_MIN * SIGN_PLATE_CODE_GLYPH_RATIO;
  if (atSmallest > innerWidth) return { fontSize: SIGN_PLATE_CODE_FONT_SIZE_MIN, textLength: innerWidth };

  const fitted = innerWidth / (Math.max(signCode.length, 1) * SIGN_PLATE_CODE_GLYPH_RATIO);
  const fontSize = Math.min(SIGN_PLATE_CODE_FONT_SIZE, Math.max(SIGN_PLATE_CODE_FONT_SIZE_MIN, fitted));
  return { fontSize: Math.round(fontSize * 10) / 10 };
}

/** Registry text goes straight into markup; keep `&`, `<`, `>` and quotes inert. */
function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]!);
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
