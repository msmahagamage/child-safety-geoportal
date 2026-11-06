"""Build compact, browser-ready map assets from the study source files.

Run from the app directory:
    python scripts/prepare_web_data.py

The script deliberately keeps the large source shapefiles and FARS tables out
of the web app. It writes state-split tract geometry, simplified county
geometry, an enriched school table, and one row per child-involved fatal crash.
"""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path
import zipfile

import pandas as pd


APP_DIR = Path(__file__).resolve().parents[1]
WORKSPACE = APP_DIR.parent
SOURCE_DIR = WORKSPACE / "COLLISIONS INVOLVING CHILDREN" / "COLLISIONS INVOLVING CHILDREN"
DATA_DIR = APP_DIR / "data"
BUILD_DIR = DATA_DIR / "build"
TRACT_DIR = DATA_DIR / "tract-shapes"

ARCHIVE_PATH = SOURCE_DIR / "child_collisions_gsv_code_and_data.zip"
TRACT_ARCHIVE_BASE = "child_collisions_gsv/data/cb_2019_us_tract_500k/cb_2019_us_tract_500k."
PERSON_PATH = SOURCE_DIR / "Data" / "FARS" / "combined_person_2017_2023.csv"
ACCIDENT_PATH = SOURCE_DIR / "Data" / "FARS" / "combined_accident_2017_2023.csv"
SCHOOL_PATH = SOURCE_DIR / "Data" / "school buffer_2mi_madusha_v2.dta"


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as output:
        json.dump(value, output, ensure_ascii=False, separators=(",", ":"))


def projected_point(longitude: float, latitude: float) -> tuple[float, float]:
    """Return Web Mercator normalized coordinates for fast canvas drawing."""
    import math

    clamped_latitude = max(-85.0511, min(85.0511, latitude))
    sine_latitude = math.sin(math.radians(clamped_latitude))
    return (
        (longitude + 180) / 360,
        0.5 - math.log((1 + sine_latitude) / (1 - sine_latitude)) / (4 * math.pi),
    )


def build_child_crashes() -> pd.DataFrame:
    print("Preparing child-involved fatal crash locations...", flush=True)
    grouped_chunks: list[pd.DataFrame] = []
    usecols = ["CrashID", "AGE", "INJ_SEV", "PER_TYP"]

    for chunk in pd.read_csv(PERSON_PATH, usecols=usecols, chunksize=250_000, low_memory=False):
        age = pd.to_numeric(chunk["AGE"], errors="coerce")
        injury = pd.to_numeric(chunk["INJ_SEV"], errors="coerce")
        person_type = pd.to_numeric(chunk["PER_TYP"], errors="coerce")
        children = chunk.loc[age < 18, ["CrashID"]].copy()
        child_age = age.loc[children.index]
        children["child_count"] = 1
        children["child_deaths"] = (injury.loc[children.index] == 4).astype("int8")
        children["ped_cyclist_deaths"] = (
            (injury.loc[children.index] == 4) & person_type.loc[children.index].isin([5, 6])
        ).astype("int8")
        children["age_0_9"] = (child_age <= 9).astype("int8")
        children["age_10_14"] = child_age.between(10, 14).astype("int8")
        children["age_15_17"] = child_age.between(15, 17).astype("int8")
        grouped_chunks.append(children.groupby("CrashID", as_index=False).agg({
            "child_count": "sum",
            "child_deaths": "sum",
            "ped_cyclist_deaths": "sum",
            "age_0_9": "max",
            "age_10_14": "max",
            "age_15_17": "max",
        }))

    child_outcomes = pd.concat(grouped_chunks, ignore_index=True).groupby("CrashID", as_index=False).agg({
        "child_count": "sum",
        "child_deaths": "sum",
        "ped_cyclist_deaths": "sum",
        "age_0_9": "max",
        "age_10_14": "max",
        "age_15_17": "max",
    })
    child_outcomes["child_crashes"] = 1

    accident_columns = [
        "CrashID", "ST_CASE", "COUNTY", "COUNTYNAME", "STATENAME", "YEAR", "HOUR",
        "LGT_COND", "LGT_CONDNAME", "RUR_URB", "RUR_URBNAME", "LATITUDE", "LONGITUD", "cetract",
    ]
    accidents = pd.read_csv(ACCIDENT_PATH, usecols=accident_columns, low_memory=False)
    crashes = accidents.merge(child_outcomes, on="CrashID", how="inner", validate="one_to_one")
    # Keep every child-involved fatal crash with a valid location. Crashes in tracts
    # outside the manuscript's tract sample (missing covariates / no children) stay
    # on the crash-density, road and school views; the tract layer alone follows
    # the manuscript's N = 63,565 sample.
    crashes["tract_id"] = pd.to_numeric(crashes["cetract"], errors="coerce").astype("Int64").astype(str).str.zfill(11)
    crashes["latitude"] = pd.to_numeric(crashes["LATITUDE"], errors="coerce")
    crashes["longitude"] = pd.to_numeric(crashes["LONGITUD"], errors="coerce")
    crashes = crashes[
        crashes["latitude"].between(15, 72)
        & crashes["longitude"].between(-180, -50)
    ].copy()

    state_fips = crashes["ST_CASE"].astype("Int64").astype(str).str.zfill(6).str[:2]
    county_fips = pd.to_numeric(crashes["COUNTY"], errors="coerce").astype("Int64").astype(str).str.zfill(3)
    crashes["county_fips"] = state_fips + county_fips

    output_columns = {
        "CrashID": "crash_id",
        "YEAR": "year",
        "HOUR": "hour",
        "LGT_COND": "light_condition",
        "LGT_CONDNAME": "light_condition_name",
        "RUR_URB": "urbanicity",
        "RUR_URBNAME": "urbanicity_name",
        "STATENAME": "state_name",
        "COUNTYNAME": "county_name",
    }
    crashes = crashes.rename(columns=output_columns)
    columns = [
        "crash_id", "latitude", "longitude", "year", "hour", "light_condition",
        "light_condition_name", "urbanicity", "urbanicity_name", "state_name", "county_name",
        "county_fips", "child_crashes", "child_count", "child_deaths", "ped_cyclist_deaths",
        "age_0_9", "age_10_14", "age_15_17", "tract_id",
    ]
    crashes[columns].to_csv(BUILD_DIR / "crashes-full.csv", index=False, encoding="utf-8")
    print(f"  wrote {len(crashes):,} crash locations", flush=True)
    return crashes


def build_schools() -> int:
    print("Preparing enriched school records...", flush=True)
    schools = pd.read_stata(SCHOOL_PATH, convert_categoricals=False)
    schools = schools.rename(columns={
        "name": "school_name",
        "stateid": "state_fips",
        "countyid": "county_fips",
        "zipecode": "zip_code",
        "tractid": "tract_id",
    })
    schools["ncesid_t"] = schools["ncesid_t"].astype(str).str.replace(r"\.0$", "", regex=True)
    columns = [
        "ncesid_t", "school_name", "latitude", "longitude", "state_fips", "county_fips", "zip_code", "tract_id",
        "prop_sidewalk", "prop_single_lane", "avg_stopsign", "prop_green", "prop_streetlight",
        "crosswal_2", "prop_visible_wire",
    ]
    schools[columns].to_csv(BUILD_DIR / "schools-full.csv", index=False, encoding="utf-8")
    print(f"  wrote {len(schools):,} school records", flush=True)
    return len(schools)


def tract_data_ids() -> set[str]:
    with (DATA_DIR / "tracts.csv").open(encoding="utf-8-sig", newline="") as source:
        return {row["GEOID"].strip() for row in csv.DictReader(source)}


def build_boundaries(crashes: pd.DataFrame) -> dict[str, object]:
    import shapefile  # heavy mapping libraries are only needed for boundary building
    from shapely.geometry import mapping, shape as shapely_shape
    from shapely.ops import unary_union

    print("Preparing state-split tracts and county boundaries...", flush=True)
    TRACT_DIR.mkdir(parents=True, exist_ok=True)
    app_ids = tract_data_ids()
    county_counts = crashes.groupby("county_fips", dropna=False).agg({
        "child_crashes": "sum",
        "child_deaths": "sum",
        "ped_cyclist_deaths": "sum",
    }).to_dict("index")
    county_names = (
        crashes.dropna(subset=["county_fips", "county_name"])
        .drop_duplicates("county_fips")
        .set_index("county_fips")["county_name"]
        .astype(str)
        .to_dict()
    )

    with zipfile.ZipFile(ARCHIVE_PATH) as archive:
        reader = shapefile.Reader(
            shp=io.BytesIO(archive.read(TRACT_ARCHIVE_BASE + "shp")),
            shx=io.BytesIO(archive.read(TRACT_ARCHIVE_BASE + "shx")),
            dbf=io.BytesIO(archive.read(TRACT_ARCHIVE_BASE + "dbf")),
        )

        field_names = [field.name for field in reader.fields[1:]]
        indexes = {name: field_names.index(name) for name in ["STATEFP", "COUNTYFP", "GEOID", "NAME"]}
        county_geometries: dict[str, list] = {}
        county_features: list[dict[str, object]] = []
        state_index: dict[str, dict[str, object]] = {}
        state_counts: dict[str, int] = {}

        state_handles: dict[str, io.TextIOWrapper] = {}
        try:
            for shape_record in reader.iterShapeRecords():
                record = shape_record.record
                state_fips = str(record[indexes["STATEFP"]]).zfill(2)
                county_fips = state_fips + str(record[indexes["COUNTYFP"]]).zfill(3)
                geoid = str(record[indexes["GEOID"]]).zfill(11)
                geometry = shapely_shape(shape_record.shape.__geo_interface__)
                county_geometries.setdefault(county_fips, []).append(geometry)

                bounds = state_index.setdefault(state_fips, {
                    "west": shape_record.shape.bbox.xmin,
                    "south": shape_record.shape.bbox.ymin,
                    "east": shape_record.shape.bbox.xmax,
                    "north": shape_record.shape.bbox.ymax,
                })
                bounds["west"] = min(bounds["west"], shape_record.shape.bbox.xmin)
                bounds["south"] = min(bounds["south"], shape_record.shape.bbox.ymin)
                bounds["east"] = max(bounds["east"], shape_record.shape.bbox.xmax)
                bounds["north"] = max(bounds["north"], shape_record.shape.bbox.ymax)

                simplified = geometry.simplify(0.0015, preserve_topology=True)
                feature = {
                    "type": "Feature",
                    "properties": {
                        "geoid": geoid,
                        "name": str(record[indexes["NAME"]]),
                        "has_data": geoid in app_ids,
                    },
                    "geometry": mapping(simplified),
                }
                if state_fips not in state_handles:
                    state_handles[state_fips] = (TRACT_DIR / f".{state_fips}.ndjson").open(
                        "w", encoding="utf-8", newline="\n"
                    )
                    state_counts[state_fips] = 0
                state_handles[state_fips].write(json.dumps(feature, ensure_ascii=False, separators=(",", ":")) + "\n")
                state_counts[state_fips] += 1
        finally:
            for handle in state_handles.values():
                handle.close()

        for state_fips in sorted(state_counts):
            part_path = TRACT_DIR / f".{state_fips}.ndjson"
            output_path = TRACT_DIR / f"state-{state_fips}.geojson"
            with output_path.open("w", encoding="utf-8", newline="") as output:
                output.write('{"type":"FeatureCollection","features":[')
                first = True
                with part_path.open(encoding="utf-8") as rows:
                    for row in rows:
                        if not first:
                            output.write(",")
                        output.write(row.rstrip("\n"))
                        first = False
                output.write("]}")
            part_path.unlink(missing_ok=True)

        for county_fips in sorted(county_geometries):
            county_geometry = unary_union(county_geometries[county_fips]).simplify(0.006, preserve_topology=True)
            outcomes = county_counts.get(county_fips, {})
            county_features.append({
                "type": "Feature",
                "properties": {
                    "county_fips": county_fips,
                    "name": county_names.get(county_fips, f"County {county_fips}"),
                    "child_crashes": int(outcomes.get("child_crashes", 0)),
                    "child_deaths": int(outcomes.get("child_deaths", 0)),
                    "ped_cyclist_deaths": int(outcomes.get("ped_cyclist_deaths", 0)),
                },
                "geometry": mapping(county_geometry),
            })

    write_json(DATA_DIR / "counties.geojson", {
        "type": "FeatureCollection",
        "features": county_features,
    })
    write_json(DATA_DIR / "state-bounds.json", state_index)
    print(f"  wrote {sum(state_counts.values()):,} tracts across {len(state_counts)} files", flush=True)
    print(f"  wrote {len(county_features):,} county boundaries", flush=True)
    return {
        "tract_boundary_count": sum(state_counts.values()),
        "tract_data_count": len(app_ids),
        "county_count": len(county_features),
        "state_tract_counts": state_counts,
    }


def build_state_boundaries() -> int:
    """Dissolve original tract geometry into clean, lightweight state outlines.

    State outlines must not be built from the already-simplified county file:
    independently simplified counties leave small gaps that render as broken
    internal seams at national scale.
    """
    import shapefile
    from shapely.geometry import mapping, shape as shapely_shape
    from shapely.ops import unary_union

    state_geometries: dict[str, list] = {}
    with zipfile.ZipFile(ARCHIVE_PATH) as archive:
        reader = shapefile.Reader(
            shp=io.BytesIO(archive.read(TRACT_ARCHIVE_BASE + "shp")),
            shx=io.BytesIO(archive.read(TRACT_ARCHIVE_BASE + "shx")),
            dbf=io.BytesIO(archive.read(TRACT_ARCHIVE_BASE + "dbf")),
        )
        field_names = [field.name for field in reader.fields[1:]]
        state_index = field_names.index("STATEFP")
        for shape_record in reader.iterShapeRecords():
            state_fips = str(shape_record.record[state_index]).zfill(2)
            state_geometries.setdefault(state_fips, []).append(
                shapely_shape(shape_record.shape.__geo_interface__)
            )
    features = []
    for state_fips in sorted(state_geometries):
        geometry = unary_union(state_geometries[state_fips]).simplify(0.003, preserve_topology=True)
        features.append({
            "type": "Feature",
            "properties": {"state_fips": state_fips},
            "geometry": mapping(geometry),
        })
    write_json(DATA_DIR / "states.geojson", {"type": "FeatureCollection", "features": features})
    print(f"  wrote {len(features):,} state boundaries", flush=True)
    return len(features)


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    crashes = build_child_crashes()
    school_count = build_schools()
    boundary_metadata = build_boundaries(crashes)
    state_count = build_state_boundaries()
    metadata = {
        "study_period": "2017-2023",
        "tract_vintage": 2019,
        "school_buffer_miles": 2,
        "child_crash_count": int(len(crashes)),
        "school_record_count": school_count,
        "state_boundary_count": state_count,
        **boundary_metadata,
    }
    write_json(DATA_DIR / "metadata.json", metadata)
    print("Web data preparation complete.", flush=True)


if __name__ == "__main__":
    main()
