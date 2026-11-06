"""Select the schools in the manuscript's analytic sample and their study outcomes.

Reproduces school_regression.ipynb:
  public schools in the NCES CCD file (same location in 2017-18 and 2022-23)
  + Street View indicators available
  + the school's 2019 census tract (point-in-polygon on the cb_2019_us_tract_500k
    shapefile, as in the notebook's GeoPandas join) has complete covariates
  + 2023 enrollment >= 25                                  -> N = 76,058 rows.
Outcomes follow the notebook: each fatal crash with a child (AGE < 18) belongs to
its single nearest school within two miles (fars_school_nearest_2mi.csv).

Writes (both are build artifacts, not committed):
  data/build/analysis-school-ids.txt   NCES IDs of analysis schools
  data/build/school-study-outcomes.csv per-school study crashes / child deaths / ped-cyclist deaths

Pure Python plus pandas, no GeoPandas needed (takes a few minutes).
Run from the app directory:   python scripts/select_analysis_schools.py
"""

import collections
import io
import math
import struct
import zipfile
from pathlib import Path

import pandas as pd

APP_DIR = Path(__file__).resolve().parents[1]
SOURCE_DIR = APP_DIR.parent / "COLLISIONS INVOLVING CHILDREN" / "COLLISIONS INVOLVING CHILDREN"
DATA_SRC = SOURCE_DIR / "Data"
ARCHIVE = SOURCE_DIR / "child_collisions_gsv_code_and_data.zip"
TRACT_BASE = "child_collisions_gsv/data/cb_2019_us_tract_500k/cb_2019_us_tract_500k."
TRACT_TABLE = "child_collisions_gsv/data/regression_dataframes/cetract_raw.csv"
NEAREST = "child_collisions_gsv/data/FARS/fars_school_nearest_2mi.csv"
PERSON = DATA_SRC / "FARS" / "combined_person_2017_2023.csv"
IDS_OUT = APP_DIR / "data" / "build" / "analysis-school-ids.txt"
OUTCOMES_OUT = APP_DIR / "data" / "build" / "school-study-outcomes.csv"
PREDICTORS = ["member2023", "pblack2023", "phisp2023", "ptotfrl2018", "elem2023", "middle2023", "high2023"]


def signed_area(ring):
    return sum(ring[i][0] * ring[i - 1][1] - ring[i - 1][0] * ring[i][1] for i in range(len(ring))) / 2


def read_tracts(archive):
    """Minimal polygon shapefile reader: returns GEOID/rings/bbox plus a 0.25-degree grid index."""
    dbf = archive.read(TRACT_BASE + "dbf")
    count, header_length, record_length = struct.unpack("<IHH", dbf[4:12])
    position, offset, geoid_field = 32, 1, None
    while dbf[position] != 0x0D:
        name = dbf[position:position + 11].split(b"\0")[0].decode()
        length = dbf[position + 16]
        if name == "GEOID":
            geoid_field = (offset, length)
        offset += length
        position += 32
    geoids = [
        dbf[header_length + i * record_length + geoid_field[0]:header_length + i * record_length + geoid_field[0] + geoid_field[1]].decode().strip()
        for i in range(count)
    ]
    shp = archive.read(TRACT_BASE + "shp")
    position, tracts, grid = 100, [], collections.defaultdict(list)
    for i in range(count):
        _, content_words = struct.unpack(">ii", shp[position:position + 8])
        body = shp[position + 8:position + 8 + content_words * 2]
        position += 8 + content_words * 2
        if struct.unpack("<i", body[:4])[0] == 0:
            tracts.append((geoids[i], [], 0, 0, 0, 0))
            continue
        xmin, ymin, xmax, ymax = struct.unpack("<4d", body[4:36])
        parts_count, points_count = struct.unpack("<ii", body[36:44])
        parts = list(struct.unpack(f"<{parts_count}i", body[44:44 + 4 * parts_count])) + [points_count]
        coords = struct.unpack(f"<{2 * points_count}d", body[44 + 4 * parts_count:44 + 4 * parts_count + 16 * points_count])
        rings = []
        for j in range(parts_count):
            ring = [(coords[2 * k], coords[2 * k + 1]) for k in range(parts[j], parts[j + 1])]
            rings.append((ring, signed_area(ring) > 0))  # clockwise rings are outer rings in a shapefile
        index = len(tracts)
        tracts.append((geoids[i], rings, xmin, xmax, ymin, ymax))
        for gx in range(math.floor(xmin * 4), math.floor(xmax * 4) + 1):
            for gy in range(math.floor(ymin * 4), math.floor(ymax * 4) + 1):
                grid[(gx, gy)].append(index)
    return tracts, grid


def in_ring(x, y, ring):
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def main():
    with zipfile.ZipFile(ARCHIVE) as archive:
        tracts, grid = read_tracts(archive)
        with archive.open(TRACT_TABLE) as raw:
            tract_ids = set(pd.read_csv(io.TextIOWrapper(raw, encoding="utf-8-sig"), dtype={"GEOID": str}).GEOID.str.zfill(11))
        with archive.open(NEAREST) as raw:
            nearest = pd.read_csv(raw).dropna().drop_duplicates("CrashID")

    def find_tract(x, y):
        for i in grid.get((math.floor(x * 4), math.floor(y * 4)), []):
            geoid, rings, x0, x1, y0, y1 = tracts[i]
            if x0 <= x <= x1 and y0 <= y <= y1:
                depth = sum((1 if outer else -1) for ring, outer in rings if in_ring(x, y, ring))
                if depth > 0:
                    return geoid
        return None

    ccd = pd.read_csv(DATA_SRC / "NCES Common Core Data 2017-18 and 2022-23" / "ccd_17_23.csv",
                      sep="\t", low_memory=False).rename(columns={"ncessch": "NCESID"})
    schools = ccd[["NCESID", "loncod2023", "latcod2023"] + PREDICTORS].copy()
    schools["lon"] = pd.to_numeric(schools.loncod2023, errors="coerce")
    schools["lat"] = pd.to_numeric(schools.latcod2023, errors="coerce")
    gsv = pd.read_csv(DATA_SRC / "indicators_all_school buffer_v2.txt", sep="\t", encoding="latin1")
    gsv = gsv.rename(columns={"NCESID_T": "NCESID"})
    indicators = gsv[["NCESID", "prop_streetlight", "prop_sidewalk", "avg_stopsign", "prop_green",
                      "prop_single_lane"]].drop_duplicates()
    merged = schools.merge(indicators, on="NCESID", how="inner")
    merged["GEOID"] = [find_tract(x, y) if x == x and y == y else None for x, y in zip(merged.lon, merged.lat)]
    complete = merged[merged.GEOID.isin(tract_ids)].dropna(subset=PREDICTORS)
    final = complete[pd.to_numeric(complete.member2023, errors="coerce") >= 25]
    IDS_OUT.parent.mkdir(parents=True, exist_ok=True)
    ids = sorted(set(final.NCESID.astype("int64").astype(str)))
    IDS_OUT.write_text("\n".join(ids) + "\n", encoding="utf-8")
    print(f"{len(final):,} school rows ({len(ids):,} unique IDs); manuscript N = 76,058")

    # Study outcomes per school (notebook rule: nearest school within 2 miles).
    people = pd.read_csv(PERSON, usecols=["CrashID", "AGE", "INJ_SEV", "PER_TYP"], low_memory=False)
    children = people[people.AGE < 18].copy()
    children["school_id"] = children.CrashID.map(nearest.set_index("CrashID")["NCESID"].to_dict())
    children = children.dropna(subset=["school_id"])
    children["school_id"] = children.school_id.astype("int64").astype(str)
    children["death"] = (children.INJ_SEV == 4).astype(int)
    children["ped_death"] = ((children.INJ_SEV == 4) & children.PER_TYP.isin([5, 6])).astype(int)
    per_school = children.groupby("school_id").agg(
        study_crashes=("CrashID", "nunique"), study_child_deaths=("death", "sum"), study_ped_deaths=("ped_death", "sum"),
    )
    per_school = per_school.loc[per_school.index.isin(ids)]
    per_school.to_csv(OUTCOMES_OUT)
    print(per_school.sum().to_dict(), "(before enrollment filter the manuscript reports 19,830 / 7,500 / 1,701)")


if __name__ == "__main__":
    main()
