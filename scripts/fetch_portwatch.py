#!/usr/bin/env python3
"""Download IMF PortWatch chokepoint data and save it as data/portwatch.json.

Runs every day in GitHub Actions (.github/workflows/update-data.yml), so the
website always has a recent copy of the data to show. Standard library only.

It downloads two PortWatch datasets:
  1. "PortWatch chokepoints database": the list of chokepoints, their location
     and the main industries whose goods pass through them.
  2. "Daily Chokepoint Transit Calls and Trade Volume Estimates": ships per day
     and estimated cargo (metric tons), split by vessel type, since 2023.

Usage:  python scripts/fetch_portwatch.py [--out data/portwatch.json]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

BASE = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services"
DAILY = f"{BASE}/Daily_Chokepoints_Data/FeatureServer/0/query"
DATABASE = f"{BASE}/PortWatch_chokepoints_database/FeatureServer/0/query"
PAGE = 1000            # PortWatch returns at most 1,000 records per request
START_YEAR = 2019      # PortWatch history starts in 2019
NORMAL_YEARS = (2019, 2020, 2021, 2022)   # "seasonal normal": the four years before the Red Sea crisis
DAILY_KEEP_DAYS = 800  # daily rows kept in the file (enough for "same week last year" plus a 12-month chart)
FIELDS = ["year", "month", "day", "portid", "portname",
          "n_total", "n_tanker", "n_dry_bulk", "n_container", "n_general_cargo", "n_roro",
          "capacity", "capacity_tanker", "capacity_dry_bulk", "capacity_container",
          "capacity_general_cargo", "capacity_roro"]


def query(url: str, params: dict, retries: int = 4) -> dict:
    full = f"{url}?{urllib.parse.urlencode(params)}"
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(full, timeout=90) as r:
                data = json.load(r)
            if "error" in data:
                raise RuntimeError(data["error"])
            return data
        except Exception as exc:  # noqa: BLE001
            if attempt == retries - 1:
                raise
            print(f"  retrying after error: {exc}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("unreachable")


def num(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def to_row(a: dict) -> list:
    """[date, ships: total, tanker, dry bulk, container, general cargo, ro-ro,
             tons: total, tanker, dry bulk, container, general cargo, ro-ro]"""
    return [
        f"{int(a['year']):04d}-{int(a['month']):02d}-{int(a['day']):02d}",
        int(num(a.get("n_total"))), int(num(a.get("n_tanker"))), int(num(a.get("n_dry_bulk"))),
        int(num(a.get("n_container"))), int(num(a.get("n_general_cargo"))), int(num(a.get("n_roro"))),
        round(num(a.get("capacity"))), round(num(a.get("capacity_tanker"))),
        round(num(a.get("capacity_dry_bulk"))), round(num(a.get("capacity_container"))),
        round(num(a.get("capacity_general_cargo"))), round(num(a.get("capacity_roro"))),
    ]


def fetch_database() -> dict:
    """Chokepoint names, coordinates and PortWatch's top industries."""
    data = query(DATABASE, {"where": "1=1", "outFields": "*", "returnGeometry": "true",
                            "outSR": 4326, "f": "json"})
    feats = data.get("features", [])
    if feats:
        print("Chokepoint database fields:", ", ".join(sorted(feats[0]["attributes"].keys())))
    out = {}
    for f in feats:
        a, g = f["attributes"], f.get("geometry") or {}
        pid = a.get("portid")
        if not pid:
            continue
        industries = []
        for k in sorted(a):
            v = a[k]
            if k.lower().startswith("industry_top") and isinstance(v, str) and v.strip() and v != "None":
                industries.append(v.strip())
        out[pid] = {
            "name": a.get("portname") or a.get("fullname"),
            "lat": a.get("lat", g.get("y")),
            "lon": a.get("lon", g.get("x")),
            "industries": industries,
        }
    return out


def fetch_daily() -> dict:
    """All chokepoints, all days since START_YEAR, paged 1,000 records at a time."""
    rows: dict[str, dict] = {}
    names: dict[str, str] = {}
    offset = 0
    while True:
        page = query(DAILY, {
            "where": f"year >= {START_YEAR}", "outFields": ",".join(FIELDS),
            "returnGeometry": "false", "orderByFields": "portid ASC,year ASC,month ASC,day ASC",
            "resultOffset": offset, "resultRecordCount": PAGE, "f": "json",
        })
        feats = page.get("features", [])
        for f in feats:
            a = f["attributes"]
            pid = a.get("portid")
            if not pid:
                continue
            names.setdefault(pid, a.get("portname"))
            r = to_row(a)
            rows.setdefault(pid, {})[r[0]] = r
        print(f"  {offset + len(feats):,} records")
        if not page.get("exceededTransferLimit") and len(feats) < PAGE:
            break
        offset += PAGE
    return {pid: {"name": names[pid], "rows": [byd[d] for d in sorted(byd)]} for pid, byd in rows.items()}


def mean(vals):
    return sum(vals) / len(vals) if vals else None


def summarise(rows: list[list]) -> dict:
    """Turn the full daily history of one chokepoint into rows / weekly / normal."""
    by_date = {r[0]: r for r in rows}
    last = date.fromisoformat(rows[-1][0])

    def window(end: date, col: int, days: int = 7):
        vals = [by_date[(end - timedelta(i)).isoformat()][col] for i in range(days)
                if (end - timedelta(i)).isoformat() in by_date]
        return mean(vals) if len(vals) >= 4 else None

    keep_from = (last - timedelta(DAILY_KEEP_DAYS)).isoformat()
    recent = [r for r in rows if r[0] >= keep_from]

    weekly = []
    d = last
    while d >= date(START_YEAR, 1, 7):
        vals = [window(d, c) for c in (1, 2, 3, 4)]
        if vals[0] is not None:
            weekly.append([d.isoformat()] + [round(v, 1) for v in vals])
        d -= timedelta(7)
    weekly.reverse()

    normal = {}
    for doy in range(366):
        md = (date(2020, 1, 1) + timedelta(doy)).strftime("%m-%d")
        per_col = []
        for col in range(1, 13):
            vals = []
            for y in NORMAL_YEARS:
                try:
                    end = date(y, int(md[:2]), int(md[3:]))
                except ValueError:  # 29 February in a non-leap year
                    end = date(y, 2, 28)
                v = window(end, col)
                if v is not None:
                    vals.append(v)
            m = mean(vals)
            per_col.append(None if m is None else (round(m, 1) if col <= 6 else round(m)))
        normal[md] = per_col

    yearly_rows = [r for r in rows if int(r[0][:4]) in NORMAL_YEARS]
    normal_avg = [None if not yearly_rows else
                  (round(mean([r[c] for r in yearly_rows]), 1) if c <= 6 else round(mean([r[c] for r in yearly_rows])))
                  for c in range(1, 13)]
    return {"rows": recent, "weekly": weekly, "normal": normal, "normalAvg": normal_avg}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/portwatch.json")
    args = ap.parse_args()

    print("Downloading chokepoint list…")
    try:
        db = fetch_database()
    except Exception as exc:  # noqa: BLE001 — the daily data is what matters most
        print(f"  could not load chokepoint database: {exc}", file=sys.stderr)
        db = {}
    print("Downloading daily transits…")
    daily = fetch_daily()
    if not daily:
        sys.exit("No data downloaded — keeping the previous file.")

    chokepoints = {}
    for pid, d in sorted(daily.items(), key=lambda kv: int("".join(c for c in kv[0] if c.isdigit()) or 0)):
        info = db.get(pid, {})
        chokepoints[pid] = {
            "name": d["name"] or info.get("name"),
            "lat": info.get("lat"), "lon": info.get("lon"),
            "industries": info.get("industries", []),
            "first": d["rows"][0][0],
            **summarise(d["rows"]),
        }
        print(f"  {pid:14} {chokepoints[pid]['name']:28} {len(d['rows'])} days ({d['rows'][0][0]} to {d['rows'][-1][0]})")

    out = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "latest": max(c["rows"][-1][0] for c in chokepoints.values()),
        "normalYears": list(NORMAL_YEARS),
        "chokepoints": chokepoints,
    }
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {path} ({path.stat().st_size / 1024:.0f} KB), {len(chokepoints)} chokepoints, latest day {out['latest']}")


if __name__ == "__main__":
    main()
