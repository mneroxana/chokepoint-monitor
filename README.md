# Chokepoint Risk Monitor

**Live maritime chokepoint monitoring, translated into commodity and geopolitical risk.**

[IMF PortWatch](https://portwatch.imf.org/) tells you *how many ships* passed through the Strait of Hormuz yesterday. This project answers the next questions a commodity trader or a geopolitical risk analyst actually asks:

- **Is this abnormal?** 7-day averages vs. last year and vs. the pre-Red Sea-crisis 2023 baseline, plus a z-score.
- **Which commodities are exposed, and how much?** Oil and LNG flows per chokepoint (EIA), bypass pipelines, detours.
- **What should I watch in the market?** A trader watchlist (spreads, freight routes, benchmarks) and the risk drivers behind each chokepoint.
- **What if it gets worse?** A scenario tool: X% capacity lost for N days → barrels displaced net of bypass, share of world seaborne oil, LNG, vessels and tonnage affected.
- **What's the one-paragraph take?** A rule-based brief computed in the browser, plus an optional AI-written weekly brief (Claude API) generated in CI.

> Live demo: `https://<your-username>.github.io/chokepoint-monitor/`

<!-- After your first deploy, add a screenshot: save it as docs/screenshot.png and uncomment -->
<!-- ![screenshot](docs/screenshot.png) -->

---

## How it works

```
 IMF PortWatch (ArcGIS REST API, AIS-derived daily transits by vessel type)
        │                                   │
        │ browser fetch (live)              │ GitHub Action, daily
        ▼                                   ▼
   js/data.js  ◄──── fallback ────  data/portwatch.json  (snapshot)
        │                                   │
        ▼                                   ▼
 js/analytics.js                    scripts/generate_brief.py
  7d averages, baselines,           metrics → Claude API → data/brief.md
  z-scores, status, risk score       (optional, needs ANTHROPIC_API_KEY)
        │
        ▼
 js/app.js  — Leaflet map, ranking table, SVG chart, scenario tool, brief
 js/config.js — the analyst layer: commodity exposure, watchlists, risk drivers
```

- **No build step, no framework, no backend.** Static HTML + ES modules; hosts free on GitHub Pages.
- **Stale-while-revalidate data loading:** renders instantly from the committed snapshot, then refreshes from the live API in the background. If PortWatch is down, the site still works.
- **One source of truth:** the Python fetcher reads the chokepoint list from `js/config.js`.

### Risk methodology

| Signal | Definition |
|---|---|
| Change vs baseline | Latest 7-day average vs. same week last year (seasonality-adjusted) **or** Jan–Oct 2023 average (pre-Houthi attacks) |
| z-score | Current 7DMA vs. the distribution of 7DMAs over the prior 12 months (excluding the last month) |
| Status | Normal > −10% · Watch −10 to −25% · Disrupted −25 to −50% · Severe < −50% · Surge > +25% (rerouting) |
| Exposure (0–100) | 75% energy weight (oil share of world seaborne oil ×0.7 + LNG share ×0.3, scaled) + 25% cargo weight (baseline tonnage vs. largest tracked) |
| Risk score | Exposure × (0.35 + 0.65 × Disruption), Disruption = avg. drop in total and tanker transits |

The weights are deliberately simple and transparent — they're in `js/analytics.js` and easy to argue about, which is the point.

**Known limitations:** AIS undercounts "dark" transits during conflicts (so collapses can look worse than reality); PortWatch publishes weekly with a few days' lag; scenario outputs are first-order (no inventories, demand response, or price elasticity). Not investment advice.

---

## Run it yourself

```bash
git clone https://github.com/<you>/chokepoint-monitor && cd chokepoint-monitor
python scripts/fetch_portwatch.py          # optional: build the local snapshot
python -m http.server 8000                  # open http://localhost:8000
```

(ES modules need to be served over HTTP — opening `index.html` directly from disk won't work.)

### Deploy on GitHub Pages

1. Push this folder to a new public repo.
2. **Settings → Pages →** Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. **Actions tab → "Update PortWatch data" → Run workflow** once to create `data/portwatch.json`. After that it runs daily.
4. *(Optional)* **Settings → Secrets and variables → Actions →** add `ANTHROPIC_API_KEY` to enable the AI-written weekly brief.

### Customise

- Add or edit chokepoints, commodities, watchlists: `js/config.js`
- Add dated, sourced context notes per chokepoint: `data/context.json`
- Tune thresholds and weights: `js/config.js` (`STATUS`) and `js/analytics.js`

---

## Sources

- IMF PortWatch — Daily Chokepoint Transit Calls and Trade Volume Estimates (UN Global Platform AIS data; IMF & University of Oxford). Free, see PortWatch terms of use.
- U.S. EIA — [World Oil Transit Chokepoints](https://www.eia.gov/international/content/analysis/special_topics/World_Oil_Transit_Chokepoints) (oil & LNG flows, bypass capacity; 1H 2025).
- IEA — [Strait of Hormuz](https://www.iea.org/about/oil-security-and-emergency-response/strait-of-hormuz) (LNG exposure).

Not affiliated with the IMF, EIA or IEA. MIT licensed.
