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

/** Style-context key the `${...}` placeholders below expand from. */
export const SIGN_GRAPHIC_CONTEXT_KEY = "getSignGraphic";

type MarkerStyle = SdkFeatureStyleRule["style"];

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
 * priority, so the official-icon rule comes last as the catch-all: a sign
 * without an official SVG takes the plate rule, everything else the icon.
 */
export const SIGN_MARKER_STYLE_RULES: readonly SdkFeatureStyleRule[] = [
  {
    predicate: (properties) => properties[MARKER_KIND_PROPERTY] === FALLBACK_MARKER,
    style: FALLBACK_PLATE_STYLE,
  },
  {
    predicate: (properties) => properties[MARKER_KIND_PROPERTY] === OFFICIAL_MARKER,
    style: OFFICIAL_ICON_STYLE,
  },
];

/**
 * Resolves each feature's graphic: the official SVG from the pinned jsDelivr
 * commit when the sign's code has one, the code plate when it does not. Both
 * styles ask the same key, so a marker never draws an unresolved URL.
 */
export const SIGN_MARKER_STYLE_CONTEXT: SdkFeatureStyleContext = {
  [SIGN_GRAPHIC_CONTEXT_KEY]: ({ feature }) => {
    const signCode = feature?.properties?.[SIGN_CODE_PROPERTY];
    if (typeof signCode !== "string") return undefined;
    return officialSignIconUrl(signCode) ?? fallbackPlateGraphic(signCode);
  },
};
