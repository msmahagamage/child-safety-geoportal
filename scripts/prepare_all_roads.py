"""Build the road-corridor layer from ALL Census TIGER/Line roads (not only primary roads).

What it does
  1. Reads data/build/crashes-full.csv (all child-involved fatal crashes with a valid location).
  2. For every county that has crashes, downloads the county "All Roads" shapefile
     (tl_<year>_<county>_roads.zip: interstates, highways, arterials, local streets...)
     from the Census Bureau and caches it in downloads/TIGER/roads/.
  3. Snaps each crash to the nearest road edge within SNAP_METERS (projected metres,
     EPSG:5070); farther crashes stay unmatched.
  4. Groups edges into road corridors (one named road, LINEARID, within a county) and
     keeps every corridor with at least one matched crash, plus primary roads without
     crashes as faint background.
  5. Writes data/roads.geojson (same properties the web app already reads)
     and updates data/metadata.json.

Needs: pip install pyshp shapely pyproj   (see requirements-data.txt)
Needs internet access for the first run (a few GB for the whole country; every
county file is downloaded once). Try one state first:

    python scripts/prepare_all_roads.py --states 01          # Alabama only (test)
    python scripts/prepare_all_roads.py                      # entire country

NOTE: written against the documented TIGER file layout; run a single state first
and check the output before running nationwide.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import time
import urllib.error
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

import shapefile
from pyproj import Transformer
from shapely.geometry import MultiLineString, Point, mapping, shape as shapely_shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

APP_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = APP_DIR / "data"
CRASH_PATH = DATA_DIR / "build" / "crashes-full.csv"
OUTPUT_PATH = DATA_DIR / "roads.geojson"
METADATA_PATH = DATA_DIR / "metadata.json"
CACHE_DIR = APP_DIR.parent / "downloads" / "TIGER" / "roads"
URL = "https://www2.census.gov/geo/tiger/TIGER{year}/ROADS/tl_{year}_{county}_roads.zip"
YEARS = (2026, 2025, 2024)

SNAP_METERS = 40.0           # crash-to-road matching distance
CRASH_SIMPLIFY_DEGREES = 0.00015   # ~15 m: keeps street shapes, drops excess vertices
CONTEXT_SIMPLIFY_DEGREES = 0.0015  # background primary roads
COORDINATE_DECIMALS = 5
PRIMARY_CLASS = "S1100"

TO_METRES = Transformer.from_crs("EPSG:4269", "EPSG:5070", always_xy=True).transform


def number(row: dict, key: str) -> int:
    try:
        return int(float(row.get(key, "0") or 0))
    except ValueError:
        return 0


def download_county(county_fips: str) -> Path | None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = CACHE_DIR / f"{county_fips}_roads.zip"
    if cached.exists() and cached.stat().st_size > 0:
        return cached
    for year in YEARS:
        url = URL.format(year=year, county=county_fips)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=120) as response:
                    cached.write_bytes(response.read())
                return cached
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    break  # try the next year
                time.sleep(2 * (attempt + 1))
            except (urllib.error.URLError, TimeoutError):
                time.sleep(2 * (attempt + 1))
    return None


def read_county_roads(zip_path: Path):
    with zipfile.ZipFile(zip_path) as archive:
        base = next(name[:-4] for name in archive.namelist() if name.endswith(".shp"))
        reader = shapefile.Reader(
            shp=io.BytesIO(archive.read(base + ".shp")),
            shx=io.BytesIO(archive.read(base + ".shx")),
            dbf=io.BytesIO(archive.read(base + ".dbf")),
        )
        names = [field.name for field in reader.fields[1:]]
        index = {name: names.index(name) for name in ("LINEARID", "FULLNAME", "RTTYP", "MTFCC")}
        for shape_record in reader.iterShapeRecords():
            record = shape_record.record
            if shape_record.shape.shapeType == 0:
                continue
            yield {
                "linearid": str(record[index["LINEARID"]]),
                "name": str(record[index["FULLNAME"]] or "").strip(),
                "route_type": str(record[index["RTTYP"]] or ""),
                "road_class": str(record[index["MTFCC"]] or ""),
                "geometry": shapely_shape(shape_record.shape.__geo_interface__),
            }


def round_coordinates(coordinates):
    if isinstance(coordinates[0], (int, float)):
        return [round(coordinates[0], COORDINATE_DECIMALS), round(coordinates[1], COORDINATE_DECIMALS)]
    return [round_coordinates(item) for item in coordinates]


def to_geojson_geometry(geometry, tolerance: float) -> dict:
    simplified = geometry.simplify(tolerance, preserve_topology=True)
    result = mapping(simplified)
    return {"type": result["type"], "coordinates": round_coordinates(result["coordinates"])}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--states", nargs="*", help="two-digit state FIPS codes to process (default: all)")
    parser.add_argument("--no-context", action="store_true", help="omit primary roads that have no crashes")
    arguments = parser.parse_args()

    crashes_by_county: dict[str, list[dict]] = defaultdict(list)
    crash_count = 0
    with CRASH_PATH.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            county = str(row["county_fips"]).zfill(5)
            if arguments.states and county[:2] not in arguments.states:
                continue
            crashes_by_county[county].append(row)
            crash_count += 1
    counties = sorted(crashes_by_county)
    print(f"{crash_count:,} crashes in {len(counties):,} counties", flush=True)

    features: list[dict] = []
    matched_total = 0
    corridors_with_crashes = 0
    skipped: list[str] = []
    for position, county in enumerate(counties, start=1):
        zip_path = download_county(county)
        if zip_path is None:
            skipped.append(county)
            print(f"[{position}/{len(counties)}] {county}: no road file found, skipped", flush=True)
            continue
        edges = list(read_county_roads(zip_path))
        if not edges:
            continue
        projected = [transform(TO_METRES, edge["geometry"]) for edge in edges]
        tree = STRtree(projected)

        outcomes: dict[str, dict[str, int]] = defaultdict(
            lambda: {"child_crashes": 0, "child_count": 0, "child_deaths": 0, "ped_cyclist_deaths": 0}
        )
        for row in crashes_by_county[county]:
            x, y = TO_METRES(float(row["longitude"]), float(row["latitude"]))
            matches = tree.query_nearest(Point(x, y), max_distance=SNAP_METERS, all_matches=False)
            if len(matches) == 0:
                continue
            linearid = edges[int(matches[0])]["linearid"]
            matched_total += 1
            outcomes[linearid]["child_crashes"] += 1
            outcomes[linearid]["child_count"] += number(row, "child_count")
            outcomes[linearid]["child_deaths"] += number(row, "child_deaths")
            outcomes[linearid]["ped_cyclist_deaths"] += number(row, "ped_cyclist_deaths")

        groups: dict[str, list[int]] = defaultdict(list)
        for edge_index, edge in enumerate(edges):
            keep = edge["linearid"] in outcomes or (not arguments.no_context and edge["road_class"] == PRIMARY_CLASS)
            if keep:
                groups[edge["linearid"]].append(edge_index)

        for linearid, edge_indexes in groups.items():
            first = edges[edge_indexes[0]]
            values = outcomes.get(linearid) or {"child_crashes": 0, "child_count": 0, "child_deaths": 0, "ped_cyclist_deaths": 0}
            geometry = unary_union([edges[i]["geometry"] for i in edge_indexes])
            length_miles = max(0.01, sum(projected[i].length for i in edge_indexes) / 1609.344)
            has_crashes = values["child_crashes"] > 0
            if has_crashes:
                corridors_with_crashes += 1
            label = first["name"] or ("Unnamed primary road" if first["road_class"] == PRIMARY_CLASS else "Unnamed road")
            features.append({
                "type": "Feature",
                "properties": {
                    "linearid": linearid,
                    "name": label,
                    "route_type": first["route_type"],
                    "road_class": first["road_class"],
                    "state_fips": county[:2],
                    "county_fips": county,
                    "length_miles": round(length_miles, 2),
                    **values,
                    "crashes_per_mile": round(values["child_crashes"] / length_miles, 3),
                },
                "geometry": to_geojson_geometry(geometry, CRASH_SIMPLIFY_DEGREES if has_crashes else CONTEXT_SIMPLIFY_DEGREES),
            })
        print(f"[{position}/{len(counties)}] {county}: {len(edges):,} edges, "
              f"{sum(v['child_crashes'] for v in outcomes.values())} crashes matched", flush=True)

    collection = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "Census TIGER/Line All Roads (county files)",
            "scope": "All road classes; corridors with matched crashes plus primary roads as background",
            "snap_distance_meters": SNAP_METERS,
            "crash_records": crash_count,
            "matched_crashes": matched_total,
            "road_features": len(features),
            "road_features_with_crashes": corridors_with_crashes,
            "counties_skipped": skipped,
        },
        "features": features,
    }
    with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as output:
        json.dump(collection, output, ensure_ascii=False, separators=(",", ":"))

    if METADATA_PATH.exists():
        metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
        metadata.update({
            "road_scope": "Census TIGER/Line All Roads",
            "road_feature_count": len(features),
            "road_feature_count_with_crashes": corridors_with_crashes,
            "road_matched_crash_count": matched_total,
        })
        METADATA_PATH.write_text(json.dumps(metadata, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"Wrote {len(features):,} road corridors; {matched_total:,} of {crash_count:,} crashes matched "
          f"to {corridors_with_crashes:,} corridors. Output: {OUTPUT_PATH}", flush=True)


if __name__ == "__main__":
    main()
