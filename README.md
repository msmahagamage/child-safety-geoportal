# Child Traffic Safety Atlas

An interactive research atlas for fatal motor-vehicle crashes involving children in the United States, 2017–2023. It accompanies the manuscript *Built Environment Factors Linked to Fatal Motor Vehicle Collisions Among US Children, 2017–2023* (Pediatrics Open Science).

**Live atlas: <https://msmahagamage.github.io/child-safety-geoportal/>**

It is a static website (HTML, CSS, JavaScript and data files). There is no server code and no build step.

## What you can explore

Pick a layer in the left panel. Each layer has its own State and County filters and its own map measure; switching layers resets the previous layer's choices.

- **Crash density** – hexagons of child-involved fatal crashes, with year and child age-group filters.
- **Census tracts** – 2019 tract choropleths that load by state when you zoom in. Measures: counts, rates per 10,000 children, and Street View built-environment tertiles. Gray tracts have no analysis data (they are not zero).
- **Road corridors** – all road classes (TIGER/Line), colored by child-involved fatal crashes, crashes per road mile, child fatalities, or child pedestrian / cyclist deaths.
- **School buffers** – clustered national school circles; zoom in for individual schools with the study's fixed two-mile buffer, filtered-area comparisons, and optional overlays:
  - *Crashes assigned to this school (study definition)*: black-outlined dots, filled pale orange / orange / dark red for 0 / 1 / 2+ child deaths in the crash.
  - *High-crash roads* inside the buffer.

National views use D3's Albers USA projection (Alaska and Hawaii insets). County and tract views use Leaflet in Web Mercator over an Esri street basemap. All source coordinates are WGS 84.

## Run locally

The page must be served over HTTP so the browser can load its data files (opening `index.html` directly will not work).

```powershell
cd child-safety-geoportal
python serve.py 8765
```

Then open <http://localhost:8765>. On Windows you can double-click `start-server.bat` instead. `serve.py` gzip-compresses the data for faster loading; `python -m http.server` also works, just slower. Hard-refresh (Ctrl+F5) after changing files.

## Data in `data/`

| File | Contents |
|---|---|
| `tracts.csv` | 69,120 tracts: counts, rates per 10,000 children, five Street View tertiles, `child_total`, `in_sample` flag |
| `crashes.csv` | 37,412 child-involved fatal crashes with a valid location, plus `school_id` (nearest school within 2 miles) |
| `schools.csv` | 76,056 schools in the manuscript sample, with indicators and study outcomes |
| `roads.geojson` | TIGER/Line road corridors with matched crash outcomes (44,996 corridors) |
| `tract-shapes/state-XX.geojson` | State-split 2019 tract geometry |
| `counties.geojson`, `states.geojson`, `state-bounds.json` | County shapes, state outlines, map bounds |
| `metadata.json` | Record counts and geography notes |

See `data/README.md` for details.

## How the data match the manuscript

- **Tracts.** The map shows the 69,120 tracts of `cetract_standardized.csv` (the dataframe behind the manuscript's Figure 2). Each popup states whether the tract is in the final regression sample of Tables 1–2: 63,565 tracts with complete covariates, 34,446 fatal collisions, 13,979 child fatalities and 2,274 child pedestrian / cyclist fatalities.
- **Schools.** Exactly the manuscript's school sample: public schools with a stable location, Street View indicators, a 2019 tract with complete covariates, and 2023 enrollment of at least 25 (76,058 rows, 76,056 unique IDs).
- **Crash assignment.** Each fatal child-involved crash belongs to its single nearest school within two miles. A crash inside a school's circle that is nearer to another school is not shown for it. The manuscript's printed school totals (19,830 crashes, 7,500 child deaths, 1,701 child pedestrian / cyclist deaths) are computed before the enrollment filter, so school popups can differ slightly.
- **Definitions.** A child is under 18. A child fatality is a child with FARS injury severity 4. A child pedestrian / cyclist death is a child death with person type 5 or 6. "Fatal collisions with children" counts crashes, so one crash can involve several children and a child may survive in a crash that killed an adult.
- **Rates** are per 10,000 children (ACS 2015–2019 children under 18) and are a portal convenience; the manuscript models use counts with a log-children offset.

## Rebuild the data (optional)

Requires the study source files next to this folder and the packages in `requirements-data.txt`.

```powershell
pip install -r requirements-data.txt
python scripts/prepare_tract_data.py        # tracts
python scripts/select_analysis_schools.py   # manuscript school sample and study outcomes
python scripts/prepare_web_data.py          # shapes, crashes, schools (full versions in data/build/)
python scripts/make_slim_csv.py             # slim crashes.csv and schools.csv
python scripts/prepare_all_roads.py         # all-road corridors (needs internet; downloads county road files, several GB)
```

`prepare_road_corridors.py` is an older, lighter version that uses primary roads only. Intermediate files go to `data/build/`, which is not committed.

## Publish with GitHub Pages

Push this folder as the repository root. In the repository open **Settings → Pages**, choose **Deploy from a branch**, and select the `main` branch, root folder. Paths are relative, so no code change is needed. The `.nojekyll` file tells Pages to serve the files as-is.

## Interpretation and limits

- Crash-density hexagons are a visual aggregation, not a test of statistically significant clustering.
- The road layer is a screening tool, not a road-safety model. Crashes are matched to the nearest road within 40 m (98.5% matched); crashes per mile adjusts for length but not traffic volume.
- School indicators and regression results use the study's fixed two-mile Euclidean buffer; 0.5- and 1-mile estimates are not included.
- The school ZIP filter uses the NCES school address; it does not mean the whole buffer lies inside that ZIP.
- School indicators summarize sampled street images; they are not school-level causal estimates.
- The tract regression subset, coordinate-valid crash file, school sample and adjusted manuscript models have different inclusion criteria. Counts are labeled by layer and should not be treated as interchangeable.
- Associations in the underlying study are observational and do not establish causation.

## Data sources

- Fatality Analysis Reporting System (FARS), 2017–2023
- U.S. Census Bureau 2019 cartographic boundary files and ACS 2015–2019 (NHGIS)
- U.S. Census Bureau TIGER/Line roads
- National Center for Education Statistics Common Core of Data (school locations, enrollment)
- Study-prepared Google Street View built-environment indicators
- Basemap: Esri; map libraries: Leaflet and D3
