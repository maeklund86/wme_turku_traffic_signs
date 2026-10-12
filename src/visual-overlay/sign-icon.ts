import { NEW_SIGN_SVG_PATH, OLD_SIGN_SVG_PATH, SIGN_ICON_ASSET_BASE_URL } from "../constants";
import { NEW_SIGN_ICON_CODES, OLD_SIGN_ICON_CODES } from "./sign-icon-catalogue.generated";

/** Sign codes whose official SVG lives in `collections/new_signs/svg`. */
const NEW_SIGN_ICONS: ReadonlySet<string> = toCodeSet(NEW_SIGN_ICON_CODES);

/** Sign codes whose official SVG lives in `collections/old_signs/svg`. */
const OLD_SIGN_ICONS: ReadonlySet<string> = toCodeSet(OLD_SIGN_ICON_CODES);

/**
 * The jsDelivr URL of a sign code's official CC0 SVG, or null when the pinned
 * collection holds no SVG for that code — which is what sends the marker to the
 * bordered fallback plate instead (AC-11).
 *
 * Resolution is a lookup against the catalogue frozen at the pinned commit
 * SHA, not a guess from the code's shape and not a network probe: the decision
 * is made before the marker is styled, so a missing asset never flickers in,
 * no substitute icon is invented and no sign is hidden. A code that survives
 * the lookup also cannot inject anything into the URL, since only codes the
 * upstream repository actually publishes get that far.
 */
export function officialSignIconUrl(signCode: string): string | null {
  const code = signCode.trim();
  if (NEW_SIGN_ICONS.has(code)) {
    return `${SIGN_ICON_ASSET_BASE_URL}/${NEW_SIGN_SVG_PATH}/${code}.svg`;
  }
  if (OLD_SIGN_ICONS.has(code)) {
    return `${SIGN_ICON_ASSET_BASE_URL}/${OLD_SIGN_SVG_PATH}/${code}.svg`;
  }
  return null;
}

function toCodeSet(codes: string): ReadonlySet<string> {
  return new Set(codes.split(/\s+/).filter((code) => code.length > 0));
}
