#!/usr/bin/env python3
"""Fetch daily chokepoint transits from IMF PortWatch and write data/portwatch.json.

Runs in GitHub Actions (see .github/workflows/update-data.yml) so the site always
has a same-origin snapshot to render from, even if the live API is slow or down.
Standard library only — no pip install needed.

Usage:  python scripts/fetch_portwatch.py [--out data/portwatch.json]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = ("https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/"
       "Daily_Chokepoints_Data/FeatureServer/0/query")
PAGE = 1000
START_YEAR = 2023
FIELDS = ["year", "month", "day", "portid", "portname",
          "n_total", "n_tanker", "n_dry_bulk", "n_container", "n_general_cargo", "n_roro",
          "capacity", "capacity_tanker", "capacity_dry_bulk", "capacity_container"]


def load_chokepoints() -> list[dict]:
    """Read key + match string from js/config.js so there is one source of truth."""
    cfg = (Path(__file__).resolve().parent.parent / "js" / "config.js").read_text(encoding="utf-8")
    pairs = re.findall(r'key:\s*"([^"]+)",\s*\n\s*match:\s*"([^"]+)"', cfg)
    if not pairs:
        sys.exit("Could not parse chokepoints from js/config.js")
    return [{"key": k, "match": m} for k, m in pairs]


def query(params: dict, retries: int = 3) -> dict:
    url = f"{API}?{urllib.parse.urlencode(params)}"
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                data = json.load(r)
            if "error" in data:
                raise RuntimeError(data["error"])
            return data
        except Exception as exc:  # noqa: BLE001
            if attempt == retries - 1:
                raise
            print(f"  retry after error: {exc}", file=sys.stderr)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")


def num(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def to_row(a: dict) -> list:
    return [
        f"{int(a['year']):04d}-{int(a['month']):02d}-{int(a['day']):02d}",
        num(a.get("n_total")), num(a.get("n_tanker")), num(a.get("n_dry_bulk")),
        num(a.get("n_container")), num(a.get("n_general_cargo")), num(a.get("n_roro")),
        round(num(a.get("capacity"))), round(num(a.get("capacity_tanker"))),
        round(num(a.get("capacity_dry_bulk"))), round(num(a.get("capacity_container"))),
    ]


def fetch_one(match: str) -> dict:
    where = f"portname LIKE '%{match}%' AND year >= {START_YEAR}"
    rows, portname, portid, offset = {}, None, None, 0
    while True:
        page = query({
            "where": where, "outFields": ",".join(FIELDS), "returnGeometry": "false",
            "orderByFields": "year ASC,month ASC,day ASC",
            "resultOffset": offset, "resultRecordCount": PAGE, "f": "json",
        })
        feats = page.get("features", [])
        for f in feats:
            a = f["attributes"]
            portname = portname or a.get("portname")
            portid = portid or a.get("portid")
            r = to_row(a)
            rows[r[0]] = r
        if not page.get("exceededTransferLimit") and len(feats) < PAGE:
            break
        offset += PAGE
    return {"portname": portname, "portid": portid, "rows": [rows[d] for d in sorted(rows)]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/portwatch.json")
    args = ap.parse_args()

    out = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "chokepoints": {}}
    for cp in load_chokepoints():
        print(f"Fetching {cp['key']} (portname LIKE %{cp['match']}%)…")
        try:
            res = fetch_one(cp["match"])
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED: {exc}", file=sys.stderr)
            continue
        if res["rows"]:
            out["chokepoints"][cp["key"]] = res
            print(f"  {res['portname']} ({res['portid']}): {len(res['rows'])} days, last {res['rows'][-1][0]}")
        else:
            print("  no rows returned", file=sys.stderr)

    if not out["chokepoints"]:
        sys.exit("No data fetched — keeping previous snapshot.")
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {path} ({path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
