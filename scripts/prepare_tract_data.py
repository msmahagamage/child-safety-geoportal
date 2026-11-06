"""Build the census-tract table used by the atlas.

Source: the manuscript's saved tract dataframes in child_collisions_gsv_code_and_data.zip
(data/regression_dataframes/).

* cetract_standardized.csv (saved 2026-01-28, 69,120 tracts) is the model dataframe that
  was in memory when tract_regression.ipynb drew the manuscript's Figure 2
  (writing/figure_2.png, saved 2026-01-29). The atlas maps exactly these tracts, with
  the outcome counts and Street View tertiles stored in that file.
* cetract_raw.csv (2026-04-16) is the final regression dataframe (63,565 tracts with
  children > 0, adds the traffic-volume covariate). (Used only to verify the manuscript totals.)

Rates are per 10,000 children, using the 2019 ACS under-18 population (the notebook's
child_total; identical to cetract_raw.csv's child_total for every sample tract).

Run from the app directory:   python scripts/prepare_tract_data.py
"""

import io
import json
import zipfile
from pathlib import Path

import pandas as pd

APP_DIR = Path(__file__).resolve().parents[1]
SOURCE_DIR = APP_DIR.parent / "COLLISIONS INVOLVING CHILDREN" / "COLLISIONS INVOLVING CHILDREN"
ARCHIVE = SOURCE_DIR / "child_collisions_gsv_code_and_data.zip"
FIGURE_MEMBER = "child_collisions_gsv/data/regression_dataframes/cetract_standardized.csv"
SAMPLE_MEMBER = "child_collisions_gsv/data/regression_dataframes/cetract_raw.csv"
ACS_MEMBER = "child_collisions_gsv/data/nhgis0008_csv_2019/nhgis0008_ds244_20195_tract_E.csv"
OUTPUT = APP_DIR / "data" / "tracts.csv"
METADATA = APP_DIR / "data" / "metadata.json"
CHILD_COLUMNS = ["ALT0E003", "ALT0E004", "ALT0E005", "ALT0E006", "ALT0E027", "ALT0E028", "ALT0E029", "ALT0E030"]
OUTCOMES = ["fatal_collisions_with_children", "children_fatalities", "ped_cycle_children_fatalities"]
TERTILES = ["tertsidewalk", "tertsinglelane", "tertstreetlight", "tertgreen", "tertstopsign"]


def main() -> None:
    with zipfile.ZipFile(ARCHIVE) as archive:
        with archive.open(FIGURE_MEMBER) as raw:
            figure = pd.read_csv(raw)
        with archive.open(SAMPLE_MEMBER) as raw:
            sample = pd.read_csv(raw, dtype={"GEOID": str})
        with archive.open(ACS_MEMBER) as raw:
            acs = pd.read_csv(io.TextIOWrapper(raw, encoding="latin1"), low_memory=False)
    figure["GEOID"] = figure.GEOID.astype("int64").astype(str).str.zfill(11)
    sample["GEOID"] = sample.GEOID.str.zfill(11)
    sample = sample[sample.child_total > 0]
    acs["GEOID"] = (acs.STATEA.astype(int).astype(str).str.zfill(2) + acs.COUNTYA.astype(int).astype(str).str.zfill(3)
                    + acs.TRACTA.astype(int).astype(str).str.zfill(6))
    acs["child_total"] = acs[CHILD_COLUMNS].sum(axis=1)

    tracts = figure[["GEOID"] + OUTCOMES + TERTILES].merge(acs[["GEOID", "child_total"]], on="GEOID", how="left")
    in_sample_mask = tracts.GEOID.isin(set(sample.GEOID))  # check only; not written to the web file
    assert set(sample.GEOID) <= set(tracts.GEOID), "sample tracts must be a subset of the Figure 2 tracts"
    for column in OUTCOMES:
        tracts[column] = tracts[column].astype(int)
        tracts[column + "_p10k"] = (tracts[column] / tracts.child_total * 10000).where(tracts.child_total > 0)

    columns = ["GEOID"] + OUTCOMES + [c + "_p10k" for c in OUTCOMES] + TERTILES + ["child_total"]
    tracts = tracts[columns].sort_values("GEOID")
    for column in TERTILES + ["child_total"]:
        tracts[column] = tracts[column].round().astype("Int64")
    for column in [c for c in columns if c.endswith("_p10k")]:
        tracts[column] = tracts[column].map(lambda v: "" if pd.isna(v) else f"{v:.5g}")
    tracts.to_csv(OUTPUT, index=False, lineterminator="\n")

    in_sample = tracts[in_sample_mask.reindex(tracts.index, fill_value=False)]
    print(f"{len(tracts):,} tracts mapped (Figure 2 dataframe); {len(in_sample):,} in the regression sample")
    print("regression sample totals:", in_sample[OUTCOMES].sum().to_dict(), "(manuscript 34,446 / 13,979 / 2,274)")
    print("all mapped totals:", tracts[OUTCOMES].sum().to_dict())
    if METADATA.exists():
        metadata = json.loads(METADATA.read_text(encoding="utf-8"))
        metadata["tract_data_count"] = len(tracts)
        metadata["tract_regression_sample_count"] = len(in_sample)
        METADATA.write_text(json.dumps(metadata, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
