"""Create slim browser-ready CSVs containing only the columns app.js reads.

Source files are left untouched; the app loads the *.min.csv versions.
Run from the project folder:  python scripts/make_slim_csv.py
"""
import csv
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"

JOBS = {
    "census-tracts.csv": (
        "census-tracts.min.csv",
        ["GEOID", "fatal_collisions_with_children", "children_fatalities", "ped_cycle_children_fatalities",
         "fatal_collisions_with_children_p10k", "children_fatalities_p10k", "ped_cycle_children_fatalities_p10k",
         "tertsidewalk", "tertsinglelane", "tertstreetlight", "tertgreen"],
    ),
    "schools-enhanced.csv": (
        "schools-enhanced.min.csv",
        ["ncesid_t", "school_name", "latitude", "longitude", "state_fips", "county_fips", "zip_code",
         "prop_sidewalk", "prop_single_lane", "avg_stopsign", "prop_green", "prop_streetlight"],
    ),
    "child-crashes.csv": (
        "child-crashes.min.csv",
        ["crash_id", "latitude", "longitude", "year", "hour", "state_name", "county_name", "county_fips",
         "child_count", "child_deaths", "ped_cyclist_deaths", "age_0_9", "age_10_14", "age_15_17"],
    ),
}


for source, (target, columns) in JOBS.items():
    with open(DATA / source, newline="", encoding="utf-8") as src, \
            open(DATA / target, "w", newline="", encoding="utf-8") as dst:
        reader = csv.DictReader(src)
        writer = csv.writer(dst, lineterminator="\n")
        writer.writerow(columns)
        count = 0
        seen = set()  # exact duplicate rows are written only once
        for row in reader:
            out = []
            for column in columns:
                value = row.get(column, "")
                if column in ("latitude", "longitude") and value:
                    value = f"{float(value):.5f}".rstrip("0").rstrip(".")
                elif column not in ("GEOID", "ncesid_t", "tract_id", "county_fips", "state_fips", "zip_code",
                                    "crash_id", "school_name", "state_name", "county_name") and value:
                    try:
                        value = f"{float(value):.4g}"
                    except ValueError:
                        pass
                out.append(value)
            key = tuple(out)
            if key in seen:
                continue
            seen.add(key)
            writer.writerow(out)
            count += 1
    print(f"{target}: {count} rows, {(DATA / target).stat().st_size / 1e6:.1f} MB "
          f"(was {(DATA / source).stat().st_size / 1e6:.1f} MB)")
