# Agent-gathered reference images — sources & curation notes

Gathered 2026-07-04 for ROOOT internal design study (authorized by project owner).
Three historical information-design languages: ISOTYPE (Neurath/Arntz), W.E.B. Du Bois's
1900 Paris Exposition data portraits, Otl Aicher's Munich 1972 program.

**License summary**
- **Du Bois / LOC:** "No known restrictions on publication" — public domain. Credit: Library of Congress, Prints & Photographs Division, Daniel Murray Collection.
- **ISOTYPE / Rumsey plates:** scans from the David Rumsey Map Collection (Stanford), offered under **CC BY-NC-SA 3.0** (credit: "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries"). The underlying work (*Gesellschaft und Wirtschaft*, Leipzig 1930) entered the **US public domain 2026-01-01** (95-year term). It is **not** PD in the EU (Gerd Arntz d. 1988). Fine for internal reference; do not republish commercially without a check.
- **Aicher originals are under copyright** (managed via ERCO / piktogramm.de; Olympic properties). Nothing of the original artwork was downloaded. The four downloaded photos are CC-licensed photographs of signage permanently installed in public space at the Olympiapark (covered by German freedom of panorama, §59 UrhG).

---

## 1. ISOTYPE — Otto Neurath / Gerd Arntz (`isotype/`)

Plates 42–57 of *Gesellschaft und Wirtschaft: Bildstatistisches Elementarwerk*
(Gesellschafts- und Wirtschaftsmuseum in Wien, pub. Bibliographisches Institut, Leipzig, 1930).
Drawn under Neurath's Vienna Method; pictograms by Gerd Arntz's studio.

### isotype-01_kraftwagenbestand-der-erde-1914-1928_rumsey-14080059.jpg
- Source: https://archive.org/details/dr_kraftwagenbestand-der-erde--1914-1920-1928-angefertigt-fr-das-bibliograp-14080059 (plate 56)
- License: scan CC BY-NC-SA 3.0 (Rumsey); work US-PD (pub. 1930). 1536×1027.
- TAKE: The canonical ISOTYPE sentence. One drawn car = 2,500,000 cars, stated in plain words at bottom-left ("Jedes Auto 2 500 000 Kraftwagen") — the unit legend is a sentence, not a key. Rows = years; one thin vertical rule splits USA from rest-of-world, so share and growth are read in a single glance. A muted tan skyline sits *behind* the black data glyphs: atmosphere never competes with data ink.

### isotype-02_rinder-schweine-schafbestand-der-erde_rumsey-14080046.jpg
- Source: https://archive.org/details/dr_rinderbestand-der-erde-schweinbestand-der-erde-schafbestand-der-erde-angef-14080046 (plate 43)
- License: as above. 1027×1536.
- TAKE: Three stacked world maps (cattle / pigs / sheep), one shared rule for the whole series: "Jede Signatur 10 Millionen Tiere." Counting-by-repetition works ON a map — glyph clusters sit in-region while the basemap is flattened to two tones. Lesson for series design: state the unit once, keep every panel identical in grammar.

### isotype-03_entwicklung-der-eisenbahnen-1825-1926_rumsey-14080060.jpg
- Source: https://archive.org/details/dr_entwicklung-der-eisenbahnen--1825-1851-1881-1901-1913-1926-angefertigt-f-14080060 (plate 57)
- License: as above. 1536×1028.
- TAKE: Two visual languages on one plate. Left: a locomotive silhouette grows through six dates — a timeline told by the icon itself. Right: track segments as counting units (1 = 50,000 route-km) stacked into a centered pyramid, regions labeled under the base row, hairline leaders linking the eras. Icon evolution for quality, repetition for quantity.

### isotype-04_kaffee-kakao-teewirtschaft-der-erde_rumsey-14080045.jpg
- Source: https://archive.org/details/dr_kaffee--kakao--teewirtschaft-der-erde-angefertigt-fr-das-bibliographisc-14080045 (plate 42)
- License: as above. 1536×1027.
- TAKE: Three commodities distinguished purely by glyph silhouette (coffee beans / cocoa pod stack / tea chest); *state* is encoded by fill — outline = produced & consumed at home, half-tone = exported, solid = imported. Same icon, three meanings, zero extra symbols. Legend written as full clauses ("je 0,1 Millionen t erzeugt und ausgeführt").

### isotype-05_oelfeuerung-handelsmarinen-1914-1929_rumsey-14080057.jpg
- Source: https://archive.org/details/dr_lfeuerung-in-den-handelsmarinen-der-erde--1914-1929-angefertigt-fr-das-14080057 (plate 54)
- License: as above. 1536×1026.
- TAKE: A category shift inside a unit chart: every ship = 1M gross register tons; color = propulsion (green oil/motor, tan coal, blue sail). 1914 vs 1929 rows make the energy transition read as the same fleet being recolored. Tiny footnote states the rounding rule — honesty lives in small print under the legend.

### isotype-06_basic-by-isotype-1937-book-spread_commons-pd.jpg
- Source: https://commons.wikimedia.org/wiki/File:Basic_by_Isotype.jpg (photo of *Basic by Isotype*, Neurath, 1937, V&A display)
- License: Commons tag {{PD-old}} (claimed via Neurath, d. 1945). 3495×2594.
- TAKE: ISOTYPE as pedagogy in strict two-ink red/black. Left page defines the sign; right page ("Placing of the road signs") shows the sign *in use* inside a diagram built from the same vocabulary. Spec sheet and usage example as facing pages — a design system avant la lettre.

**Viewed, not downloaded:**
- Modern ISOTYPE-style tile mural (Dutch harbor statistics, red-on-white ceramic, "1 figure = 100" badge legends) — https://commons.wikimedia.org/wiki/File:Isotype-neurath.jpg (CC BY 2.0 photo). Not a Neurath original; nice proof the language survives on architectural material.
- Full digitized atlas (100+ plates, browsable): search "Gesellschaft und Wirtschaft" at https://www.davidrumsey.com — best entry point for more plates.

---

## 2. W.E.B. Du Bois — 1900 Paris Exposition data portraits (`dubois/`)

Hand-drawn ink/watercolor/gouache charts prepared by Du Bois and Atlanta University
students for the "American Negro" exhibit, Exposition Universelle, Paris 1900.
All from Library of Congress, lot 11931: https://www.loc.gov/collections/african-american-photographs-1900-paris-exposition/
License: **No known restrictions — public domain.** Masters downloaded as TIFF and converted to JPEG (~2400–3300 px).

### dubois-01_georgia-negro-frontispiece_loc-ppmsca-33863.jpg
- Source: https://www.loc.gov/pictures/item/2013650420/ (ppmsca.33863)
- TAKE: A data *title page*: two hemispheres joined by slave-trade routes declare the dataset's scope like a map legend, over the thesis line "The problem of the 20th century is the problem of the color-line." Statistics framed as narrative argument — every ROOOT report could open with a plate that states its claim before its numbers.

### dubois-02_city-and-rural-population-1890-spiral_loc-ppmsca-33873.jpg
- Source: https://www.loc.gov/pictures/item/2013650430/ (ppmsca.33873)
- TAKE: The famous solution for wildly unequal bounded quantities: three short colored bars zigzag downward, then the dominant category (734,952 rural) coils into a red spiral — length stays true while the footprint stays bounded. Labels ride along the line path in thin spaced caps; the number sits inside the coil. Spiral form for "one value dwarfs the rest."

### dubois-03_assessed-value-household-kitchen-furniture-spiral_loc-ppmsca-33887.jpg
- Source: https://www.loc.gov/pictures/item/2013650445/ (ppmsca.33887)
- TAKE: Time series as nested spiral: six years (1875–1899) coil inward from a common start edge, one color per year. The legend is a simple aligned table — year, dash, dollar value — doing double duty as axis and caption. Growth is felt as accumulating rings, not read off a grid.

### dubois-04_occupations-negroes-whites-georgia-fan_loc-ppmsca-33889.jpg
- Source: https://www.loc.gov/pictures/item/2005676812/ (ppmsca.33889)
- TAKE: Two opposed fans share one apex — Black workers above, white below — same five occupation colors, percentages written inside the wedges. Comparison by mirror symmetry, no axes at all; the legend circles float in the pinch between the fans. A two-population comparison with the geometry of an hourglass.

### dubois-05_income-expenditure-150-families-atlanta_loc-ppmsca-33893.jpg
- Source: https://www.loc.gov/pictures/item/2013650354/ (ppmsca.33893)
- TAKE: Stacked 100% bars (rent/food/clothes/taxes/other) per income class, with leader lines rising to header cells that hold *actual photographs* and a printed dietary table — evidence embedded in the chart header. Right margin brackets annotate class bands ("POOR", "FAIR", "COMFORTABLE", "WELL-TO-DO"); bottom note reads "For further statistics raise this frame" — the chart admits it is an interface.

### dubois-06_conjugal-condition_loc-ppmsca-33872.jpg
- Source: https://www.loc.gov/pictures/item/2013650429/ (ppmsca.33872)
- TAKE: Paired stacked bars (Germany vs Black Georgians) per age band, three states in red/yellow/green with percentages inside segments. The legend is three colored dots with spaced-caps labels, placed asymmetrically where whitespace allows. Benchmark-comparison pattern: same bar grammar, entities stacked as couplets with a shared brace label.

**Also strong, not downloaded (same collection, same PD status):**
- "Migration of Negroes 1890" — https://www.loc.gov/pictures/item/2013650427/
- "Slaves and free Negroes" area chart — https://www.loc.gov/pictures/item/2013650431/
- "Comparative increase of white and colored population" — https://www.loc.gov/pictures/item/2013650426/

---

## 3. Otl Aicher — Munich 1972 (`aicher72/`)

Original artwork (pictogram sheets, schedule graphics, posters) is **under copyright** —
recorded below as URL + description only. Downloads are limited to CC-licensed photos of
signage permanently installed in public space (German freedom of panorama).

### Downloaded (photos of in-situ signage)

### aicher72-01_athletics-football-pictograms-olympiastadion_cc-by-1.0.jpg
- Source: https://commons.wikimedia.org/wiki/File:Olympic_games_1972_pictogramms_olympic_station_0877.JPG
- License: CC BY 1.0 (photo). 4015×2228.
- TAKE: Athletics and FOOTBALL pictograms, white on green panels at the Olympiapark. The system's whole grammar is visible: square field, figures built from uniform-weight strokes locked to horizontal/vertical/45° axes, round head, rounded terminals, ball as a circled dot. Directly relevant glyph DNA for any ROOOT football icon.

### aicher72-02_swimming-pictogram-olympia-schwimmhalle_cc-by-1.0.jpg
- Source: https://commons.wikimedia.org/wiki/File:Olympic_games_1972_pictogramms_swimming_hall_0525.JPG
- License: CC BY 1.0. 3834×2629.
- TAKE: One pictogram carrying an entire building facade — scale as hierarchy. The diagonal-only geometry keeps the figure legible from hundreds of meters; wayfinding works because the sign *is* the architecture's label, not an ornament on it.

### aicher72-03_curling-skating-hockey-pictograms-ice-rink_cc-by-1.0.jpg
- Source: https://commons.wikimedia.org/wiki/File:Olympic_parc_munich_pictogramms_ice_rink_0651.JPG
- License: CC BY 1.0. 4544×1808.
- TAKE: Three sports side by side show the *family* logic: same stroke weight, same grid, same figure proportions — only pose and prop change. A sports-icon set should read as conjugations of one verb, not three drawings.

### aicher72-04_swimmer-pictogram-schwimmhalle-facade_cc-by-sa-3.0.jpg
- Source: https://commons.wikimedia.org/wiki/File:Piktogramm_Schwimmer_an_der_Muenchner_Olympia_Schwimmhalle.JPG
- License: CC BY-SA 3.0. 2370×2072.
- TAKE: Close crop of the swimmer: the water is two wavy strokes, the body three strokes and a circle. Radical economy — count how few elements survive and still say "swimming." Good stress-test standard: remove strokes until meaning breaks, then add one back.

### Described only (copyrighted — do NOT download)

- **Official sport pictogram system sheets** — https://www.piktogramm.de/en/ (official licensing site for the Aicher pictogram system). ~180 pictograms incl. service signs; each figure constructed on a square modular grid with strict horizontal/vertical/diagonal stroke axes, uniform stroke weight, disc head; supplied in positive and negative. The sheets show the grid *under* the figure — pictogram as engineering drawing.
- **1972 sport pictogram set overview** — https://www.olympic-museum.de/pictograms/olympic-games-pictograms-1972.php and https://www.theolympicdesign.com/olympic-games/pictograms/munich-1972/ — the full 21-sport set in one view; useful for studying pose variety within one geometric constraint.
- **"The Rainbow Games" (IDZ / otlaicher.de centenary article)** — https://www.otlaicher.de/en/articles/the-rainbow-games/ — documents the schedule/timetable graphics and identity system: palette of seven colors + white built around the official light blue, deliberately excluding red/gold/black (anti-1936 statement); Univers as the only typeface ("agile, fresh, light," no oversized titles); official guides at 26×12 cm; event-schedule sheets printed both sides in seven colors — a timetable treated as spectacular information design; colors systematically assigned to disciplines and staff roles. Aicher's principle: "kinship, not uniformity."
- **Cooper Hewitt, Munich 1972 poster holdings** — https://www.cooperhewitt.org/2017/12/29/faster-higher-stronger/ — solarized-photo event posters where the rainbow palette and Univers headline system are applied to photography.
- **Commons re-drawn "1972 style" SVG icons** (e.g. https://commons.wikimedia.org/wiki/Category:1972_Summer_Olympics_pictograms) — modern user re-drawings tagged CC BY-SA; skipped: derivative imitations, single icons, weak provenance as reference.

---

## Method / caveats
- Wikimedia Commons hosts almost no genuine Neurath/Arntz chart plates (Arntz copyright runs in the EU until 2059); the Rumsey scans on archive.org are the practical source, with the dual-status caveat above.
- LOC masters fetched as `...u.tif` from tile.loc.gov and converted locally (sips, JPEG q88); ready-made LOC JPEGs top out at 1024 px.
- No downloads failed; nothing with unclear licensing was downloaded.
