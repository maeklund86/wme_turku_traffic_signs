import { PAGE_SIZE_LIMIT, TRIMBLE_ITEMS_ENDPOINT, TURKU_EXTENT } from "../constants";
import { isPlainObject } from "../json";
import type { SignDatasetRecord } from "./sign-dataset-record";
import { parseTrafficSignFeature, type TrafficSign } from "./traffic-sign";

const LOG_PREFIX = "[turku-signs]";

/** One page of the OGC API items response, as the pagination loop consumes it. */
export interface OgcApiPage {
  /** Timestamp the server stamped the page with. */
  readonly timeStamp: string;
  /** Raw GeoJSON features as served. */
  readonly features: readonly unknown[];
  /** Absolute URL of the next page per `rel="next"`, or null when exhausted. */
  readonly nextUrl: string | null;
}

/** Fetches and parses one OGC API items page. */
export type PageFetcher = (url: string) => Promise<OgcApiPage>;

/**
 * Fetches one page's raw JSON body text — the transport seam. The Trimble
 * OGC API answers from a different origin and sends no CORS headers, so the
 * userscript reaches it through Tampermonkey's `GM.xmlHttpRequest` (with
 * `@connect` for both the endpoint host and its redirect target); plain
 * fetch is the fallback for non-userscript contexts.
 */
export type PageBodyFetcher = (url: string) => Promise<string>;

export interface IngestionOptions {
  /** Seam for tests; defaults to the userscript's HTTP transport. */
  readonly fetchPage?: PageFetcher;
  /** Clock seam for the record's cache-write time; defaults to `Date.now`. */
  readonly now?: () => number;
}

/**
 * Fetches the complete City of Turku sign registry through the Trimble OGC
 * API: whole-extent bbox, `limit=10000` (the API maximum), `offset`
 * pagination following each page's `rel="next"` link until exhausted
 * (~36,281 features in ~4 pages). Resolves only with a fully fetched dataset
 * — if any page fails, the promise rejects and the partial dataset is
 * discarded, so only a complete dataset ever reaches the Client Cache
 * (spec §4.2/§4.3, AC-1, AC-3).
 */
export async function fetchWholeTurkuDataset(
  options: IngestionOptions = {},
): Promise<SignDatasetRecord> {
  const fetchPage = options.fetchPage ?? createHttpPageFetcher(createUserscriptPageBodyFetcher());
  const now = options.now ?? Date.now;

  const signs: TrafficSign[] = [];
  const fetchedUrls = new Set<string>();
  let timeStamp: string | null = null;
  let skippedFeatures = 0;
  let previousOffset = Number.NEGATIVE_INFINITY;
  let nextUrl: string | null = buildFirstPageUrl();

  while (nextUrl !== null) {
    guardAgainstPaginationLoop(nextUrl, fetchedUrls);
    const offset = readOffset(nextUrl);
    if (offset !== null) {
      if (offset <= previousOffset) {
        throw new Error(`Trimble OGC API pagination does not advance at ${nextUrl}`);
      }
      previousOffset = offset;
    }

    const page = await fetchPage(nextUrl);
    // Each page carries its own response timestamp; the dataset is keyed by
    // the first page's, so the whole fetch names one dataset version.
    timeStamp ??= page.timeStamp;
    for (const feature of page.features) {
      const sign = parseTrafficSignFeature(feature);
      if (sign === null) {
        skippedFeatures += 1;
        continue;
      }
      signs.push(sign);
    }
    nextUrl = page.nextUrl;
  }

  if (timeStamp === null) {
    throw new Error("Trimble OGC API returned no pages for the Turku extent");
  }
  if (skippedFeatures > 0) {
    // Registry rows that carry no sign code and no name are not Traffic
    // Signs; they are dropped, but never silently.
    console.warn(
      `${LOG_PREFIX} Dropped ${skippedFeatures} registry row(s) with no sign code or name.`,
    );
  }
  return { timeStamp, storedAt: now(), signs };
}

/** Whole-extent items URL for the first page. */
export function buildFirstPageUrl(): string {
  const url = new URL(TRIMBLE_ITEMS_ENDPOINT);
  url.searchParams.set("f", "application/geo+json");
  url.searchParams.set("bbox", TURKU_EXTENT.join(","));
  url.searchParams.set("limit", String(PAGE_SIZE_LIMIT));
  url.searchParams.set("offset", "0");
  return url.toString();
}

/** HTTP `PageFetcher` over a body transport: transport errors and non-JSON bodies fail the page. */
export function createHttpPageFetcher(fetchBody: PageBodyFetcher): PageFetcher {
  return async (url: string): Promise<OgcApiPage> => {
    return parseOgcApiPage(JSON.parse(await fetchBody(url)) as unknown);
  };
}

/**
 * The userscript's transport: Tampermonkey's `GM.xmlHttpRequest` when the
 * grants are in place (the API is cross-origin with no CORS headers), plain
 * fetch otherwise.
 */
export function createUserscriptPageBodyFetcher(): PageBodyFetcher {
  const gm = globalThis.GM;
  if (gm && typeof gm.xmlHttpRequest === "function") {
    return gmPageBodyFetcher(gm.xmlHttpRequest.bind(gm));
  }
  console.warn(`${LOG_PREFIX} GM.xmlHttpRequest unavailable — falling back to plain fetch.`);
  return fetchPageBody;
}

function gmPageBodyFetcher(
  xmlHttpRequest: NonNullable<typeof globalThis.GM.xmlHttpRequest>,
): PageBodyFetcher {
  return (url: string) =>
    new Promise<string>((resolve, reject) => {
      xmlHttpRequest({
        method: "GET",
        url,
        onload: (response) => resolve(response.responseText),
        onerror: () => reject(new Error(`Trimble OGC API page request failed for ${url}`)),
        ontimeout: () => reject(new Error(`Trimble OGC API page request timed out for ${url}`)),
      });
    });
}

const fetchPageBody: PageBodyFetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Trimble OGC API page request failed: HTTP ${response.status} (${url})`);
  }
  return response.text();
};

function parseOgcApiPage(body: unknown): OgcApiPage {
  if (!isPlainObject(body) || !Array.isArray(body.features)) {
    throw new Error("Trimble OGC API page is not a FeatureCollection");
  }
  const timeStamp = body.timeStamp;
  if (typeof timeStamp !== "string") {
    throw new Error("Trimble OGC API page carries no dataset timeStamp");
  }
  return {
    timeStamp,
    features: body.features as readonly unknown[],
    nextUrl: findNextLinkUrl(body.links),
  };
}

function findNextLinkUrl(links: unknown): string | null {
  if (!Array.isArray(links)) return null;
  const next = links.find((link) => isPlainObject(link) && link.rel === "next");
  if (!isPlainObject(next) || typeof next.href !== "string") return null;
  return next.href;
}

/**
 * Guards the pagination loop against servers whose `rel="next"` links cycle:
 * a URL may never be fetched twice, so a misbehaving link chain fails the
 * fetch instead of hanging the page. Offsets are checked by the caller.
 */
function guardAgainstPaginationLoop(url: string, fetchedUrls: Set<string>): void {
  if (fetchedUrls.has(url)) {
    throw new Error(`Trimble OGC API pagination loop at ${url}`);
  }
  fetchedUrls.add(url);
}

function readOffset(url: string): number | null {
  const raw = new URL(url).searchParams.get("offset");
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const offset = Number(raw);
  return Number.isSafeInteger(offset) ? offset : null;
}
