import type { SdkFeatureStyleContext, SdkFeatureStyleRule } from "wme-sdk-typings";

import {
  fallbackPlateGraphic,
  SIGN_ICON_SIZE,
  SIGN_PLATE_HEIGHT,
  SIGN_PLATE_WIDTH,
  SIGN_POST_CANVAS_HEIGHT,
  SIGN_POST_CANVAS_WIDTH,
  SIGN_POST_GRAPHIC,
} from "./marker-graphics";
import { officialSignIconUrl } from "./sign-icon";

/** Feature property the rules resolve each sign's graphic from. */
export const SIGN_CODE_PROPERTY = "signCode";

/** Feature property recording whether the official SVG resolved (AC-11). */
export const MARKER_KIND_PROPERTY = "markerKind";
export const OFFICIAL_MARKER = "official";
export const FALLBACK_MARKER = "fallback";
export type MarkerKind = typeof OFFICIAL_MARKER | typeof FALLBACK_MARKER;

/** Style-context key the `${...}` placeholder below expands from. */
export const SIGN_GRAPHIC_CONTEXT_KEY = "getSignGraphic";

type MarkerStyle = SdkFeatureStyleRule["style"];

/**
 * What a marker draws for one sign code, and which rule that predetermines:
 * the official SVG from the pinned jsDelivr commit, or the bordered code plate
 * when the code has none. This is the single place the decision is made, so the
 * feature property the style rules switch on and the graphic the styles draw
 * can never disagree.
 */
export interface SignMarkerGraphic {
  readonly kind: MarkerKind;
  readonly graphic: string;
}

export function resolveSignMarkerGraphic(signCode: string): SignMarkerGraphic {
  const url = officialSignIconUrl(signCode);
  return url === null
    ? { kind: FALLBACK_MARKER, graphic: fallbackPlateGraphic(signCode) }
    : { kind: OFFICIAL_MARKER, graphic: url };
}

/**
 * What every marker shares: the neutral post behind the sign, and a pointer
 * cursor because markers are the Sign Panel's entry point into a sign (AC-10).
 *
 * `graphicOpacity: 1` is deliberate — OL2 falls back to `fillOpacity` and then
 * carries the previous feature's alpha forward when neither is set, so one
 * translucent marker would bleed onto its neighbours.
 */
const MARKER_BASE: MarkerStyle = {
  backgroundGraphic: SIGN_POST_GRAPHIC,
  backgroundWidth: SIGN_POST_CANVAS_WIDTH,
  backgroundHeight: SIGN_POST_CANVAS_HEIGHT,
  backgroundXOffset: -SIGN_POST_CANVAS_WIDTH / 2,
  backgroundYOffset: -SIGN_POST_CANVAS_HEIGHT / 2,
  graphicOpacity: 1,
  cursor: "pointer",
};

/**
 * The official sign SVG, bare: Finnish signs carry their own shape and colour,
 * so there is no plate, no background and no Sign Category colour (AC-10).
 */
const OFFICIAL_ICON_STYLE: MarkerStyle = {
  ...MARKER_BASE,
  externalGraphic: `\${${SIGN_GRAPHIC_CONTEXT_KEY}}`,
  graphicWidth: SIGN_ICON_SIZE,
  graphicHeight: SIGN_ICON_SIZE,
  // OL2 centres a graphic on the sign's point; lift it by the post's height so
  // the icon rests on top of the post instead of straddling it.
  graphicYOffset: -(SIGN_POST_CANVAS_HEIGHT + SIGN_ICON_SIZE / 2),
};

/** Missing asset: the code plate, on the same post. */
const FALLBACK_PLATE_STYLE: MarkerStyle = {
  ...MARKER_BASE,
  externalGraphic: `\${${SIGN_GRAPHIC_CONTEXT_KEY}}`,
  graphicWidth: SIGN_PLATE_WIDTH,
  graphicHeight: SIGN_PLATE_HEIGHT,
  graphicYOffset: -(SIGN_POST_CANVAS_HEIGHT + SIGN_PLATE_HEIGHT / 2),
};

/**
 * One SDK marker layer's style rules. The SDK applies later rules with higher
 * priority, so the catch-all comes last and carries no predicate: a sign whose
 * code has no official SVG takes the plate rule, and everything else — however
 * it reaches the layer — still draws as a bare icon on the post rather than
 * falling back to the SDK's default styling.
 */
export const SIGN_MARKER_STYLE_RULES: readonly SdkFeatureStyleRule[] = [
  {
    predicate: (properties) => properties[MARKER_KIND_PROPERTY] === FALLBACK_MARKER,
    style: FALLBACK_PLATE_STYLE,
  },
  {
    style: OFFICIAL_ICON_STYLE,
  },
];

/**
 * Resolves each feature's graphic from its sign code. Both rules ask the same
 * key, so a marker never draws an unresolved URL — and a code with no official
 * SVG gets the plate whichever rule it lands in.
 */
export const SIGN_MARKER_STYLE_CONTEXT: SdkFeatureStyleContext = {
  [SIGN_GRAPHIC_CONTEXT_KEY]: ({ feature }) => {
    const signCode = feature?.properties?.[SIGN_CODE_PROPERTY];
    if (typeof signCode !== "string") return undefined;
    return resolveSignMarkerGraphic(signCode).graphic;
  },
};
