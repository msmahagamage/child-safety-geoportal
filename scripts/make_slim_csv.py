"""Create slim browser-ready CSVs containing only the columns app.js reads.

Reads the full build files in data/build/ and writes the slim files the app loads:
  data/schools.csv and data/crashes.csv.
Run from the project folder:  python scripts/make_slim_csv.py
"""
import csv
import io
import zipfile
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
ARCHIVE = (DATA.parent.parent / "COLLISIONS INVOLVING CHILDREN" / "COLLISIONS INVOLVING CHILDREN"
           / "child_collisions_gsv_code_and_data.zip")
NEAREST_MEMBER = "child_collisions_gsv/data/FARS/fars_school_nearest_2mi.csv"


def nearest_school_by_crash() -> dict:
    """Study rule: each crash belongs to its single nearest school within 2 miles."""
    if not ARCHIVE.exists():
        return {}
    with zipfile.ZipFile(ARCHIVE) as archive, archive.open(NEAREST_MEMBER) as raw:
        pairs = {}
        for row in csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")):
            if row["NCESID"]:
                pairs[row["CrashID"]] = str(int(float(row["NCESID"])))
    return pairs


NEAREST = nearest_school_by_crash()

JOBS = {
    # Tract data comes from scripts/prepare_tract_data.py (manuscript sample, N = 63,565).
    "build/schools-full.csv": (
        "schools.csv",
        ["ncesid_t", "school_name", "latitude", "longitude", "state_fips", "county_fips", "zip_code",
         "prop_sidewalk", "prop_single_lane", "avg_stopsign", "prop_green", "prop_streetlight",
         "study_crashes", "study_child_deaths", "study_ped_deaths"],
    ),
    "build/crashes-full.csv": (
        "crashes.csv",
        ["crash_id", "latitude", "longitude", "year", "hour", "state_name", "county_name", "county_fips",
         "child_count", "child_deaths", "ped_cyclist_deaths", "age_0_9", "age_10_14", "age_15_17", "school_id"],
    ),
}


ID_FILE = DATA / "build" / "analysis-school-ids.txt"  # made by scripts/select_analysis_schools.py
school_ids = set(ID_FILE.read_text().split()) if ID_FILE.exists() else None
OUTCOME_FILE = DATA / "build" / "school-study-outcomes.csv"
STUDY_OUTCOMES = (
    {row["school_id"]: row for row in csv.DictReader(open(OUTCOME_FILE, encoding="utf-8"))}
    if OUTCOME_FILE.exists() else {}
)

for source, (target, columns) in JOBS.items():
    with open(DATA / source, newline="", encoding="utf-8") as src, \
            open(DATA / target, "w", newline="", encoding="utf-8") as dst:
        reader = csv.DictReader(src)
        writer = csv.writer(dst, lineterminator="\n")
        writer.writerow(columns)
        count = 0
        seen = set()  # exact duplicate rows are written only once
        for row in reader:
            if source == "build/schools-full.csv" and school_ids is not None:
                if str(row["ncesid_t"]).split(".")[0] not in school_ids:
                    continue  # keep only the manuscript's analytic school sample
            out = []
            if source == "build/crashes-full.csv":
                row["school_id"] = NEAREST.get(row["crash_id"], "")
            if source == "build/schools-full.csv":
                outcome = STUDY_OUTCOMES.get(str(row["ncesid_t"]).split(".")[0], {})
                for key in ("study_crashes", "study_child_deaths", "study_ped_deaths"):
                    row[key] = outcome.get(key, "0")
            for column in columns:
                value = row.get(column, "")
                if column in ("latitude", "longitude") and value:
                    value = f"{float(value):.5f}".rstrip("0").rstrip(".")
                elif column not in ("GEOID", "ncesid_t", "tract_id", "county_fips", "state_fips", "zip_code",
                                    "crash_id", "school_name", "state_name", "county_name", "school_id") and value:
                    try:
                        value = f"{float(value):.4g}"
                    except ValueError:
                        pass
                out.append(value)
            key = tuple(out)
            if source == "build/schools-full.csv":
                key = row["ncesid_t"]  # one row per school
            if key in seen:
                continue
            seen.add(key)
            writer.writerow(out)
            count += 1
    print(f"{target}: {count} rows, {(DATA / target).stat().st_size / 1e6:.1f} MB "
          f"(was {(DATA / source).stat().st_size / 1e6:.1f} MB)")
