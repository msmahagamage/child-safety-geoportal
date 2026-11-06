# Data files

Everything the web app loads. All of it is built by the scripts in `../scripts`.

| File | What it is | Rows | Built by |
|---|---|---|---|
| `tracts.csv` | One row per census tract: child-involved fatal collisions, child deaths, pedestrian/cyclist child deaths, rates per 10,000 children, sidewalk / single-lane / streetlight / greenness / stop-sign tertiles, children (2019 ACS), `in_sample` (1 = manuscript regression sample) | 69,120 | `prepare_tract_data.py` |
| `crashes.csv` | One row per child-involved fatal crash with a valid location (year, hour, county, deaths, age groups, `school_id` of the nearest school within 2 miles) | 37,412 | `prepare_web_data.py`, `make_slim_csv.py` |
| `schools.csv` | Schools in the manuscript sample: location, ZIP, five street-view indicators, study crashes and deaths | 76,056 | `prepare_web_data.py`, `select_analysis_schools.py`, `make_slim_csv.py` |
| `roads.geojson` | Road corridors with matched child-involved crashes | see file | `prepare_road_corridors.py` or `prepare_all_roads.py` |
| `tract-shapes/state-XX.geojson` | 2019 census-tract boundaries, one file per state (XX = state FIPS code) | 56 files | `prepare_web_data.py` |
| `counties.geojson` | County boundaries | 3,233 | `prepare_web_data.py` |
| `states.geojson` | State outlines for the national map | 56 | `prepare_web_data.py` |
| `state-bounds.json` | Map bounds of each state, used for zooming | 56 | `prepare_web_data.py` |
| `metadata.json` | Record counts and geography notes | - | the scripts above |
| `build/` | Large intermediate files used only to rebuild the files above (not committed to GitHub) | - | `prepare_web_data.py`, `select_analysis_schools.py` |
