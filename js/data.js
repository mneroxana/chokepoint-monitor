// ---------------------------------------------------------------------------
// Data layer: IMF PortWatch (ArcGIS FeatureServer) → compact daily rows.
//
// Strategy ("stale-while-revalidate"):
//   1. Render immediately from data/portwatch.json, a snapshot that a GitHub
//      Action refreshes daily (same-origin, fast, survives API outages).
//   2. In the background, query the live PortWatch API from the browser and
//      re-render if it returns newer data.
//
// Row format (shared with scripts/fetch_portwatch.py):
//   [date, n_total, n_tanker, n_dry_bulk, n_container, n_general_cargo, n_roro,
//    capacity, capacity_tanker, capacity_dry_bulk, capacity_container]
// ---------------------------------------------------------------------------
import { API, CHOKEPOINTS } from "./config.js";

export const COL = { date: 0, total: 1, tanker: 2, bulk: 3, container: 4, general: 5, roro: 6, cap: 7, capTanker: 8, capBulk: 9, capContainer: 10 };

const pad = (n) => String(n).padStart(2, "0");

function toRow(a) {
  const num = (v) => (v == null || Number.isNaN(+v) ? 0 : +v);
  return [
    `${a.year}-${pad(a.month)}-${pad(a.day)}`,
    num(a.n_total), num(a.n_tanker), num(a.n_dry_bulk), num(a.n_container),
    num(a.n_general_cargo), num(a.n_roro),
    Math.round(num(a.capacity)), Math.round(num(a.capacity_tanker)),
    Math.round(num(a.capacity_dry_bulk)), Math.round(num(a.capacity_container)),
  ];
}

async function queryPage(where, offset) {
  const params = new URLSearchParams({
    where,
    outFields: API.fields.join(","),
    returnGeometry: "false",
    orderByFields: "year ASC,month ASC,day ASC",
    resultOffset: String(offset),
    resultRecordCount: String(API.pageSize),
    f: "json",
  });
  const res = await fetch(`${API.daily}?${params}`);
  if (!res.ok) throw new Error(`PortWatch HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`PortWatch: ${json.error.message || "query error"}`);
  return json;
}

async function fetchChokepoint(cp) {
  const where = `portname LIKE '%${cp.match}%' AND year >= ${API.startYear}`;
  const rows = [];
  let portname = null, portid = null;
  for (let offset = 0; offset < 20000; offset += API.pageSize) {
    const page = await queryPage(where, offset);
    const feats = page.features || [];
    for (const f of feats) {
      portname ??= f.attributes.portname;
      portid ??= f.attributes.portid;
      rows.push(toRow(f.attributes));
    }
    if (!page.exceededTransferLimit && feats.length < API.pageSize) break;
  }
  // De-duplicate by date (keeps the last record if PortWatch revised a day).
  const byDate = new Map(rows.map((r) => [r[0], r]));
  return { portname, portid, rows: [...byDate.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1)) };
}

/** Live pull from PortWatch for every configured chokepoint (parallel). */
export async function fetchLive() {
  const results = await Promise.allSettled(CHOKEPOINTS.map(fetchChokepoint));
  const chokepoints = {};
  results.forEach((r, i) => {
    const cp = CHOKEPOINTS[i];
    if (r.status === "fulfilled" && r.value.rows.length) chokepoints[cp.key] = r.value;
  });
  if (!Object.keys(chokepoints).length) throw new Error("PortWatch live query returned no data");
  return { source: "live", generated: new Date().toISOString(), chokepoints };
}

/** Snapshot committed to the repo by the GitHub Action. */
export async function fetchSnapshot() {
  const res = await fetch("data/portwatch.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
  const json = await res.json();
  return { ...json, source: "snapshot" };
}

export async function fetchOptional(path, type = "json") {
  try {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) return null;
    return type === "json" ? await res.json() : await res.text();
  } catch {
    return null;
  }
}

export function latestDate(dataset) {
  let max = "";
  for (const c of Object.values(dataset.chokepoints)) {
    const last = c.rows.at(-1)?.[0];
    if (last && last > max) max = last;
  }
  return max;
}
