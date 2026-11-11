#!/usr/bin/env python3
"""Write data/brief.md — a short AI-written analyst brief from the latest PortWatch snapshot.

Optional step: runs only if ANTHROPIC_API_KEY is set (as a GitHub Actions secret).
The model sees ONLY the computed metrics below, and is told not to invent events,
so the brief stays grounded in the data. Standard library only.

Usage:  ANTHROPIC_API_KEY=... python scripts/generate_brief.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / "data" / "portwatch.json"
OUT = ROOT / "data" / "brief.md"
MODEL = os.environ.get("BRIEF_MODEL", "claude-sonnet-5-5")

# EIA 1H25 oil flows (mb/d) — mirrors js/config.js
OIL = {"hormuz": 20.9, "malacca": 23.2, "suez": 4.9, "babelmandeb": 4.2, "cape": 9.1,
       "bosporus": 3.7, "oresund": 4.9, "panama": 2.3}


def d(s: str) -> date:
    return date.fromisoformat(s)


def window(rows: dict, end: date, days: int, col: int):
    vals = [rows[(end - timedelta(i)).isoformat()][col] for i in range(days)
            if (end - timedelta(i)).isoformat() in rows]
    return mean(vals) if len(vals) >= max(1, int(days * 0.6)) else None


def pct(cur, base):
    return None if cur is None or not base else round((cur - base) / base * 100, 1)


def metrics(snapshot: dict) -> list[dict]:
    out = []
    for key, cp in snapshot["chokepoints"].items():
        rows = {r[0]: r for r in cp["rows"]}
        last = d(cp["rows"][-1][0])
        cur_t, cur_tk = window(rows, last, 7, 1), window(rows, last, 7, 2)
        yoy_t, yoy_tk = window(rows, last - timedelta(364), 7, 1), window(rows, last - timedelta(364), 7, 2)
        pre = [r for r in cp["rows"] if "2023-01-01" <= r[0] <= "2023-10-31"]
        pre_t = mean(r[1] for r in pre) if pre else None
        prev_t = window(rows, last - timedelta(7), 7, 1)
        out.append({
            "chokepoint": cp.get("portname") or key, "key": key, "data_through": last.isoformat(),
            "ships_per_day_7d": round(cur_t, 1) if cur_t is not None else None,
            "change_vs_last_year_pct": pct(cur_t, yoy_t),
            "tanker_change_vs_last_year_pct": pct(cur_tk, yoy_tk),
            "change_vs_2023_pre_red_sea_pct": pct(cur_t, pre_t),
            "week_on_week_pct": pct(cur_t, prev_t),
            "normal_oil_flow_mbd_eia": OIL.get(key),
        })
    return out


PROMPT = """You are a senior analyst writing for commodity traders and geopolitical risk consultants.
Below are this week's maritime chokepoint metrics computed from IMF PortWatch AIS data.

Write a brief in Markdown, max 180 words:
- One line starting with "## " as a headline.
- 3–5 bullet points ("- ") on the most important signals and their commodity market read-through
  (oil, LNG, freight, grains, etc.).
- One final short paragraph starting with "**What to watch:**".

Rules: use ONLY the numbers given. Do not invent events, prices, or causes; where you infer
a cause, say "consistent with" rather than asserting it. Note that AIS undercounts vessels
sailing with transponders off. Plain, precise language, no hype.

Metrics (JSON):
"""


def main() -> None:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        print("ANTHROPIC_API_KEY not set — skipping AI brief.")
        return
    snap = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    m = metrics(snap)
    body = json.dumps({
        "model": MODEL,
        "max_tokens": 700,
        "messages": [{"role": "user", "content": PROMPT + json.dumps(m, indent=1)}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=body, method="POST",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            resp = json.load(r)
    except Exception as exc:  # noqa: BLE001
        print(f"Brief generation failed (site still works without it): {exc}", file=sys.stderr)
        return
    text = "".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text").strip()
    if not text:
        print("Empty response — not writing brief.", file=sys.stderr)
        return
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    OUT.write_text(f"<!-- generated: {stamp} by {MODEL} -->\n{text}\n", encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
