import { describe, expect, it, vi } from "vitest";

import {
  createHttpPageFetcher,
  createUserscriptPageBodyFetcher,
  fetchWholeTurkuDataset,
  type OgcApiPage,
} from "../src/data/turku-sign-ingestion";

const ITEMS_URL =
  "https://opaskartta.turku.fi/trimbleogcapi/collections/GIS:Liikennemerkit/items";

/** Spec ground truth: whole City of Turku extent, WGS84 [minLon,minLat,maxLon,maxLat]. */
const TURKU_BBOX = "22.09,60.35,22.39,60.61";

interface FakePage {
  readonly offset: string;
  readonly features: readonly unknown[];
  readonly timeStamp: string;
  /** Offset of the `rel="next"` target, or undefined for the last page. */
  readonly nextOffset?: string;
  /** Absolute `rel="next"` target; overrides `nextOffset` (for malformed links). */
  readonly nextUrl?: string;
}

function itemsUrl(offset: string): string {
  const url = new URL(ITEMS_URL);
  url.searchParams.set("f", "application/geo+json");
  url.searchParams.set("bbox", TURKU_BBOX);
  url.searchParams.set("limit", "10000");
  url.searchParams.set("offset", offset);
  return url.toString();
}

/** Routes requests by query parameter, the way the API itself addresses pages. */
function createPageFetcher(script: { pages: readonly FakePage[]; failOffsets?: readonly string[] }) {
  const requested: string[] = [];
  const fetchPage = vi.fn(async (url: string): Promise<OgcApiPage> => {
    requested.push(url);
    const offset = new URL(url).searchParams.get("offset") ?? "";
    if (script.failOffsets?.includes(offset)) throw new Error(`network down (offset ${offset})`);
    const page = script.pages.find((candidate) => candidate.offset === offset);
    if (!page) throw new Error(`unexpected page request: offset=${offset}`);
    return {
      timeStamp: page.timeStamp,
      features: page.features,
      nextUrl: page.nextUrl ?? (page.nextOffset === undefined ? null : itemsUrl(page.nextOffset)),
    };
  });
  return { fetchPage, requested };
}

function feature(id: string): unknown {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [22.223991014087638, 60.434167846403504, 0] },
    properties: { Id: id, Varustelaji_koodi: "C38", Varustelaji: "C38 Pysäköinti kielletty" },
  };
}

const pageOf = (offset: string, count: number, timeStamp: string, nextOffset?: string): FakePage => ({
  offset,
  features: Array.from({ length: count }, (_, index) => feature(`${offset}-${index}`)),
  timeStamp,
  nextOffset,
});

describe("Whole-Turku ingestion (Trimble OGC API)", () => {
  it('pages the whole registry with rel="next" links until exhausted', async () => {
    const { fetchPage, requested } = createPageFetcher({
      pages: [
        pageOf("0", 10000, "2026-10-11T19:50:25.6808150Z", "10000"),
        pageOf("10000", 10000, "2026-10-11T19:54:40.2699285Z", "20000"),
        pageOf("20000", 10000, "2026-10-11T19:54:41.3191529Z", "30000"),
        pageOf("30000", 6281, "2026-10-11T19:50:50.0086626Z"),
      ],
    });

    const record = await fetchWholeTurkuDataset({ fetchPage, now: () => 1_764_000_000_000 });

    expect(record.signs).toHaveLength(36281);
    expect(record.storedAt).toBe(1_764_000_000_000);
    expect(requested).toHaveLength(4);
    expect(requested.map((url) => new URL(url).searchParams.get("offset"))).toEqual([
      "0",
      "10000",
      "20000",
      "30000",
    ]);
  });

  it("asks for the whole City of Turku extent at the API's maximum page size", async () => {
    const { fetchPage, requested } = createPageFetcher({
      pages: [pageOf("0", 10, "2026-10-11T19:50:25.6808150Z")],
    });

    await fetchWholeTurkuDataset({ fetchPage });

    expect(requested).toHaveLength(1);
    const first = new URL(requested[0]!);
    expect(first.origin + first.pathname).toBe(ITEMS_URL);
    expect(first.searchParams.get("f")).toBe("application/geo+json");
    expect(first.searchParams.get("bbox")).toBe(TURKU_BBOX);
    expect(first.searchParams.get("limit")).toBe("10000");
  });

  it("keys the dataset by the first page's response timeStamp", async () => {
    const { fetchPage } = createPageFetcher({
      pages: [
        pageOf("0", 1, "2026-10-11T19:50:25.6808150Z", "10000"),
        pageOf("10000", 1, "2026-10-11T19:54:40.2699285Z"),
      ],
    });

    const record = await fetchWholeTurkuDataset({ fetchPage });

    expect(record.timeStamp).toBe("2026-10-11T19:50:25.6808150Z");
    expect(record.signs.map((sign) => sign.key)).toEqual(["0-0", "10000-0"]);
  });

  it("discards the partial dataset when a page fails mid-pagination", async () => {
    const { fetchPage } = createPageFetcher({
      pages: [
        pageOf("0", 10000, "2026-10-11T19:50:25.6808150Z", "10000"),
        pageOf("10000", 5000, "2026-10-11T19:50:25.6808150Z", "20000"),
        pageOf("20000", 10000, "2026-10-11T19:50:25.6808150Z"),
      ],
      failOffsets: ["20000"],
    });

    await expect(fetchWholeTurkuDataset({ fetchPage })).rejects.toThrow(/network down/);
  });

  it('refuses to loop when rel="next" revisits an already fetched page', async () => {
    const { fetchPage } = createPageFetcher({
      pages: [{ offset: "0", features: [feature("1")], timeStamp: "2026-10-11T19:50:25.6808150Z", nextOffset: "0" }],
    });

    await expect(fetchWholeTurkuDataset({ fetchPage })).rejects.toThrow(/pagination loop/);
  });

  it('refuses to loop when rel="next" does not advance the offset', async () => {
    // A different URL carrying a non-advancing offset: the revisit guard cannot
    // catch this one; only the ascending-offset guard can.
    const staleNextUrl = `${ITEMS_URL}?limit=10000&offset=0&f=application/geo%2Bjson&bbox=${TURKU_BBOX}`;
    const { fetchPage } = createPageFetcher({
      pages: [
        {
          offset: "0",
          features: [feature("1")],
          timeStamp: "2026-10-11T19:50:25.6808150Z",
          nextUrl: staleNextUrl,
        },
      ],
    });

    await expect(fetchWholeTurkuDataset({ fetchPage })).rejects.toThrow(/pagination does not advance/);
  });

  it("drops registry rows with no sign code or name, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetchPage } = createPageFetcher({
      pages: [
        {
          offset: "0",
          timeStamp: "2026-10-11T19:50:25.6808150Z",
          features: [feature("1"), { type: "Feature", geometry: { type: "Point", coordinates: [22.2, 60.4, 0] }, properties: { Id: "0" } }],
        },
      ],
    });

    const record = await fetchWholeTurkuDataset({ fetchPage });

    expect(record.signs.map((sign) => sign.key)).toEqual(["1"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Dropped 1 registry row"));
    warn.mockRestore();
  });
});

describe("userscript transport (GM.xmlHttpRequest)", () => {
  it("requests pages through GM.xmlHttpRequest when the grant is present", async () => {
    const xmlHttpRequest = vi.fn(
      (details: { url: string; onload: (response: { responseText: string }) => void }) => {
        details.onload({
          responseText: JSON.stringify({
            type: "FeatureCollection",
            timeStamp: "2026-10-11T19:50:25.6808150Z",
            features: [],
          }),
        });
      },
    );
    vi.stubGlobal("GM", { xmlHttpRequest });

    const page = await createHttpPageFetcher(createUserscriptPageBodyFetcher())(
      "https://opaskartta.turku.fi/trimbleogcapi/collections/GIS:Liikennemerkit/items",
    );

    expect(xmlHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: "https://opaskartta.turku.fi/trimbleogcapi/collections/GIS:Liikennemerkit/items",
      }),
    );
    expect(page.timeStamp).toBe("2026-10-11T19:50:25.6808150Z");
    vi.unstubAllGlobals();
  });

  it("rejects the page when the GM request fails", async () => {
    const xmlHttpRequest = vi.fn((details: { onerror: () => void }) => {
      details.onerror();
    });
    vi.stubGlobal("GM", { xmlHttpRequest });

    await expect(
      createHttpPageFetcher(createUserscriptPageBodyFetcher())("https://opaskartta.turku.fi/items"),
    ).rejects.toThrow(/page request failed/);
    vi.unstubAllGlobals();
  });
});
