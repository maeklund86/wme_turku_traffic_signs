#!/usr/bin/env node
/**
 * Regenerates `src/visual-overlay/sign-icon-catalogue.generated.ts` from the
 * Väylävirasto sign-SVG collection at the commit SHA pinned in
 * `src/constants.ts` (AC-14).
 *
 * The catalogue is what decides, offline and without a network probe, whether a
 * sign code has an official SVG — so a missing asset falls back to the bordered
 * code plate deterministically instead of flickering in, and no sign is hidden
 * (AC-11).
 *
 * Run it after moving the pin: `node scripts/refresh-sign-icon-catalogue.mjs`.
 */
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONSTANTS_PATH = join(ROOT, "src/constants.ts");
const OUTPUT_PATH = join(ROOT, "src/visual-overlay/sign-icon-catalogue.generated.ts");
const REPOSITORY = "finnishtransportagency/liikennemerkit";
const JSDELIVR_LISTING = `https://data.jsdelivr.com/v1/packages/gh/${REPOSITORY}@`;
const NEW_SIGNS_DIR = "collections/new_signs/svg";
const OLD_SIGNS_DIR = "collections/old_signs/svg";

const commit = await readPinnedCommit(CONSTANTS_PATH);
const listing = await fetchJson(`${JSDELIVR_LISTING}${commit}`);
const assets = collectAssetCodes(listing);

if (assets.new.length === 0 || assets.old.length === 0) {
  throw new Error(
    `No SVGs found under new_signs/svg (${assets.new.length}) or ` +
      `old_signs/svg (${assets.old.length}) at ${commit} — collection layout changed?`,
  );
}

await writeFile(OUTPUT_PATH, renderModule(assets), "utf8");
console.log(
  `Wrote ${assets.new.length} new-sign and ${assets.old.length} old-sign codes ` +
    `from ${REPOSITORY}@${commit} to ${OUTPUT_PATH}`,
);

/** The pin lives in `src/constants.ts`; fail loudly if it ever moves without this script noticing. */
async function readPinnedCommit(path) {
  const source = await readFile(path, "utf8");
  const match = /SIGN_ICON_ASSET_COMMIT\s*=\s*"([0-9a-f]{40})"/.exec(source);
  if (!match) {
    throw new Error(`Could not read SIGN_ICON_ASSET_COMMIT from ${path} — update this script.`);
  }
  return match[1];
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "user-agent": "wme-turku-traffic-signs" } });
  if (!response.ok) {
    throw new Error(`jsDelivr listing failed for ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

/** Collects the sign codes of both SVG directories, sorted and de-duplicated. */
function collectAssetCodes(listing) {
  const buckets = new Map([
    [NEW_SIGNS_DIR, []],
    [OLD_SIGNS_DIR, []],
  ]);
  for (const file of walkEntries(listing.files ?? [])) {
    const bucket = buckets.get(file.directory);
    if (bucket === undefined) continue;
    bucket.push(file.name.slice(0, -".svg".length));
  }
  return {
    commit,
    new: sortedUnique(buckets.get(NEW_SIGNS_DIR)),
    old: sortedUnique(buckets.get(OLD_SIGNS_DIR)),
  };
}

function walkEntries(entries, prefix = "") {
  const files = [];
  for (const entry of entries ?? []) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.type === "directory") {
      files.push(...walkEntries(entry.files, path));
    } else {
      files.push({ directory: dirname(path), name: basename(path) });
    }
  }
  return files;
}

/** Plain order keeps regenerated diffs minimal and predictable. */
function sortedUnique(codes) {
  return [...new Set(codes)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function renderModule({ new: newCodes, old: oldCodes, commit }) {
  return `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with \`node scripts/refresh-sign-icon-catalogue.mjs\`.
 *
 * Sign codes that have an official CC0 SVG in the Väylävirasto collection
 * ${REPOSITORY}, frozen at the commit SHA below (AC-14). The Visual Overlay
 * resolves each sign's icon against this list, so the missing-asset fallback is
 * decided before a marker is styled and never depends on a network probe
 * (AC-11).
 */

/** The commit this catalogue was frozen at; must match \`SIGN_ICON_ASSET_COMMIT\` (AC-14). */
export const CATALOGUE_COMMIT = "${commit}";

/** Post-2020 signs: \`collections/new_signs/svg\` (${newCodes.length} codes). */
export const NEW_SIGN_ICON_CODES = \`
${newCodes.join("\n")}
\`;

/** Pre-2020 signs: \`collections/old_signs/svg\` (${oldCodes.length} codes). */
export const OLD_SIGN_ICON_CODES = \`
${oldCodes.join("\n")}
\`;
`;
}
