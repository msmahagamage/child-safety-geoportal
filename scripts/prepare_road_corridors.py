"""Prepare a compact major-road crash-corridor layer for the web atlas.

The bundled Census road source is the national Primary Roads layer. It is
useful for an initial corridor view, but it does not contain every local street.
Crashes are assigned only when their coordinates fall within roughly 200 metres
of a primary-road feature; unmatched crashes remain represented by the density
and tract views.
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

import shapefile
from pyproj import Geod
from shapely.geometry import Point, mapping, shape as shapely_shape
from shapely.strtree import STRtree


APP_DIR = Path(__file__).resolve().parents[1]
WORKSPACE = APP_DIR.parent
DATA_DIR = APP_DIR / "data"
ROAD_PATH = WORKSPACE / "downloads" / "TIGER2026" / "primary_roads" / "tl_2026_us_primaryroads.shp"
CRASH_PATH = DATA_DIR / "build" / "crashes-full.csv"
OUTPUT_PATH = DATA_DIR / "roads.geojson"
METADATA_PATH = DATA_DIR / "metadata.json"
COUNTY_PATH = DATA_DIR / "counties.geojson"

# Coordinates are WGS 84. 0.002 degrees is approximately 150--220 metres in
# the conterminous United States and avoids assigning distant local-road events
# to a major highway merely because it is the nearest primary road.
MAX_SNAP_DISTANCE_DEGREES = 0.002
GEOD = Geod(ellps="WGS84")


def number(row: dict[str, str], key: str) -> int:
    try:
        return int(float(row.get(key, "0") or 0))
    except ValueError:
        return 0


def main() -> None:
    if not ROAD_PATH.exists():
        raise FileNotFoundError(f"Primary-road source not found: {ROAD_PATH}")
    if not CRASH_PATH.exists():
        raise FileNotFoundError(f"Prepared crash file not found: {CRASH_PATH}")

    print("Reading Census primary roads...", flush=True)
    reader = shapefile.Reader(str(ROAD_PATH))
    field_names = [field.name for field in reader.fields[1:]]
    field_index = {name: field_names.index(name) for name in ["LINEARID", "FULLNAME", "RTTYP", "MTFCC"]}
    shape_records = list(reader.iterShapeRecords())
    geometries = [shapely_shape(item.shape.__geo_interface__) for item in shape_records]
    tree = STRtree(geometries)

    county_features = json.loads(COUNTY_PATH.read_text(encoding="utf-8"))["features"]
    county_geometries = [shapely_shape(feature["geometry"]) for feature in county_features]
    county_tree = STRtree(county_geometries)

    outcomes: dict[int, dict[str, int]] = defaultdict(lambda: {
        "child_crashes": 0,
        "child_count": 0,
        "child_deaths": 0,
        "ped_cyclist_deaths": 0,
    })
    crash_count = 0
    matched_count = 0
    with CRASH_PATH.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            crash_count += 1
            point = Point(float(row["longitude"]), float(row["latitude"]))
            matches = tree.query_nearest(
                point,
                max_distance=MAX_SNAP_DISTANCE_DEGREES,
                all_matches=False,
            )
            if len(matches) == 0:
                continue
            road_index = int(matches[0])
            matched_count += 1
            outcomes[road_index]["child_crashes"] += 1
            outcomes[road_index]["child_count"] += number(row, "child_count")
            outcomes[road_index]["child_deaths"] += number(row, "child_deaths")
            outcomes[road_index]["ped_cyclist_deaths"] += number(row, "ped_cyclist_deaths")

    print("Writing browser road layer...", flush=True)
    features = []
    nonzero_count = 0
    for road_index, (item, geometry) in enumerate(zip(shape_records, geometries, strict=True)):
        record = item.record
        values = outcomes[road_index]
        length_miles = max(0.01, abs(GEOD.geometry_length(geometry)) / 1609.344)
        if values["child_crashes"]:
            nonzero_count += 1
        representative_point = geometry.interpolate(0.5, normalized=True)
        county_matches = county_tree.query(representative_point, predicate="intersects")
        county_fips = ""
        if len(county_matches):
            county_fips = str(county_features[int(county_matches[0])]["properties"]["county_fips"]).zfill(5)
        properties = {
            "linearid": str(record[field_index["LINEARID"]]),
            "name": str(record[field_index["FULLNAME"]] or "Unnamed primary road"),
            "route_type": str(record[field_index["RTTYP"]] or ""),
            "road_class": str(record[field_index["MTFCC"]] or ""),
            "state_fips": county_fips[:2],
            "county_fips": county_fips,
            "length_miles": round(length_miles, 2),
            **values,
            "crashes_per_mile": round(values["child_crashes"] / length_miles, 3),
        }
        features.append({
            "type": "Feature",
            "properties": properties,
            "geometry": mapping(geometry.simplify(0.0015, preserve_topology=True)),
        })

    collection = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "2026 Census TIGER/Line Primary Roads",
            "scope": "Primary roads only; local and secondary streets are not included",
            "snap_distance_degrees": MAX_SNAP_DISTANCE_DEGREES,
            "crash_records": crash_count,
            "matched_crashes": matched_count,
            "road_features": len(features),
            "road_features_with_crashes": nonzero_count,
        },
        "features": features,
    }
    with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as output:
        json.dump(collection, output, ensure_ascii=False, separators=(",", ":"))

    if METADATA_PATH.exists():
        metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
        metadata.update({
            "road_vintage": 2026,
            "road_scope": "Census TIGER/Line Primary Roads",
            "road_feature_count": len(features),
            "road_feature_count_with_crashes": nonzero_count,
            "road_matched_crash_count": matched_count,
        })
        with METADATA_PATH.open("w", encoding="utf-8", newline="") as output:
            json.dump(metadata, output, ensure_ascii=False, separators=(",", ":"))

    print(
        f"  wrote {len(features):,} primary-road features; "
        f"{matched_count:,} of {crash_count:,} crashes matched to {nonzero_count:,} features",
        flush=True,
    )


if __name__ == "__main__":
    main()
