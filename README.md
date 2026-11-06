# Child Traffic Safety Atlas

An interactive research atlas for fatal motor-vehicle crashes involving children in the United States, 2017–2023.

## Included views

- Shared curved Albers USA national overview for every analytical layer, with Alaska and Hawaii insets
- County-level national choropleth with persistent county boundaries
- Filled 2019 Census tract choropleths that load by state after zooming in
- Raw counts, rates per 10,000 children, and built-environment tertiles
- Crash-density hexagons with year and child age-group filters
- High-crash road corridors colored by crash count, crashes per mile, fatalities, or pedestrian/cyclist deaths
- Clustered national school circles sized by school count and colored by the median selected indicator
- Individual school points with a fixed two-mile study buffer, filtered-area comparisons, and optional crash/road context
- Independent State and County filters remembered by each map layer, plus School address ZIP filtering on the Schools layer
- Accessible Home control that restores the national map view

The national views are rendered with D3's composite Albers USA equal-area projection. Selecting a county opens the corresponding detailed Leaflet map, which uses Web Mercator because the Esri street basemap is tiled in that projection. All source coordinates remain WGS 84 longitude/latitude.

## Run locally

The app must be served over HTTP so the browser can load its data files.

```powershell
cd child-safety-geoportal
python serve.py 8765
```

`serve.py` gzip-compresses the data files for much faster loading (`python -m http.server` also works, just slower). On Windows you can double-click `start-server.bat`. Then open `http://localhost:8765`.

The app reads the files in `data/` (see `data/README.md` for what each one is). Regenerate them with:

```powershell
python scripts/prepare_tract_data.py        # tracts: manuscript sample, N = 63,565
python scripts/select_analysis_schools.py   # schools: manuscript sample (~76,000)
python scripts/make_slim_csv.py             # schools + crashes
```

**Sample matches the manuscript.** The tract layer maps the 69,120 tracts of `cetract_standardized.csv`, the model dataframe (saved 2026-01-28) that tract_regression.ipynb used to draw the manuscript's Figure 2 (`figure_2.png`, saved the next day); other tracts are unavailable (gray), as the white tracts in Figure 2. Each tract popup states whether it belongs to the final regression sample of Tables 1–2 (`cetract_raw.csv`): 63,565 tracts with complete covariates including traffic volume and children, 34,446 fatal collisions, 13,979 child fatalities and 2,274 pedestrian/cyclist child fatalities. Totals shown on the tract tab cover all 69,120 mapped tracts (36,052 crashes, 14,624 child fatalities, 2,420 pedestrian/cyclist deaths); the sample rows reproduce the manuscript exactly. The school layer keeps exactly the schools in the manuscript's school sample (public schools with a stable location, Street View indicators, a 2019 tract with complete covariates, and 2023 enrollment of at least 25): 76,058 rows, 76,056 unique school IDs. Each school's popup shows its study outcomes under the manuscript's nearest-school rule. The crash overlay plots every matching crash. The crash-density, county and school-overlay views use all 37,412 child-involved fatal crashes with a valid location (37,543 in FARS, 131 without coordinates), including about 2,900 crashes in tracts outside the manuscript's tract sample. Only the tract layer is limited to the Figure 2 tracts. The road layer currently covers primary roads only (`prepare_road_corridors.py`). To cover every road class, run `python scripts/prepare_all_roads.py` on a machine with internet access (see the script header); it downloads Census TIGER/Line county road files, matches all crashes to the nearest road within 40 m, and rewrites `data/major-road-corridors.geojson`. The school crash overlay follows the manuscript's rule: each fatal child-involved crash is assigned to its single nearest school within two miles (`fars_school_nearest_2mi.csv`), so a crash appears for one school only. Crashes inside a school's circle that are nearer to another school are not shown for it. The manuscript's printed school totals (19,830 crashes, 7,500 child deaths, 1,701 pedestrian/cyclist deaths) are computed before the enrollment filter; the popups use the final 76,058-school sample.

No JavaScript build step is required.

## Publish with GitHub Pages

Push the contents of this directory as the repository root. In the GitHub repository, open **Settings → Pages**, choose **Deploy from a branch**, and publish the root of the `main` branch. The atlas uses relative data paths, so no code changes are required for a standard project site.

## Web data

The repository contains browser-ready derivatives rather than the multi-gigabyte research source directory:

- `data/tracts.csv` — census-tract outcomes, rates and street-view tertiles
- `data/crashes.csv` — one row per child-involved fatal crash
- `data/schools.csv` — schools in the manuscript sample, with indicators and study outcomes
- `data/roads.geojson` — road corridors with matched crash outcomes (primary roads now; all road classes after running `prepare_all_roads.py`)
- `data/tract-shapes/state-XX.geojson` — state-split 2019 tract geometry
- `data/counties.geojson`, `data/states.geojson`, `data/state-bounds.json` — county shapes, state outlines and state map bounds
- `data/metadata.json` — record counts and geography metadata

Run the reproducible data builder from the app directory when the source study files are available in the parent workspace:

```powershell
python scripts/prepare_web_data.py
python scripts/prepare_road_corridors.py   # primary roads only
python scripts/prepare_all_roads.py          # all TIGER road classes (downloads county files)
```

Python data-preparation dependencies are listed in `requirements-data.txt`.

## Interpretation

- Crash-density hexagons are a visual aggregation, not a test of statistically significant clustering.
- The road view is a screening layer, not a complete road-safety model. The bundled layer uses 2026 TIGER/Line Primary Roads, omits local and secondary streets, and includes only crashes close enough to match conservatively; `prepare_all_roads.py` extends it to all road classes.
- Crashes per mile adjusts for segment length but not traffic volume or vehicle miles traveled.
- School indicators and regression results use the study's fixed two-mile Euclidean buffer. The bundled data do not contain 0.5- or 1-mile indicator estimates.
- The School address ZIP filter uses the NCES school address; it is not a claim that the full two-mile buffer lies inside that ZIP or a Census ZCTA.
- Gray or dashed tracts have no prepared tract analysis record and are not equivalent to zero.
- School indicators summarize sampled street images inside the study geography; they are not school-level causal estimates.
- The tract regression subset, coordinate-valid crash file, raw school source, and final adjusted manuscript models have different inclusion criteria. Counts are labeled by mapped layer and should not be treated as interchangeable.
- Associations in the underlying study are observational and do not establish causation.

## Data sources

- Fatality Analysis Reporting System (FARS), 2017–2023
- U.S. Census Bureau 2019 cartographic boundary files
- U.S. Census Bureau 2026 TIGER/Line Primary Roads
- National Center for Education Statistics school locations
- Study-prepared Google Street View built-environment indicators

