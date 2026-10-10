# Waze accreditation status of the City of Turku traffic sign dataset

**Issue:** #10 — "Verify Waze accreditation status of the Turku traffic sign dataset"
**Date of research:** 2026-10-10
**Method:** primary sources only — the Waze staff policy announcement, the official accreditation list it designates, the accreditation request form, and the dataset's open-data registry entry.

## Question

Waze's April 2026 script-compliance policy requires userscripts to source data only from accredited sources (raised in #4 "Inspect WME OpenLayers vector layer integration patterns"). Is the City of Turku *Liikennemerkit* dataset (served via the Trimble OGC API, see #2) accredited for WME editor use — and if not, what is the accreditation path?

## Answer

**No. The dataset is not accredited.** There is no Finnish source of any kind on Waze's accredited list, and no traffic-sign datasets anywhere on it. Accreditation for this dataset has not been requested, so it would have to go through Waze's open-source data layer request process (weeks-plus lead time) before any script may ship it.

## Findings

### 1. The April 2026 policy (primary source)

Staff announcement "Important Reminder: Ensuring Map Data Integrity and Compliance in WME Scripting", posted 2026-04-06 by @Gal-Staff in Waze Discuss *Official Announcements*:
<https://www.waze.com/discuss/t/important-reminder-ensuring-map-data-integrity-and-compliance-in-wme-scripting/402288>

Key statements:

- "all developed scripts, tools, chrome extensions and overlays must rely exclusively on accredited data sources" — this covers our planned read-only overlay, not just data-writing scripts.
- The **Waze Map Data Attribution** page (<https://support.google.com/waze/answer/12075833>) is "the definitive list of permitted resources and the specific naming conventions required to ensure proper attribution before deployment."
- To add new open-source data: "please fill out this Form" — the **Waze WME Scripting: Open Source Data Layer Request Form** (<https://forms.gle/K8GxrHtqpe8MRTxB9>).
- "If you have any questions regarding the suitability of a data source, please reach out to your Community or to me for validation before deployment."
- The same announcement reiterates the SDK-only future from #4: "legacy scripts that bypass this interface will eventually cease to function."

### 2. The accredited list — Turku is absent

The [Waze Map Data Attribution page](https://support.google.com/waze/answer/12075833) (read in full, 2026-10-10) lists accredited sources by country: Norway (Kartverket basemap, NPRA incident data), Denmark (Vejdirektoratet incidents), Japan (GSI, fuel), Italy, Germany, Canada (city incident feeds), Mexico, France, Hong Kong, USA (Minnetonka, Maryland, Colorado, CDOT), Slovenia, New Zealand (LINZ), Croatia, UK (OGL, Ordnance Survey), and Australia (state basemaps/rovers).

- **No Finland / Turku entry exists.**
- The listed entries are basemaps, fuel-price feeds, and incident feeds — **no traffic-sign or road-furniture inventories are accredited anywhere on the list**, so a sign dataset is precisely the kind of "additional open source data" the form exists for.
- Conclusion: the City of Turku Liikennemerkit dataset is **not** on the accredited list, and no accreditation request for it is evidenced.

### 3. The accreditation path

**Who to ask:** Waze, two channels named in the announcement:

1. **Google Form (primary):** *Waze WME Scripting: Open Source Data Layer Request Form* — <https://forms.gle/K8GxrHtqpe8MRTxB9> (redirects to <https://docs.google.com/forms/d/e/1FAIpQLSckKm-9hDRALxD2qhngvffzFppOS9C8FDD2w8yuiIE0En8Q8A/viewform>). "Use this form to request approval for new open-source data layers."
2. **Community/staff validation (parallel):** the local Waze community — Waze Discuss category **Finland [suomi]**, <https://www.waze.com/discuss/c/editors/finland-suomi/4260> — or @Gal-Staff (Waze staff), for a suitability check before deployment.

**What the form requires** (fields, verbatim):

- Email
- Waze Username
- Open Source Data Layer Name
- Direct URL to the Data Source/API
- Type of Data ("that you're interested in for your script")
- Link to the Data License/Terms of Service
- Why is this data layer needed? ("How will it benefit map editing or to scripts? Which current scripts need this data?")
- Additional comments

**Form warning (verbatim):** "legal review and setting up proper accreditation (in the App or Livemap) can take several weeks or more. **Do not use unverified data sources in your scripts until you receive official confirmation.**"

**Timeline:** several weeks or more (legal review + accreditation setup). Plan public deployment accordingly.

### 4. What we can put in the form today

The dataset's registry entry gives ready answers for every required field:

- Registry: *Turun kaupungin liikennemerkit* — <https://avoindata.suomi.fi/data/fi/dataset/turun-kaupungin-liikennemerkit>
- Publisher/maintainer: City of Turku (`Turku` organization; contacts `avoindata@turku.fi`, `paikkatieto@turku.fi`; site `data.turku.fi`)
- **License: Creative Commons Attribution 4.0 International (CC BY 4.0)** — <https://creativecommons.org/licenses/by/4.0/> (satisfies the "Link to the Data License" field)
- Coverage: ~630 km of Turku street network, positioning accuracy estimated < 10 cm, register maintained (update frequency: weekly)
- API URLs (from #2): Trimble OGC API `https://opaskartta.turku.fi/trimbleogcapi/collections/GIS:Liikennemerkit/items`; WFS `https://opaskartta.turku.fi/TeklaOGCWeb/WFS.ashx`
- Justification for the "why needed" field: read-only overlay (per #4's SDK design) giving WME editors a cross-reference of physical sign locations/codes while editing; signs are not editable Waze objects, so the overlay informs editing without competing with Waze selection.

Once accredited, attribution must follow the naming conventions on the Map Data Attribution page.

### 5. Context notes

- Waze has an institutional channel for municipal data (Waze for Cities): Finland's Fintraffic has joined it (EU ITS Directive progress report, Finland 2023). Not required for a script overlay, but indicative that City-of-Turku→Waze data relationships are an established model if a formal partnership is ever wanted.
- The dataset's own disclaimer ("Liikenteessä tulee aina noudattaa maastoon asetettuja liikennemerkkejä tietoaineiston sisällöstä riippumatta" — drivers must obey signs physically placed on site regardless of the dataset) supports the read-only, advisory framing of the overlay.

## Impact on this map

- Public deployment of the overlay is **blocked until accreditation is confirmed** (or a data source on the accredited list is used instead).
- The overlay architecture from #4 (WME SDK marker layer, read-only sidebar details) is unaffected — accreditation is a data-sourcing prerequisite, not a design change.
- Practical next step for the project owner: submit the form with the details in §4; until confirmation, keep any sign-data usage to private/local testing (the form explicitly forbids using unverified sources in scripts).

## Uncertainties

- Whether Waze grants accreditation for an overlay-only, read-only script use: the form's note frames accreditation as being set up "in the App or Livemap", which is phrased around Waze's own products; the outcome for a third-party userscript is unknown until submitted.
- Whether accreditation, once granted, extends automatically to the script or only to the data feed — the announcement's letter suggests the former is expected but does not spell it out.
- List state verified as of 2026-10-10; the attribution page is the living reference and should be re-checked before deployment.

## Sources

1. Waze Discuss, Official Announcements — "Important Reminder: Ensuring Map Data Integrity and Compliance in WME Scripting" (2026-04-06): <https://www.waze.com/discuss/t/important-reminder-ensuring-map-data-integrity-and-compliance-in-wme-scripting/402288>
2. Waze Help — "Map Data Attribution" (definitive accredited-sources list): <https://support.google.com/waze/answer/12075833>
3. Google Form — "Waze WME Scripting: Open Source Data Layer Request Form": <https://forms.gle/K8GxrHtqpe8MRTxB9>
4. avoindata.suomi.fi — "Turun kaupungin liikennemerkit" dataset page (license CC BY 4.0, maintainer contacts, resource URLs): <https://avoindata.suomi.fi/data/fi/dataset/turun-kaupungin-liikennemerkit>
5. Waze Discuss — Finland [suomi] community category: <https://www.waze.com/discuss/c/editors/finland-suomi/4260>
6. European Commission — "Directive 2010/40/EU Progress Report 2023 Finland" (Fintraffic in Waze for Cities): <https://transport.ec.europa.eu/document/download/7a90d4d2-1fa9-4635-95b2-8f67e46ce45d_en?filename=2024_fi_its_progress_report_2023.pdf>
7. Prior research in this repo: `docs/research/trimble-ogc-api-schema.md` (#2) and `docs/research/wme-openlayers-vector-integration.md` (#4).
