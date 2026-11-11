// ---------------------------------------------------------------------------
// Chokepoint Risk Monitor — static configuration
//
// Two layers of knowledge live here:
//   1. How to find each chokepoint in IMF PortWatch (name match for the API).
//   2. The "so what" layer PortWatch doesn't give you: which commodities move
//      through each chokepoint, how big those flows are, what bypasses exist,
//      and what a commodity trader / geopolitical risk analyst would watch.
//
// Energy flow figures: U.S. EIA, "World Oil Transit Chokepoints" (updated
// 3 Mar 2026), 1H 2025 values. LNG share of global trade for Hormuz: IEA
// Strait of Hormuz factsheet (≈19-20%). Edit freely — this file is meant to
// be the analyst's opinion layer on top of the data.
// ---------------------------------------------------------------------------

export const API = {
  daily:
    "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query",
  pageSize: 1000, // PortWatch returns max 1000 records per request
  startYear: 2023, // need Jan–Oct 2023 for the pre-Red Sea baseline
  fields: [
    "year", "month", "day", "portid", "portname",
    "n_total", "n_tanker", "n_dry_bulk", "n_container", "n_general_cargo", "n_roro",
    "capacity", "capacity_tanker", "capacity_dry_bulk", "capacity_container",
  ],
};

// Reference denominators (EIA 1H25; global LNG derived from IEA: Hormuz
// ≈11.4 bcf/d ≈ 20% of global LNG trade → ≈57 bcf/d).
export const WORLD = {
  maritimeOilMbd: 79.8,
  lngBcfd: 57,
};

// Baseline windows the user can choose between.
export const BASELINES = {
  yoy: { label: "Same week last year", short: "vs last year" },
  pre: { label: "Pre-Red Sea crisis (Jan–Oct 2023)", short: "vs 2023", from: "2023-01-01", to: "2023-10-31" },
};

// Status thresholds on % change of 7-day average vessel transits vs baseline.
export const STATUS = [
  { id: "severe", label: "Severe", icon: "⛔", max: -50 },
  { id: "disrupted", label: "Disrupted", icon: "▲", max: -25 },
  { id: "watch", label: "Watch", icon: "●", max: -10 },
  { id: "normal", label: "Normal", icon: "✓", max: 25 },
  { id: "surge", label: "Surge / rerouting", icon: "↗", max: Infinity },
];

export const CHOKEPOINTS = [
  {
    key: "hormuz",
    match: "Hormuz",
    name: "Strait of Hormuz",
    region: "Middle East",
    lat: 26.57, lon: 56.25,
    oilMbd: 20.9, lngBcfd: 11.4,
    bypass: { mbd: 4.7, note: "Saudi East-West + UAE Habshan–Fujairah (ADCOP) pipelines ≈4.7 mb/d usable bypass (EIA)" },
    detour: "No sea alternative — Gulf exporters are landlocked behind the strait.",
    commodities: ["Crude oil", "Refined products", "LNG (Qatar, UAE)", "LPG", "Urea & ammonia", "Methanol / polymers", "Aluminium"],
    trader: [
      "Brent–Dubai spread and Dubai backwardation",
      "VLCC rates MEG→China (TD3C) and war-risk premiums",
      "JKM LNG vs TTF — Asia bids for Atlantic cargoes",
      "Asian refining margins; Indian/Pakistani LNG shortfalls",
      "Gulf urea/ammonia FOB → global fertilizer prices",
    ],
    risk: [
      "State naval action, blockades and mining",
      "Vessel seizures / GNSS jamming / AIS 'dark' transits",
      "Sanctions enforcement on Iranian barrels",
      "Hull & war-risk insurance withdrawal",
    ],
  },
  {
    key: "babelmandeb",
    match: "Mandeb",
    name: "Bab el-Mandeb",
    region: "Red Sea",
    lat: 12.6, lon: 43.4,
    oilMbd: 4.2, lngBcfd: 0.0,
    bypass: null,
    detour: "Reroute via Cape of Good Hope (~10+ extra days Asia–Europe).",
    commodities: ["Crude & products (East↔West)", "Containers (Asia–Europe)", "Grains to East Africa / Asia", "Saudi Red Sea exports"],
    trader: [
      "Diesel/jet East→West arbitrage and NW Europe cracks",
      "Asia–N. Europe container rates (SCFI / Drewry WCI)",
      "Suezmax/Aframax ton-mile demand",
      "Bunker demand at Cape/Singapore hubs",
    ],
    risk: [
      "Houthi missile/drone attacks and seizures",
      "Yemen conflict spill-over; Red Sea coast control",
      "Naval escort coverage (EU Aspides etc.)",
      "Crew safety & owner flag-based targeting",
    ],
  },
  {
    key: "suez",
    match: "Suez",
    name: "Suez Canal",
    region: "Red Sea / Med",
    lat: 30.59, lon: 32.44,
    oilMbd: 4.9, lngBcfd: 0.9,
    bypass: { mbd: 2.5, note: "SUMED pipeline (Ain Sukhna → Sidi Kerir), capacity ≈2.5 mb/d (EIA). Oil figure includes SUMED." },
    detour: "Cape of Good Hope (~10+ extra days Asia–Europe).",
    commodities: ["Containers", "Crude & products", "LNG", "Grains (Black Sea → Asia/MENA)", "Steel & bulk"],
    trader: [
      "Container freight Asia–Med/N. Europe",
      "Black Sea/Med wheat delivered to Asia",
      "Egypt FX & canal revenue (sovereign risk)",
    ],
    risk: [
      "Red Sea security (driven by Bab el-Mandeb)",
      "Groundings/blockages (Ever Given, 2021)",
      "Egyptian political & fiscal stability",
    ],
  },
  {
    key: "cape",
    match: "Good Hope",
    name: "Cape of Good Hope",
    region: "Southern Africa",
    lat: -34.6, lon: 19.5,
    oilMbd: 9.1, lngBcfd: 5.7,
    bypass: null,
    detour: "This is the detour — rising transits signal diversion from Red Sea/Suez.",
    commodities: ["Rerouted containers & tankers", "Brazil iron ore → China", "West Africa crude → Asia", "LNG (Atlantic → Asia)"],
    trader: [
      "Ton-mile demand → tanker & capesize earnings",
      "Bunker sales (Port Louis, Algoa Bay, Las Palmas)",
      "Longer voyages tie up fleet capacity → freight upside",
    ],
    risk: [
      "Weather (Southern Ocean winter storms)",
      "Limited bunkering/port infrastructure in South Africa",
    ],
  },
  {
    key: "malacca",
    match: "Malacca",
    name: "Strait of Malacca",
    region: "Southeast Asia",
    lat: 2.6, lon: 101.2,
    oilMbd: 23.2, lngBcfd: 9.2,
    bypass: null,
    detour: "Lombok/Makassar or Sunda straits (+2–3 days for large tankers).",
    commodities: ["Crude to China / Japan / Korea", "LNG", "Coal", "Containers", "Palm oil"],
    trader: [
      "Chinese crude import pace & teapot refinery runs",
      "Singapore bunker & product cracks",
      "Thermal coal (Indonesia/Australia → North Asia)",
    ],
    risk: [
      "Piracy & armed robbery (Singapore Strait)",
      "South China Sea tensions spill-over",
      "Collisions in congested traffic separation scheme",
    ],
  },
  {
    key: "panama",
    match: "Panama",
    name: "Panama Canal",
    region: "Americas",
    lat: 9.1, lon: -79.7,
    oilMbd: 2.3, lngBcfd: null,
    bypass: null,
    detour: "Cape Horn / Suez, or US West Coast rail land-bridge.",
    commodities: ["US Gulf grains & soybeans → Asia", "US LPG & LNG → Asia", "Containers (Asia–US East Coast)", "Refined products"],
    trader: [
      "US Gulf vs PNW grain basis",
      "VLGC freight US Gulf → Japan (LPG)",
      "Panama draft/slot restrictions & auction prices",
    ],
    risk: [
      "Drought / Gatun Lake water levels (El Niño)",
      "US–Panama political pressure over canal control",
    ],
  },
  {
    key: "bosporus",
    match: "Bosp",
    name: "Bosporus (Turkish Straits)",
    region: "Black Sea",
    lat: 41.12, lon: 29.07,
    oilMbd: 3.7, lngBcfd: null,
    bypass: null,
    detour: "None for Black Sea ports — pipelines (CPC, BTC) are partial substitutes.",
    commodities: ["Russian & Kazakh (CPC) crude", "Russian products", "Ukrainian & Russian wheat/corn", "Sunflower oil", "Steel & fertilizer"],
    trader: [
      "Black Sea wheat FOB vs EU/US origins",
      "CPC Blend & Urals differentials",
      "Russia–Ukraine war-risk cover for Black Sea calls",
    ],
    risk: [
      "Russia–Ukraine war (port strikes, sea drones, mines)",
      "Montreux Convention / Turkish transit policy",
      "Sanctions & price-cap enforcement on Russian oil",
    ],
  },
  {
    key: "oresund",
    match: "resund",
    name: "Øresund (Danish Straits)",
    region: "Baltic",
    lat: 55.9, lon: 12.7,
    oilMbd: 4.9, lngBcfd: null,
    bypass: null,
    detour: "Great Belt (deeper-draft alternative within Danish Straits).",
    commodities: ["Russian Baltic crude (Primorsk, Ust-Luga)", "Russian products", "Baltic grains", "Containers"],
    trader: [
      "Urals discount & Baltic Aframax rates",
      "Shadow-fleet tanker availability",
    ],
    risk: [
      "Shadow-fleet inspections / insurance checks by Denmark",
      "Subsea cable/pipeline sabotage incidents",
      "Note: EIA oil figure covers all Danish Straits (incl. Great Belt)",
    ],
  },
  {
    key: "gibraltar",
    match: "Gibraltar",
    name: "Strait of Gibraltar",
    region: "Mediterranean",
    lat: 35.95, lon: -5.6,
    oilMbd: null, lngBcfd: null,
    bypass: null,
    detour: "None for Med ↔ Atlantic.",
    commodities: ["Containers (Algeciras, Tanger Med)", "Crude & products", "Bulk"],
    trader: ["Med product balances", "Transhipment congestion at Tanger Med / Algeciras"],
    risk: ["Migration-related maritime incidents", "Spain–Morocco–UK political frictions"],
  },
  {
    key: "dover",
    match: "Dover",
    name: "Dover Strait",
    region: "NW Europe",
    lat: 51.0, lon: 1.45,
    oilMbd: null, lngBcfd: null,
    bypass: null,
    detour: "North of Scotland (major detour).",
    commodities: ["Containers (Rotterdam, Antwerp, Hamburg)", "Products (ARA hub)", "Baltic & Russian flows"],
    trader: ["ARA product stocks & gasoil flows", "North Sea feeder congestion"],
    risk: ["Collisions in world's busiest TSS", "Strikes at Channel/ARA ports"],
  },
  {
    key: "taiwan",
    match: "Taiwan",
    name: "Taiwan Strait",
    region: "East Asia",
    lat: 24.4, lon: 119.6,
    oilMbd: null, lngBcfd: null,
    bypass: null,
    detour: "East of Taiwan via Luzon Strait / Philippine Sea.",
    commodities: ["Containers (electronics, semis)", "LNG & coal to Taiwan/Japan", "Crude to North Asia"],
    trader: ["Transpacific container rates", "Japan/Korea LNG & coal imports"],
    risk: [
      "PLA exercises & declared live-fire zones",
      "Blockade / quarantine scenarios",
      "Grey-zone coast guard activity",
    ],
  },
];
