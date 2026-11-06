# Child Traffic Safety Atlas

An interactive research atlas for fatal motor-vehicle crashes involving children in the United States, 2017–2023. It accompanies the manuscript *Built Environment Factors Linked to Fatal Motor Vehicle Collisions Among US Children, 2017–2023* (Pediatrics Open Science).

**Live atlas: <https://msmahagamage.github.io/child-safety-geoportal/>**

It is a static website (HTML, CSS, JavaScript and data files).

## What you can explore

Pick a layer in the left panel. Each layer has its own State and County filters and its own map measure; switching layers resets the previous layer's choices.

- **Crash density** – hexagons of child-involved fatal crashes, with year and child age-group filters.
- **Census tracts** – 2019 tract choropleths that load by state when you zoom in. Measures: counts, rates per 10,000 children, and Street View built-environment tertiles. Gray tracts have no analysis data (they are not zero).
- **Road corridors** – all road classes (TIGER/Line), colored by child-involved fatal crashes, crashes per road mile, child fatalities, or child pedestrian/cyclist deaths.
- **School buffers** – clustered national school circles; zoom in for individual schools with the two-mile buffer, filtered-area comparisons, and optional overlays:
  - *Crashes assigned to this school*: black-outlined dots, filled pale orange/orange / dark red for 0 / 1 / 2+ child deaths in the crash.
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
| `tracts.csv` | 69,120 tracts: counts, rates per 10,000 children, five Street View tertiles, `child_total`|
| `crashes.csv` | 37,412 child-involved fatal crashes with a valid location, plus `school_id` (nearest school within 2 miles) |
| `schools.csv` | 76,056 schools in the manuscript sample, with indicators and study outcomes |
| `roads.geojson` | TIGER/Line road corridors with matched crash outcomes (44,996 corridors) |
| `tract-shapes/state-XX.geojson` | State-split 2019 tract geometry |
| `counties.geojson`, `states.geojson`, `state-bounds.json` | County shapes, state outlines, map bounds |
| `metadata.json` | Record counts and geography notes |

See `data/README.md` for details.


## Publish with GitHub Pages

Push this folder as the repository root. In the repository open **Settings → Pages**, choose **Deploy from a branch**, and select the `main` branch, root folder. Paths are relative, so no code change is needed. The `.nojekyll` file tells Pages to serve the files as-is.



## Data sources

- Fatality Analysis Reporting System (FARS), 2017–2023
- U.S. Census Bureau 2019 cartographic boundary files and ACS 2015–2019 (NHGIS)
- U.S. Census Bureau TIGER/Line roads
- National Center for Education Statistics Common Core of Data (school locations, enrollment)
- Study-prepared Google Street View built-environment indicators
- Basemap: Esri; map libraries: Leaflet and D3
