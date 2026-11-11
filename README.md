# Chokepoint Risk Monitor

**How disruptions at the world's 28 shipping chokepoints affect commodity flows.**
A [D'Horizons](https://www.itsdhorizons.com/) project by Roxana Neagoe.

Live site: https://mneroxana.github.io/chokepoint-monitor/

[IMF PortWatch](https://portwatch.imf.org/) shows how many ships pass each chokepoint every day. This project turns that into the questions a commodity trader or geopolitical risk analyst asks:

- **Is traffic abnormal?** The latest week against a 2019–2022 seasonal normal, the same week last year, or the weeks before the 2026 Iran war.
- **Which commodities are affected?** Ships and cargo tonnage split by vessel type: tankers (crude, fuels, gas), dry bulk (grains, ores, coal, fertiliser), containers (manufactured goods), general cargo and ro-ro.
- **Where is the most cargo missing?** Chokepoints ranked by tonnes of cargo per day below normal, overall or for one cargo type, and as a share of world seaborne trade.
- **What if it gets worse?** A scenario calculator: lose X% of traffic for N days and see the ships and cargo affected, by vessel type.
- **What happened when?** A chart since 2019 with sourced markers for major events, such as the start of the Red Sea attacks or the Panama drought.

All core calculations use PortWatch data only, so every commodity is treated the same way. In the "Energy (tankers)" view only, the site adds U.S. EIA oil and LNG flows for the eight chokepoints the EIA covers, pipeline bypass capacity and oil estimates in barrels (data in `js/config.js`, `ENERGY`). Every factual statement in the profiles links to its source, and each section is labelled IMF PortWatch, Calculated or Official updates.

## How it works

```
IMF PortWatch API ──► GitHub Action (daily) ──► data/portwatch.json ──► website
        │                                                                 ▲
        └──────────── the page also asks PortWatch for the newest weeks ──┘
```

- `scripts/fetch_portwatch.py` downloads every chokepoint's daily history since 2019 and saves: about two years of daily data, weekly averages since 2019, and the 2019–2022 seasonal normal.
- `js/analytics.js` computes 7-day averages, changes against the chosen baseline, status bands and cargo missing.
- `js/profiles.js` holds the written profiles, their sources, the official update links and the chart events.
- No framework, no build step, no server: static files on GitHub Pages. The map uses Natural Earth data stored in the repository.

PortWatch publishes once a week (Tuesdays), covering the previous week, so the latest day is usually 3 to 10 days old. No free source offers reliable daily chokepoint counts; commercial providers such as Kpler or Vortexa do.

## Editing the chokepoint profiles

1. On GitHub, open `js/profiles.js` and click the pencil icon.
2. Change only the text between quotation marks. Keep every quotation mark, comma and bracket.
3. Each statement lists its sources by name (for example `src: ["eia"]`); the names are defined in `SOURCES` at the top of the file.
4. Click **Commit changes**. The site updates within a couple of minutes.

Review the profiles twice a year, whenever the EIA updates its chokepoint report, and after any major event (add it to `EVENTS` so it appears on the chart).

## Methodology

**Ranking** = cargo missing per day = normal cargo a day − cargo a day in the latest week (PortWatch tonnage estimates). It is in real units, so a large fall at a busy chokepoint ranks above the same percentage fall at a quiet one, and it works identically for every cargo type. As a share of world seaborne trade, it is divided by 12,720 million tonnes a year (UNCTAD, 2024).

**Seasonal normal**: for each calendar day, the 7-day average ending on that day, averaged over 2019, 2020, 2021 and 2022.

**Limitations**: ships switch off AIS transponders in conflict zones and satellite navigation is jammed, so falls may be overstated. Chokepoints with fewer than 5 ships a day are flagged as low traffic. The scenario calculator is first-order and ignores stockpiles and prices. Not investment advice.

## Optional: AI-written summary

Add an `ANTHROPIC_API_KEY` secret (Settings → Secrets and variables → Actions) and the daily Action will also write a short summary with Claude, using only the computed numbers.

## Sources

IMF PortWatch; U.S. Energy Information Administration; IEA; UNCTAD; Panama Canal Authority; JMIC and UKMTO advisories; and the articles listed in `js/profiles.js`. Map data: Natural Earth via world-atlas.

An independent project, not affiliated with the IMF. MIT licence.
