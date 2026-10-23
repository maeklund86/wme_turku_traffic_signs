import { describe, expect, it } from "vite-plus/test";

import { parseTrafficSignFeature } from "../src/data/traffic-sign";

// Shapes below mirror the live Trimble OGC API (collection GIS:Liikennemerkit,
// verified against the full ~36,281-feature registry): coordinates are
// [lon, lat, 0] triples, `Huomautus` is absent rather than null when there are
// no notes, and 16 registry rows carry neither `Varustelaji_koodi` nor
// `Varustelaji`.
describe("Traffic Sign parsing (GeoJSON feature → Traffic Sign)", () => {
  it("maps the Trimble properties onto a Traffic Sign verbatim", () => {
    const sign = parseTrafficSignFeature({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [22.27617187661397, 60.443853785959234, 0],
      },
      properties: {
        Id: "321020431",
        Varustelaji: "C38 Pysäköinti kielletty",
        Varustelaji_koodi: "C38",
        Huomautus: null,
      },
    });

    expect(sign).toEqual({
      key: "321020431",
      signCode: "C38",
      signName: "C38 Pysäköinti kielletty",
      notes: null,
      coordinates: [22.27617187661397, 60.443853785959234],
    });
  });

  it("treats an absent Huomautus as no notes", () => {
    const sign = parseTrafficSignFeature({
      type: "Feature",
      geometry: { type: "Point", coordinates: [22.223991014087638, 60.434167846403504, 0] },
      properties: {
        Id: "345919110",
        Varustelaji: "C38 Pysäköinti kielletty",
        Varustelaji_koodi: "C38",
      },
    });

    expect(sign?.notes).toBeNull();
  });

  it("keeps free-text notes verbatim", () => {
    const sign = parseTrafficSignFeature({
      type: "Feature",
      geometry: { type: "Point", coordinates: [22.1, 60.4, 0] },
      properties: {
        Id: "42",
        Varustelaji: "C38 Pysäköinti kielletty",
        Varustelaji_koodi: "C38",
        Huomautus: "Huoltoajo sallittu Servicekörning tillåten",
      },
    });

    expect(sign?.notes).toBe("Huoltoajo sallittu Servicekörning tillåten");
  });

  it("skips registry rows carrying neither sign code nor name", () => {
    const sign = parseTrafficSignFeature({
      type: "Feature",
      geometry: { type: "Point", coordinates: [22.272953831215432, 60.455341148458274, 0] },
      properties: { Id: "0" },
    });

    expect(sign).toBeNull();
  });

  it("skips features whose geometry is not a point", () => {
    const sign = parseTrafficSignFeature({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [22.1, 60.4] },
      properties: { Id: "7", Varustelaji_koodi: "C38", Varustelaji: "C38 Pysäköinti kielletty" },
    });

    expect(sign).toBeNull();
  });
});
