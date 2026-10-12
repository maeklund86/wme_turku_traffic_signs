import { describe, expect, it } from "vitest";

import {
  NEW_SIGN_SVG_PATH,
  OLD_SIGN_SVG_PATH,
  SIGN_ICON_ASSET_BASE_URL,
  SIGN_ICON_ASSET_COMMIT,
} from "../src/constants";
import { CATALOGUE_COMMIT, NEW_SIGN_ICON_CODES, OLD_SIGN_ICON_CODES } from "../src/visual-overlay/sign-icon-catalogue.generated";
import { officialSignIconUrl } from "../src/visual-overlay/sign-icon";

const codes = (listing: string): readonly string[] => listing.split(/\s+/).filter((c) => c.length > 0);

describe("official sign icon resolution (AC-14)", () => {
  it("pins every asset URL to the frozen commit SHA", () => {
    expect(SIGN_ICON_ASSET_COMMIT).toBe("35be7a6593e70c8ed5f4e3ef54372d69a3fef558");
    // Moving the pin without regenerating the catalogue would silently resolve
    // icons from a commit the overlay no longer claims.
    expect(CATALOGUE_COMMIT).toBe(SIGN_ICON_ASSET_COMMIT);

    for (const code of ["C38", "C32_5", "331", "A1.1", "344-2"]) {
      expect(officialSignIconUrl(code)).toContain(`/liikennemerkit@${SIGN_ICON_ASSET_COMMIT}/`);
    }
  });

  it("serves icons from the jsDelivr collections of the pinned repository", () => {
    expect(SIGN_ICON_ASSET_BASE_URL).toBe(
      `https://cdn.jsdelivr.net/gh/finnishtransportagency/liikennemerkit@${SIGN_ICON_ASSET_COMMIT}/collections`,
    );
    expect(officialSignIconUrl("C38")).toBe(
      `${SIGN_ICON_ASSET_BASE_URL}/${NEW_SIGN_SVG_PATH}/C38.svg`,
    );
    expect(officialSignIconUrl("331")).toBe(
      `${SIGN_ICON_ASSET_BASE_URL}/${OLD_SIGN_SVG_PATH}/331.svg`,
    );
  });

  it("resolves post-2020 and pre-2020 codes out of the pinned catalogue", () => {
    expect(officialSignIconUrl("C38")).not.toBeNull();
    expect(officialSignIconUrl("C32_5")).not.toBeNull();
    expect(officialSignIconUrl("331")).not.toBeNull();
    expect(officialSignIconUrl("344-2")).not.toBeNull();
  });

  it("returns null for codes the pinned collection has no SVG for", () => {
    // Municipal auxiliary codes appear in the Turku registry (research §3.3)
    // but upstream publishes no SVG for them — those signs take the plate.
    for (const code of ["990", "991", "999", "C99_99", "Z1", "", "c38"]) {
      expect(officialSignIconUrl(code)).toBeNull();
    }
  });

  it("trims surrounding whitespace before resolving", () => {
    expect(officialSignIconUrl("  C38  ")).toBe(officialSignIconUrl("C38"));
  });

  it("keeps the two collections disjoint, as they are upstream", () => {
    const newCodes = new Set(codes(NEW_SIGN_ICON_CODES));
    expect(codes(OLD_SIGN_ICON_CODES).filter((code) => newCodes.has(code))).toEqual([]);
  });

  it("carries the whole pinned catalogue for both collections", () => {
    // Both collections are substantial: resolution is a real lookup, not a
    // code-shape guess.
    expect(codes(NEW_SIGN_ICON_CODES).length).toBeGreaterThan(500);
    expect(codes(OLD_SIGN_ICON_CODES).length).toBeGreaterThan(300);
    expect(codes(NEW_SIGN_ICON_CODES)).toContain("C32_5");
    expect(codes(OLD_SIGN_ICON_CODES)).toContain("344-2");
  });
});
