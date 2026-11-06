"""Build the census-tract table used by the atlas.

Outcome counts cover EVERY 2019 census tract, including tracts without Street View data
(the manuscript's regression dropped those tracts, but the crashes there are real):

* Counts come from Data/FARS/combined_person_2017_2023.csv, which tract_regression.ipynb
  and fars_merge.ipynb use. Each person row already carries `cetract`, the 2019 tract
  assigned by the notebook's spatial join. The notebook's definitions are reproduced:
    - fatal_collisions_with_children : unique crashes with a person aged < 18
    - children_fatalities            : persons < 18 with INJ_SEV == 4
    - ped_cycle_children_fatalities  : same, PER_TYP in (5, 6)
  (On the 69,120 tracts of cetract_standardized.csv these counts match that file exactly.)
* Street View tertiles come from cetract_standardized.csv; they stay blank for tracts
  without Street View data, so the atlas shows "no data" for those layers only.
* Children under 18 (rates per 10,000) come from the 2019 ACS (NHGIS), the notebook's child_total.
* The tract list is every tract in cb_2019_us_tract_500k (73,868).

Run from the app directory:   python scripts/prepare_tract_data.py
"""

import io
import json
import struct
import zipfile
from pathlib import Path

import pandas as pd

APP_DIR = Path(__file__).resolve().parents[1]
SOURCE_DIR = APP_DIR.parent / "COLLISIONS INVOLVING CHILDREN" / "COLLISIONS INVOLVING CHILDREN"
ARCHIVE = SOURCE_DIR / "child_collisions_gsv_code_and_data.zip"
PERSON = SOURCE_DIR / "Data" / "FARS" / "combined_person_2017_2023.csv"
TRACT_DBF = "child_collisions_gsv/data/cb_2019_us_tract_500k/cb_2019_us_tract_500k.dbf"
TERTILE_MEMBER = "child_collisions_gsv/data/regression_dataframes/cetract_standardized.csv"
ACS_MEMBER = "child_collisions_gsv/data/nhgis0008_csv_2019/nhgis0008_ds244_20195_tract_E.csv"
OUTPUT = APP_DIR / "data" / "tracts.csv"
METADATA = APP_DIR / "data" / "metadata.json"
CHILD_COLUMNS = ["ALT0E003", "ALT0E004", "ALT0E005", "ALT0E006", "ALT0E027", "ALT0E028", "ALT0E029", "ALT0E030"]
OUTCOMES = ["fatal_collisions_with_children", "children_fatalities", "ped_cycle_children_fatalities"]
TERTILES = ["tertsidewalk", "tertsinglelane", "tertstreetlight", "tertgreen", "tertstopsign"]


def shapefile_geoids(dbf: bytes) -> list:
    count, header_length, record_length = struct.unpack("<IHH", dbf[4:12])
    position, offset, field = 32, 1, None
    while dbf[position] != 0x0D:
        name = dbf[position:position + 11].split(b"\0")[0].decode()
        length = dbf[position + 16]
        if name == "GEOID":
            field = (offset, length)
        offset += length
        position += 32
    start = header_length + field[0]
    return [dbf[start + i * record_length:start + i * record_length + field[1]].decode().strip() for i in range(count)]


def main() -> None:
    with zipfile.ZipFile(ARCHIVE) as archive:
        geoids = shapefile_geoids(archive.read(TRACT_DBF))
        with archive.open(TERTILE_MEMBER) as raw:
            tertiles = pd.read_csv(raw)
        with archive.open(ACS_MEMBER) as raw:
            acs = pd.read_csv(io.TextIOWrapper(raw, encoding="latin1"), low_memory=False)
    tertiles["GEOID"] = tertiles.GEOID.astype("int64").astype(str).str.zfill(11)
    acs["GEOID"] = (acs.STATEA.astype(int).astype(str).str.zfill(2) + acs.COUNTYA.astype(int).astype(str).str.zfill(3)
                    + acs.TRACTA.astype(int).astype(str).str.zfill(6))
    acs["child_total"] = acs[CHILD_COLUMNS].sum(axis=1)

    people = pd.read_csv(PERSON, usecols=["CrashID", "AGE", "INJ_SEV", "PER_TYP", "cetract"], low_memory=False)
    children = people[people.AGE < 18].dropna(subset=["cetract"]).copy()
    children["GEOID"] = children.cetract.astype("int64").astype(str).str.zfill(11)
    counts = pd.DataFrame({
        OUTCOMES[0]: children.groupby("GEOID").CrashID.nunique(),
        OUTCOMES[1]: children[children.INJ_SEV == 4].groupby("GEOID").size(),
        OUTCOMES[2]: children[(children.INJ_SEV == 4) & children.PER_TYP.isin([5, 6])].groupby("GEOID").size(),
    })
    missing = set(counts.index) - set(geoids)
    assert not missing, f"{len(missing)} crash tracts are not in the 2019 tract shapefile"

    tracts = pd.DataFrame({"GEOID": sorted(set(geoids))})
    tracts = tracts.merge(counts.reset_index(), on="GEOID", how="left")
    tracts[OUTCOMES] = tracts[OUTCOMES].fillna(0).astype(int)
    tracts = tracts.merge(tertiles[["GEOID"] + TERTILES], on="GEOID", how="left")
    tracts = tracts.merge(acs[["GEOID", "child_total"]], on="GEOID", how="left")
    for column in OUTCOMES:
        tracts[column + "_p10k"] = (tracts[column] / tracts.child_total * 10000).where(tracts.child_total > 0)

    columns = ["GEOID"] + OUTCOMES + [c + "_p10k" for c in OUTCOMES] + TERTILES + ["child_total"]
    tracts = tracts[columns]
    for column in TERTILES + ["child_total"]:
        tracts[column] = tracts[column].round().astype("Int64")
    for column in [c for c in columns if c.endswith("_p10k")]:
        tracts[column] = tracts[column].map(lambda v: "" if pd.isna(v) else f"{v:.5g}")
    tracts.to_csv(OUTPUT, index=False, lineterminator="\n")

    has_gsv = tracts.tertsidewalk.notna()
    print(f"{len(tracts):,} tracts; {int(has_gsv.sum()):,} with Street View data")
    print("totals, all tracts:", tracts[OUTCOMES].sum().to_dict())
    print("totals, tracts without Street View:", tracts.loc[~has_gsv, OUTCOMES].sum().to_dict())
    if METADATA.exists():
        metadata = json.loads(METADATA.read_text(encoding="utf-8"))
        metadata["tract_data_count"] = len(tracts)
        metadata["tract_gsv_count"] = int(has_gsv.sum())
        metadata.pop("tract_regression_sample_count", None)
        METADATA.write_text(json.dumps(metadata, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
