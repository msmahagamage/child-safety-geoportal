# Child Traffic Safety Atlas

An interactive research atlas for fatal motor-vehicle crashes involving children in the United States, 2017–2023.

## Included views

- Shared curved Albers USA national overview for every analytical layer, with Alaska and Hawaii insets
- County-level national choropleth with persistent county boundaries
- Filled 2019 Census tract choropleths that load by state after zooming in
- Raw counts, rates per 10,000 children, and built-environment tertiles
- Crash-density hexagons with year and child age-group filters
- High-crash primary-road corridors colored by crash count, crashes per mile, fatalities, or pedestrian/cyclist deaths
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

The app reads slimmed `data/*.min.csv` files. Regenerate them after rebuilding the data with `python scripts/make_slim_csv.py`.

No JavaScript build step is required.

## Publish with GitHub Pages

Push the contents of this directory as the repository root. In the GitHub repository, open **Settings → Pages**, choose **Deploy from a branch**, and publish the root of the `main` branch. The atlas uses relative data paths, so no code changes are required for a standard project site.

## Web data

The repository contains browser-ready derivatives rather than the multi-gigabyte research source directory:

- `data/counties.geojson` — simplified county geometry and FARS outcomes
- `data/states.geojson` — dissolved state outlines for the Albers overview
- `data/tracts/*.geojson` — state-split 2019 tract geometry
- `data/census-tracts.min.csv`, `data/child-crashes.min.csv`, `data/schools-enhanced.min.csv` — slim tract measures, crash locations and school indicators loaded by the site. The full-column versions (`census-tracts.csv`, `child-crashes.csv`, `schools-enhanced.csv`) are produced by `scripts/prepare_web_data.py` and are not committed.
- `data/major-road-corridors.geojson` — simplified primary roads with conservatively matched crash outcomes
- `data/metadata.json` — record counts and geography metadata

Run the reproducible data builder from the app directory when the source study files are available in the parent workspace:

```powershell
python scripts/prepare_web_data.py
python scripts/prepare_road_corridors.py
```

Python data-preparation dependencies are listed in `requirements-data.txt`.

## Interpretation

- Crash-density hexagons are a visual aggregation, not a test of statistically significant clustering.
- The road view is a screening layer, not a complete road-safety model. It uses 2026 TIGER/Line Primary Roads, omits local and secondary streets, and includes only crashes close enough to match conservatively.
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

