// ---------------------------------------------------------------------------
// Chokepoint Risk Monitor: configuration and the analyst layer.
//
// The written chokepoint profiles, their sources and the chart events live in
// js/profiles.js, which is designed to be edited directly on GitHub.
// ---------------------------------------------------------------------------

export const PORTWATCH = {
  daily:
    "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query",
  pageSize: 1000,
  topUpDays: 60, // the browser refreshes the most recent weeks directly from PortWatch
};

// World seaborne trade: 12,720 million tonnes in 2024 (UNCTAD, Review of
// Maritime Transport 2025), used to express missing cargo as a share of it.
export const WORLD = {
  seaborneTonsPerDay: 12720e6 / 366,
  source: { label: "UNCTAD, Review of Maritime Transport 2025", url: "https://unctad.org/system/files/official-document/rmt2025ch1_en.pdf" },
};

// What "normal" means. Each baseline answers a different question.
export const BASELINES = {
  normal: {
    label: "Seasonal normal (2019–2022)",
    short: "vs normal",
    phrase: "in a normal year",
    explain: "Compares with the same week averaged over 2019–2022, the four years before the Red Sea crisis. This is the steadiest benchmark: it removes seasonal swings and is not distorted by any single unusual year.",
  },
  yoy: {
    label: "Same week last year",
    short: "vs last year",
    phrase: "a year earlier",
    explain: "Compares with the same seven days a year earlier. Useful for recent momentum, but misleading where last year was itself disrupted, as in the Red Sea.",
  },
  preWar: {
    label: "Before the Iran war (Jan–Feb 2026)",
    short: "vs before the war",
    phrase: "before the Iran war",
    from: "2026-01-01", to: "2026-02-27",
    explain: "Compares with 1 January to 27 February 2026, the weeks before the US and Israeli strikes on Iran on 28 February. Isolates the effect of this year's conflict.",
  },
};

// Vessel types in PortWatch and what they typically carry.
export const VESSEL_TYPES = [
  { id: "tanker", label: "Tankers", carries: "Crude oil, refined fuels, chemicals, LNG and LPG", col: 2, capCol: 8 },
  { id: "bulk", label: "Dry bulk", carries: "Grains, iron ore, coal, fertiliser, bauxite", col: 3, capCol: 9 },
  { id: "container", label: "Container ships", carries: "Manufactured and consumer goods", col: 4, capCol: 10 },
  { id: "general", label: "General cargo", carries: "Steel, machinery, project cargo", col: 5, capCol: 11 },
  { id: "roro", label: "Ro-ro", carries: "Cars, trucks and other vehicles", col: 6, capCol: 12 },
];

// The commodity filter at the top of the page.
export const FOCUS = {
  all: { label: "All ships", noun: "ships", col: 1, capCol: 7 },
  tanker: { label: "Energy (tankers)", noun: "tankers", col: 2, capCol: 8 },
  bulk: { label: "Dry bulk (grains, ores, coal)", noun: "dry bulk carriers", col: 3, capCol: 9 },
  container: { label: "Containers (manufactured goods)", noun: "container ships", col: 4, capCol: 10 },
};

// Status bands on the change in ships per day versus the chosen baseline.
export const STATUS = [
  { id: "severe", label: "Severe", max: -50, text: "more than 50% below normal" },
  { id: "disrupted", label: "Disrupted", max: -25, text: "25–50% below normal" },
  { id: "watch", label: "Watch", max: -10, text: "10–25% below normal" },
  { id: "normal", label: "Normal", max: 25, text: "within −10% and +25% of normal" },
  { id: "surge", label: "Surge", max: Infinity, text: "more than 25% above normal, often rerouted traffic" },
];

// ---------------------------------------------------------------------------
// Energy layer: shown ONLY when the Cargo menu is set to "Energy (tankers)".
// U.S. EIA, "World Oil Transit Chokepoints" (updated March 2026), first half
// of 2025 unless noted. Keyed by the `match` name used in js/profiles.js.
// ---------------------------------------------------------------------------
export const ENERGY = {
  source: { label: "U.S. EIA, World Oil Transit Chokepoints (March 2026)", url: "https://www.eia.gov/international/content/analysis/special_topics/World_Oil_Transit_Chokepoints" },
  worldSeaborneOilMbd: 79.8, // world maritime oil trade, 1H 2025
  flows: {
    malacca: { oilMbd: 23.2, lngBcfd: 9.2 },
    hormuz: { oilMbd: 20.9, lngBcfd: 11.4, bypassMbd: 4.7, bypassNote: "Saudi East-West and UAE Habshan–Fujairah pipelines" },
    "good hope": { oilMbd: 9.1, lngBcfd: 5.7 },
    suez: { oilMbd: 4.9, lngBcfd: 0.9, bypassMbd: 2.5, bypassNote: "SUMED pipeline; the oil figure includes SUMED", },
    resund: { oilMbd: 4.9, note: "Figure covers all the Danish Straits." },
    mandeb: { oilMbd: 4.2, lngBcfd: 0 },
    bosp: { oilMbd: 3.7, note: "Figure covers the Turkish Straits." },
    panama: { oilMbd: 2.3, note: "Fiscal year 2025 (October 2024 to September 2025)." },
  },
};
