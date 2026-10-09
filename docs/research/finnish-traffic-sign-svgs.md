# Research: Finnish Traffic Sign SVG Asset Sources and Sign Code Catalogue

**Related Ticket**: [#3 (Investigate Finnish traffic sign SVG asset sources and sign code catalogue)](https://github.com/maeklund86/wme_turku_traffic_signs/issues/3)  
**Date**: 2026-10-09  
**Author**: Wayfinder Agent

---

## 1. Executive Summary

- **Primary Source**: The Finnish Transport Infrastructure Agency (*Väylävirasto*) publishes an official vector catalogue of all road signs at [`finnishtransportagency/liikennemerkit`](https://github.com/finnishtransportagency/liikennemerkit).
- **License**: **CC0 1.0 Universal (Public Domain Dedication)** — completely free for public and private use without attribution or distribution restrictions.
- **Coverage**:
  - `collections/new_signs/svg`: **598 SVGs** compliant with the 2020 Road Traffic Act (*Tieliikennelaki 729/2018*), using letter-prefixed codes (e.g. `A1.1`, `B5`, `C38`).
  - `collections/old_signs/svg`: **349 SVGs** covering legacy 3-digit numbered signs prior to 1.6.2020 (e.g. `331`, `372`, `521`).
- **CDN Availability**: Can be delivered to userscript clients on demand with global edge caching and CORS headers (`access-control-allow-origin: *`, `cache-control: public, max-age=31536000, immutable`) via jsDelivr pinned to commit SHA `35be7a6593e70c8ed5f4e3ef54372d69a3fef558`:
  `https://cdn.jsdelivr.net/gh/finnishtransportagency/liikennemerkit@35be7a6593e70c8ed5f4e3ef54372d69a3fef558/collections/new_signs/svg/{CODE}.svg`
- **Turku API Sign Code Alignment**: Out of 10,000 traffic sign records analyzed from `turku.asiointi.fi/trimbleogcapi/collections/GIS:Liikennemerkit`:
  - >98% of signs already carry the post-2020 letter-prefixed code in `Varustelaji_koodi` (e.g., `C38`, `B5`, `C32_5`).
  - <2% carry legacy numeric codes (`331`, `423`, `521`, etc.) or municipal custom codes (`990`, `991`, `999`).

---

## 2. Primary Sources & Licensing

### 2.1 Väylävirasto Official Repository
- **Repository URL**: `https://github.com/finnishtransportagency/liikennemerkit`
- **Official Portal**: `https://vayla.fi/tieverkko/liikennemerkit` (Finnish) / `https://vayla.fi/en/transport-network/traffic-signs` (English)
- **License**: CC0 1.0 Universal. Explicitly confirmed in repository `README.md` and `license.txt`:
  > *"Liikennemerkkikuvat jaetaan avoimena datana ilman muita vaatimuksia (CC0)."*  
  > *"The image data is provided by Finnish Transport Infrastructure Agency and is shared under CC0."*

### 2.2 Secondary / Alternative Sources
- **Wikimedia Commons**: Contains SVG files under `Category:Road signs in Finland`, but file names vary (Finnish descriptive names vs codes) and lack an authoritative programmatic mapping structure.
- **Traficom Picture Bank**: Houses raster and PDF/AI vector assets for print, but no structured programmatic Git repository.

**Conclusion**: `finnishtransportagency/liikennemerkit` is the authoritative, standardized primary source.

---

## 3. Asset Structure and Sign Code Mapping

### 3.1 Post-2020 Signs (`new_signs/svg/`)
The Finnish Road Traffic Act categorizes signs into letter groups:
- **A**: Warning signs (*Varoitusmerkit*, e.g., `A1.1.svg` - Mutka oikealle, `A10.svg` - Tietyö)
- **B**: Priority and right-of-way signs (*Etuajo-oikeus- ja väistämismerkit*, e.g., `B1.svg` - Etuajo-oikeutettu tie, `B5.svg` - Väistämisvelvollisuus risteyksessä)
- **C**: Prohibition and restriction signs (*Kielto- ja rajoitusmerkit*, e.g., `C1.svg` - Ajoneuvolla ajo kielletty, `C38.svg` - Pysäköinti kielletty)
- **D**: Mandatory signs (*Määräysmerkit*, e.g., `D1.1.svg` - Pakollinen ajosuunta)
- **E**: Information signs (*Sääntömerkit*, e.g., `E1.svg` - Suojatie, `E14.svg` - Taksiasema)
- **F**: Direction signs (*Opastusmerkit*, e.g., `F1.1.svg` - Suunnistustaulu)
- **G**: Additional panels (*Lisäkilvet*, e.g., `G1.svg` - Kohde risteävällä tiellä)

#### Speed Limit Variations:
In the City of Turku dataset, speed limits use variation suffixes in `Varustelaji_koodi` that map directly to the files in `new_signs/svg`:
- `C32` -> `C32.svg` (base / 60 km/h)
- `C32_3` -> `C32_3.svg` (30 km/h)
- `C32_4` -> `C32_4.svg` (40 km/h)
- `C32_5` -> `C32_5.svg` (50 km/h)
- `C32_6` -> `C32_6.svg` (70 km/h)

### 3.2 Pre-2020 Signs (`old_signs/svg/`)
Legacy codes use 3-digit identifiers (e.g. `331.svg`, `372.svg`, `521.svg`). The userscript can easily resolve legacy codes against `collections/old_signs/svg/{code}.svg` or via a small alias lookup table.

### 3.3 Special & Municipal Non-Standard Codes
In the Turku dataset, a small fraction of items use auxiliary municipal codes:
- `990`: Ticket machine (*Lippuautomaatti*)
- `991`: Parking meter (*Pysäköintiautomaatti*)
- `999`: Unknown traffic sign (*Tuntematon*)

These can be mapped to generic fallback icons or an SVG placeholder.

---

## 4. Delivery Strategies for Userscript Overlay

Three primary architectures were evaluated for how the userscript retrieves and displays SVGs:

| Architecture | Implementation | Bundle Impact | Network Impact | Offline/Portability | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A. Remote CDN on Demand (jsDelivr)** | OpenLayers loads icon URL pointing to jsDelivr with pinned commit hash | 0 KB added to userscript size | HTTP GET per unique sign type (cached by browser & CDN indefinitely) | Requires web access; works out of the box with CORS | **Recommended for MVP** |
| **B. Pre-bundled Data URIs** | Embed top 30 most frequent sign SVGs inline as base64/URI strings | ~60–100 KB added to userscript bundle | Zero network requests for common signs | Fully offline for top 30 signs | Optional optimization for post-MVP |
| **C. Git submodule / local assets** | Host on userscript GitHub Pages | High maintenance | Same as CDN | Dependent on repo hosting | Not necessary |

### CDN URL Pattern (jsDelivr pinned to commit):
- **Post-2020 signs**:
  `https://cdn.jsdelivr.net/gh/finnishtransportagency/liikennemerkit@35be7a6593e70c8ed5f4e3ef54372d69a3fef558/collections/new_signs/svg/${code}.svg`
- **Pre-2020 signs**:
  `https://cdn.jsdelivr.net/gh/finnishtransportagency/liikennemerkit@35be7a6593e70c8ed5f4e3ef54372d69a3fef558/collections/old_signs/svg/${code}.svg`
- **Fallback / Generic**:
  Built-in SVG data URI for unrecognized/missing sign codes or loading errors.

---

## 5. Verification Checklist

- [x] Verified repository contents and CC0 license (`finnishtransportagency/liikennemerkit`).
- [x] Verified exact matching of Turku dataset `Varustelaji_koodi` values (`C38`, `B5`, `C32_5`, etc.) against SVG file names.
- [x] Verified jsDelivr CDN availability with immutable HTTP 200 headers and `access-control-allow-origin: *`.
- [x] Pinned canonical commit hash (`35be7a6593e70c8ed5f4e3ef54372d69a3fef558`).
