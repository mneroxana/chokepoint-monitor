// ===========================================================================
// CHOKEPOINT PROFILES: the written part of the site
//
// HOW TO EDIT (no coding needed)
//   1. On GitHub, open this file (js/profiles.js) and click the pencil icon.
//   2. Change only the text between quotation marks "like this".
//      Keep every quotation mark, comma and bracket where it is.
//   3. Every statement has a `src` list. Each name in it must match a source
//      in SOURCES just below. To add a new source, copy one SOURCES line and
//      change its name, label and link.
//   4. Click "Commit changes". The site updates within a minute or two.
//
// WHEN TO REVIEW
//   • Twice a year, and whenever the U.S. EIA updates its "World Oil Transit
//     Chokepoints" report (it was last updated in March 2026).
//   • After any major event at a chokepoint: add it to EVENTS at the bottom.
//   Update REVIEWED below each time you check the profiles.
//
// WHAT IS SOURCED AND WHAT IS NOT
//   • Every statement in `facts`, `commodities` and `EVENTS` carries a source.
//   • Chokepoints without a full profile show only a one-line description of
//     where they are, plus the PortWatch data.
// ===========================================================================

export const REVIEWED = "November 2026";

export const SOURCES = {
  unctad2025: { label: "UNCTAD, Review of Maritime Transport 2025", url: "https://unctad.org/system/files/official-document/rmt2025ch2_en.pdf" },
  eia: { label: "U.S. EIA, World Oil Transit Chokepoints (2026)", url: "https://www.eia.gov/international/content/analysis/special_topics/World_Oil_Transit_Chokepoints" },
  eiaStraits: { label: "U.S. EIA, Danish and Turkish Straits (2017)", url: "https://www.eia.gov/todayinenergy/detail.php?id=32552" },
  eiaLng: { label: "U.S. EIA, LNG through the Strait of Malacca", url: "https://www.eia.gov/todayinenergy/detail.php?id=32452" },
  iea: { label: "IEA, Strait of Hormuz", url: "https://www.iea.org/about/oil-security-and-emergency-response/strait-of-hormuz" },
  unctad: { label: "UNCTAD, Review of Maritime Transport 2024", url: "https://unctad.org/isar/publication/review-maritime-transport-2024" },
  imf: { label: "IMF blog, Red Sea attacks disrupt global trade (2024)", url: "https://www.imf.org/Blogs/Articles/2024/03/07/Red-Sea-Attacks-Disrupt-Global-Trade" },
  dia: { label: "U.S. Defense Intelligence Agency, Houthi attacks (2024)", url: "https://marinelog.com/wp-content/uploads/2024/07/YEM_Houthi-Attacks-Pressuring-International-Trade.pdf" },
  cru: { label: "CRU, chokepoint turmoil and dry bulk (2026)", url: "https://www.crugroup.com/en/communities/thought-leadership/2026/Chokepoint-turmoil-amplifies-dry-bulk-market-tightness/" },
  acpFy25: { label: "Panama Canal Authority, FY2025 results", url: "https://pancanal.com/en/panama-canal-maintains-operational-and-financial-strength/" },
  gcPanama: { label: "gCaptain, Panama Canal restricts transits (July 2023)", url: "https://gcaptain.com/severe-drought-forces-panama-canal-to-restrict-number-of-daily-vessel-transits" },
  gcRedSea: { label: "gCaptain, Red Sea crisis timeline", url: "https://gcaptain.com/red-sea-crisis-a-timeline-of-maritime-chaos-over-the-past-year/" },
  csm: { label: "Christian Science Monitor / Reuters (28 Feb 2026)", url: "https://www.csmonitor.com/layout/set/amphtml/USA/2026/0228/Israel-and-US-launch-strikes-on-Iran-pushing-Middle-East-into-new-conflict" },
  jmicOpen: { label: "JMIC advisory note 010-26 (20 June 2026)", url: "https://wwwcdn.imo.org/localresources/en/MediaCentre/HotTopics/Documents/JMIC%20Advisory%20Note%2001026%20SoH%20procedure.pdf" },
  wotr: { label: "War on the Rocks, Black Sea Grain Initiative (2023)", url: "https://warontherocks.com/in-brief-the-black-sea-grain-initiative/" },
  ced: { label: "Conference Board, Russia leaves the grain deal (2023)", url: "https://www.conference-board.org/research/ced-policy-backgrounders/ced-policy-backgrounder-russia-departs-from-black-sea-grain-initiative" },
};

// Official, continuously updated notices published by authorities.
export const OFFICIAL = {
  ukmto: { label: "UKMTO advisories", url: "https://www.ukmto.org/ukmto-products/advisories/2026" },
  jmic: { label: "Joint Maritime Information Center (JMIC) notes", url: "https://www.ukmto.org/partner-products/jmic-products" },
  marad: { label: "U.S. Maritime Advisories (MARAD)", url: "https://www.maritime.dot.gov/msci-advisories" },
  acp: { label: "Panama Canal advisories to shipping", url: "https://pancanal.com/en/advisories-to-shipping/" },
};

// Events marked on the long-term chart. `at` lists the chokepoints (by `match`) they apply to.
export const EVENTS = [
  { date: "2022-02-24", label: "Russia invades Ukraine", at: ["bosp", "kerch"], src: ["wotr"] },
  { date: "2023-07-17", label: "Black Sea Grain Initiative ends", at: ["bosp"], src: ["ced"] },
  { date: "2023-07-30", label: "Panama Canal caps daily transits at 32 (drought)", at: ["panama", "magellan"], src: ["gcPanama"] },
  { date: "2023-11-19", label: "Houthi attacks on shipping begin", at: ["mandeb", "suez", "good hope"], src: ["gcRedSea"] },
  { date: "2026-02-28", label: "US and Israeli strikes on Iran", at: ["hormuz", "mandeb", "suez", "good hope", "malacca"], src: ["csm"] },
  { date: "2026-06-20", label: "JMIC declares the strait open", at: ["hormuz"], src: ["jmicOpen"] },
];

export const PROFILES = [
  {
    match: "hormuz", name: "Strait of Hormuz", region: "Middle East", lat: 26.57, lon: 56.25,
    facts: [
      { text: "The only sea route out of the Persian Gulf.", src: ["eia"] },
      { text: "It handles about 11% of global maritime trade by weight.", src: ["unctad2025"] },
    ],
    commodities: { items: ["Crude oil", "Refined fuels", "LNG", "Containers"], src: ["eia", "iea", "unctad2025"] },
    official: ["ukmto", "jmic", "marad"],
  },
  {
    match: "mandeb", name: "Bab el-Mandeb", region: "Red Sea", lat: 12.6, lon: 43.4, labelDir: "left",
    facts: [
      { text: "Links the Red Sea with the Gulf of Aden, on the route between Asia, the Gulf and the Suez Canal.", src: ["eia"] },
      { text: "Shipping via the Red Sea typically accounts for about 10–15% of international maritime trade.", src: ["dia"] },
    ],
    commodities: { items: ["Crude oil", "Refined fuels", "Containers", "LNG (before 2024)"], src: ["eia", "dia"] },
    official: ["ukmto", "jmic", "marad"],
  },
  {
    match: "suez", name: "Suez Canal", region: "Egypt", lat: 30.59, lon: 32.44, labelDir: "left",
    facts: [
      { text: "Connects the Mediterranean with the Red Sea.", src: ["eia"] },
      { text: "By mid-2024, the tonnage of ships transiting the canal was down 70% as ships avoided the Red Sea.", src: ["unctad"] },
    ],
    commodities: { items: ["Containers", "Crude oil", "Refined fuels", "LNG"], src: ["eia", "unctad"] },
    official: ["ukmto", "jmic"],
  },
  {
    match: "good hope", name: "Cape of Good Hope", region: "Southern Africa", lat: -34.6, lon: 19.5,
    facts: [
      { text: "The route around Africa, used by ships avoiding the Red Sea and the Suez Canal.", src: ["unctad"] },
      { text: "Ship arrivals at the Cape of Good Hope were up 89% by mid-2024.", src: ["unctad"] },
    ],
    commodities: { items: ["Rerouted tankers", "Rerouted container ships", "LNG"], src: ["eia", "unctad"] },
    official: [],
  },
  {
    match: "malacca", name: "Strait of Malacca", region: "Southeast Asia", lat: 2.6, lon: 101.2,
    facts: [
      { text: "The shortest sea route between the Middle East and East and Southeast Asia, linking the Indian Ocean with the Pacific.", src: ["eia"] },
    ],
    commodities: { items: ["Crude oil", "Refined fuels", "LNG"], src: ["eia", "eiaLng"] },
    official: ["recaap"],
  },
  {
    match: "panama", name: "Panama Canal", region: "Central America", lat: 9.1, lon: -79.7, labelDir: "left",
    facts: [
      { text: "Links the Atlantic and the Pacific, and usually accounts for about 5% of global maritime trade.", src: ["imf"] },
      { text: "In fiscal year 2025 container ships and LPG carriers drove growth, while the bulk carrier segment was still recovering.", src: ["acpFy25"] },
    ],
    commodities: { items: ["Containers", "LPG", "Dry bulk", "Refined fuels"], src: ["acpFy25", "eia"] },
    official: ["acp"],
  },
  {
    match: "bosp", name: "Bosporus", region: "Turkey", lat: 41.12, lon: 29.07,
    facts: [
      { text: "Part of the Turkish Straits, the only sea link between the Black Sea and the Mediterranean.", src: ["eiaStraits"] },
    ],
    commodities: { items: ["Crude oil", "Refined fuels", "Grain"], src: ["eia", "cru"] },
    official: ["marad"],
  },
  {
    match: "resund", name: "Øresund", region: "Baltic", lat: 55.9, lon: 12.7,
    facts: [
      { text: "One of the Danish Straits, which connect the Baltic Sea with the North Sea.", src: ["eiaStraits"] },
    ],
    commodities: { items: ["Crude oil", "Refined fuels"], src: ["eiaStraits"] },
    official: [],
  },
  // Chokepoints with a short description only. PortWatch data is still shown in full.
  { match: "gibraltar", name: "Strait of Gibraltar", region: "Mediterranean", lat: 35.95, lon: -5.6, labelDir: "left", short: "Between Spain and Morocco; links the Atlantic Ocean with the Mediterranean." },
  { match: "dover", name: "Dover Strait", region: "North-west Europe", lat: 51.0, lon: 1.45, short: "Between England and France; links the English Channel with the North Sea." },
  { match: "taiwan", name: "Taiwan Strait", region: "East Asia", lat: 24.4, lon: 119.6, short: "Between Taiwan and mainland China; links the South and East China Seas." },
  { match: "korea", name: "Korea Strait", region: "East Asia", lat: 34.5, lon: 129.3, labelDir: "left", short: "Between South Korea and Japan; links the East China Sea with the Sea of Japan." },
  { match: "tsugaru", name: "Tsugaru Strait", region: "Japan", lat: 41.5, lon: 140.5, short: "Between Honshu and Hokkaido; links the Sea of Japan with the Pacific." },
  { match: "luzon", name: "Luzon Strait", region: "East Asia", lat: 20.5, lon: 121.0, short: "Between Taiwan and the Philippines; links the South China Sea with the Pacific." },
  { match: "lombok", name: "Lombok Strait", region: "Indonesia", lat: -8.7, lon: 115.7, short: "Between Bali and Lombok; links the Bali Sea with the Indian Ocean." },
  { match: "ombai", name: "Ombai Strait", region: "Indonesia / Timor-Leste", lat: -8.4, lon: 125.0, short: "Between the Alor islands and Timor; links the Banda Sea with the Savu Sea." },
  { match: "bohai", name: "Bohai Strait", region: "Northern China", lat: 38.3, lon: 121.0, short: "Between the Liaodong and Shandong peninsulas; links the Bohai Sea with the Yellow Sea." },
  { match: "torres", name: "Torres Strait", region: "Australia / Papua New Guinea", lat: -10.5, lon: 142.3, short: "Between Australia's Cape York and New Guinea; links the Arafura Sea with the Coral Sea." },
  { match: "sunda", name: "Sunda Strait", region: "Indonesia", lat: -6.0, lon: 105.8, labelDir: "left", short: "Between Java and Sumatra; links the Java Sea with the Indian Ocean." },
  { match: "makassar", name: "Makassar Strait", region: "Indonesia", lat: -2.0, lon: 118.0, short: "Between Borneo and Sulawesi; links the Celebes Sea with the Java Sea." },
  { match: "magellan", name: "Strait of Magellan", region: "Southern Chile", lat: -53.5, lon: -70.5, short: "At the southern tip of South America; links the Atlantic with the Pacific." },
  { match: "yucatan", name: "Yucatán Channel", region: "Gulf of Mexico", lat: 21.8, lon: -85.8, short: "Between Mexico and Cuba; links the Gulf of Mexico with the Caribbean Sea." },
  { match: "windward", name: "Windward Passage", region: "Caribbean", lat: 20.0, lon: -73.8, short: "Between Cuba and Hispaniola; links the Atlantic with the Caribbean Sea." },
  { match: "mona", name: "Mona Passage", region: "Caribbean", lat: 18.2, lon: -67.8, short: "Between Hispaniola and Puerto Rico; links the Atlantic with the Caribbean Sea." },
  { match: "balabac", name: "Balabac Strait", region: "Philippines / Malaysia", lat: 7.8, lon: 117.0, short: "Between Palawan and Borneo; links the South China Sea with the Sulu Sea." },
  { match: "bering", name: "Bering Strait", region: "Arctic", lat: 65.8, lon: -169.0, short: "Between Russia and Alaska; links the Bering Sea with the Arctic Ocean." },
  { match: "mindoro", name: "Mindoro Strait", region: "Philippines", lat: 12.6, lon: 120.6, short: "Off the island of Mindoro; links the South China Sea with the Sulu Sea." },
  { match: "kerch", name: "Kerch Strait", region: "Black Sea / Sea of Azov", lat: 45.3, lon: 36.5, short: "Between Crimea and Russia's Taman peninsula; the only link between the Sea of Azov and the Black Sea." },
];
