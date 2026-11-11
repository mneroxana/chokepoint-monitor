// ---------------------------------------------------------------------------
// Data loading.
//
// 1. data/portwatch.json: for every chokepoint, daily data for about two
//    years, weekly averages since 2019 and the 2019–2022 seasonal normal,
//    downloaded from IMF PortWatch every day by a GitHub Action.
// 2. A direct request to PortWatch from your browser for the last few weeks,
//    so the page shows the newest published days even between Action runs.
//
// Row layout (same as scripts/fetch_portwatch.py):
//   [date, ships: total, tanker, dry bulk, container, general, ro-ro,
//          tons:  total, tanker, dry bulk, container, general, ro-ro]
// ---------------------------------------------------------------------------
import { PORTWATCH } from "./config.js";
import { PROFILES } from "./profiles.js";

export const COL = { date: 0, total: 1, tanker: 2, bulk: 3, container: 4, general: 5, roro: 6, cap: 7 };

const pad = (n) => String(n).padStart(2, "0");
const n = (v) => (v == null || Number.isNaN(+v) ? 0 : +v);

function toRow(a) {
  return [
    `${a.year}-${pad(a.month)}-${pad(a.day)}`,
    n(a.n_total), n(a.n_tanker), n(a.n_dry_bulk), n(a.n_container), n(a.n_general_cargo), n(a.n_roro),
    Math.round(n(a.capacity)), Math.round(n(a.capacity_tanker)), Math.round(n(a.capacity_dry_bulk)),
    Math.round(n(a.capacity_container)), Math.round(n(a.capacity_general_cargo)), Math.round(n(a.capacity_roro)),
  ];
}

export function profileFor(name) {
  const lower = (name || "").toLowerCase();
  return PROFILES.find((p) => lower.includes(p.match)) || null;
}

export async function loadSnapshot() {
  const res = await fetch("data/portwatch.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`The data file could not be loaded (HTTP ${res.status}).`);
  const json = await res.json();
  if (!json.chokepoints || !Object.values(json.chokepoints)[0]?.normal) {
    throw new Error("The data file is in an old format. Run the “Update PortWatch data” action once.");
  }
  return json;
}

/** Fetch the last few weeks for all chokepoints straight from PortWatch and merge them in. */
export async function topUpFromPortWatch(dataset) {
  const from = new Date(Date.now() - PORTWATCH.topUpDays * 86400000);
  const y = from.getUTCFullYear(), m = from.getUTCMonth() + 1;
  const where = `(year = ${y} AND month >= ${m}) OR year > ${y}`;
  const fields = "year,month,day,portid,portname,n_total,n_tanker,n_dry_bulk,n_container,n_general_cargo,n_roro,capacity,capacity_tanker,capacity_dry_bulk,capacity_container,capacity_general_cargo,capacity_roro";
  let added = 0, latest = dataset.latest;
  for (let offset = 0; offset < 10000; offset += PORTWATCH.pageSize) {
    const params = new URLSearchParams({
      where, outFields: fields, returnGeometry: "false",
      orderByFields: "portid ASC,year ASC,month ASC,day ASC",
      resultOffset: String(offset), resultRecordCount: String(PORTWATCH.pageSize), f: "json",
    });
    const res = await fetch(`${PORTWATCH.daily}?${params}`);
    if (!res.ok) throw new Error(`PortWatch HTTP ${res.status}`);
    const page = await res.json();
    if (page.error) throw new Error(page.error.message || "PortWatch query error");
    for (const f of page.features || []) {
      const a = f.attributes;
      const cp = dataset.chokepoints[a.portid];
      if (!cp) continue;
      const row = toRow(a);
      const i = cp.rows.findIndex((r) => r[0] >= row[0]);
      if (i === -1) { cp.rows.push(row); added++; }
      else if (cp.rows[i][0] === row[0]) cp.rows[i] = row; // PortWatch revised this day
      else { cp.rows.splice(i, 0, row); added++; }
      if (row[0] > latest) latest = row[0];
    }
    if (!page.exceededTransferLimit && (page.features || []).length < PORTWATCH.pageSize) break;
  }
  dataset.latest = latest;
  return added;
}

export async function loadOptional(path, type = "json") {
  try {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) return null;
    return type === "json" ? await res.json() : await res.text();
  } catch {
    return null;
  }
}
