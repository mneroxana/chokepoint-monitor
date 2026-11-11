// ---------------------------------------------------------------------------
// Calculations. Every number here is derived from IMF PortWatch daily data
// and the UNCTAD world trade total in config.js. Nothing is estimated by AI.
// ---------------------------------------------------------------------------
import { COL } from "./data.js";
import { BASELINES, STATUS, WORLD, FOCUS, VESSEL_TYPES, ENERGY } from "./config.js";

const DAY = 86400000;
export const addDays = (d, k) => new Date(Date.parse(d + "T00:00:00Z") + k * DAY).toISOString().slice(0, 10);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
export const pct = (cur, base) => (cur == null || base == null || base === 0 ? null : ((cur - base) / base) * 100);

export const LOW_TRAFFIC = 5; // ships/day; below this, percentage changes are noisy

/** Average of a column over the `days` days ending on `end`. */
export function windowMean(idx, end, days, col, minDays = Math.ceil(days * 0.6)) {
  const vals = [];
  for (let i = 0; i < days; i++) {
    const r = idx.get(addDays(end, -i));
    if (r) vals.push(r[col]);
  }
  return vals.length >= minDays ? mean(vals) : null;
}

function rangeMean(rows, from, to, col) {
  return mean(rows.filter((r) => r[0] >= from && r[0] <= to).map((r) => r[col]));
}

/** 7-day average for each day between `from` and `to`. */
export function rolling7(idx, from, to, col) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push([d, windowMean(idx, d, 7, col, 4)]);
  return out;
}

/** Seasonal normal (2019–2022 average) for the 7 days ending on this calendar day. */
export function normalOn(cp, d, col) {
  const v = cp.normal?.[d.slice(5)];
  return v ? v[col - 1] : null;
}

export function statusFor(chg) {
  if (chg == null) return { id: "nodata", label: "No data", text: "not enough data" };
  return STATUS.find((s) => chg <= s.max);
}

/** The "normal" value of a column for the chosen baseline. */
export function baselineValue(cp, asOf, mode, col) {
  const b = BASELINES[mode];
  if (mode === "normal") return normalOn(cp, asOf, col);
  if (b.from) return rangeMean(cp.rows, b.from, b.to, col);
  return windowMean(cp.idx, addDays(asOf, -364), 7, col); // 364 days = same weekday last year
}

export function computeMetrics(cp, mode, focusKey) {
  const focus = FOCUS[focusKey];
  cp.idx ??= new Map(cp.rows.map((r) => [r[0], r]));
  const asOf = cp.rows.at(-1)[0];

  const cur = {}, base = {}, chg = {};
  const cols = { total: COL.total, cap: COL.cap };
  for (const t of VESSEL_TYPES) { cols[t.id] = t.col; cols[t.id + "Cap"] = t.capCol; }
  for (const [k, c] of Object.entries(cols)) {
    cur[k] = windowMean(cp.idx, asOf, 7, c);
    base[k] = baselineValue(cp, asOf, mode, c);
    chg[k] = pct(cur[k], base[k]);
  }
  const focusCur = windowMean(cp.idx, asOf, 7, focus.col);
  const focusBase = baselineValue(cp, asOf, mode, focus.col);
  const focusChg = pct(focusCur, focusBase);
  const wow = pct(focusCur, windowMean(cp.idx, addDays(asOf, -7), 7, focus.col));

  // Cargo (metric tonnes per day) for the selected cargo type: now, normal, and the gap.
  const tonsCur = windowMean(cp.idx, asOf, 7, focus.capCol);
  const tonsBase = baselineValue(cp, asOf, mode, focus.capCol);
  const gap = tonsCur == null || tonsBase == null ? null : tonsBase - tonsCur; // positive = cargo missing

  return {
    id: cp.id, cp, p: cp.profile, name: cp.displayName, asOf,
    cur, base, chg, focusCur, focusBase, focusChg, wow,
    tonsCur, tonsBase, gap,
    gapShareWorld: gap == null ? null : (gap / WORLD.seaborneTonsPerDay) * 100,
    normalTons: cp.normalAvg?.[focus.capCol - 1] ?? 0, // 2019–2022 average, for map circle size
    lowTraffic: (focusBase ?? 0) < LOW_TRAFFIC,
    status: statusFor(focusChg),
  };
}

/**
 * Ranking: by cargo missing per day (normal tonnage minus current tonnage) for
 * the selected cargo type. Real units, the same method for every commodity.
 */
export function rankAll(metrics) {
  const maxTons = Math.max(1, ...metrics.map((m) => m.normalTons));
  for (const m of metrics) m.size = Math.sqrt(m.normalTons / maxTons); // 0–1, for the map
  return metrics.sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity));
}

// ---------------------------------------------------------------------------
// Scenario calculator: loses a share of the chokepoint's normal cargo, by type.
// ---------------------------------------------------------------------------
export function runScenario(m, lossPct, days) {
  const f = lossPct / 100;
  const byType = VESSEL_TYPES.map((t) => {
    const normal = m.base[t.id + "Cap"];
    return { ...t, normalDay: normal, lostDay: normal == null ? null : normal * f, lostTotal: normal == null ? null : normal * f * days };
  });
  const tonsNormal = m.base.cap;
  const tonsLostDay = tonsNormal == null ? null : tonsNormal * f;
  return {
    f, days, byType,
    shipsNormal: m.base.total, shipsLost: m.base.total == null ? null : m.base.total * f,
    tonsNormal, tonsLostDay,
    tonsLostTotal: tonsLostDay == null ? null : tonsLostDay * days,
    shareWorld: tonsLostDay == null ? null : (tonsLostDay / WORLD.seaborneTonsPerDay) * 100,
  };
}

// ---------------------------------------------------------------------------
// Weekly summary, written by fixed rules from the numbers (not by AI)
// ---------------------------------------------------------------------------
const signed = (v) => { const r = Math.round(v); return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}%`; };
const ships = (v) => (v < 10 ? v.toFixed(1) : v.toFixed(0));

const tonsTxt = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)} million tonnes` : `${Math.round(v / 1e3).toLocaleString("en-GB")} thousand tonnes`);

export function weeklySummary(metrics, mode, focusKey) {
  const b = BASELINES[mode];
  const noun = FOCUS[focusKey].noun;
  const ok = metrics.filter((m) => m.focusChg != null && m.gap != null);
  const out = [];

  const missing = ok.filter((m) => m.gap > 0 && !m.lowTraffic).slice(0, 3);
  if (missing.length)
    out.push({
      title: "Most cargo missing",
      text: `${missing.map((m) => `${m.name} (${tonsTxt(m.gap)} a day)`).join(", ")}. Compared with: ${b.label}.`,
    });

  for (const m of ok.filter((x) => ["severe", "disrupted"].includes(x.status.id) && !x.lowTraffic).slice(0, 4)) {
    let t = `About ${ships(m.focusCur)} ${noun} a day, compared with ${ships(m.focusBase)} ${b.phrase}: ${signed(m.focusChg)}.`;
    if (focusKey === "all") {
      const parts = [["tankers", m.chg.tanker], ["dry bulk", m.chg.bulk], ["containers", m.chg.container]]
        .filter(([, v]) => v != null).map(([l, v]) => `${l} ${signed(v)}`);
      if (parts.length) t += ` By type: ${parts.join(", ")}.`;
    }
    if (m.gap > 0) t += ` Roughly ${tonsTxt(m.gap)} of cargo a day is not passing.`;
    const en = focusKey === "tanker" && m.p?.match ? ENERGY.flows[m.p.match] : null;
    if (en) t += ` Normally about ${en.oilMbd} million barrels of oil a day pass here (U.S. EIA).`;
    out.push({ title: m.name, text: t });
  }

  const surge = ok.filter((m) => m.status.id === "surge" && !m.lowTraffic);
  if (surge.length)
    out.push({
      title: "Traffic above normal",
      text: `${surge.map((m) => `${m.name} ${signed(m.focusChg)}`).join(", ")}. A rise often means ships are taking this route to avoid another one.`,
    });

  const movers = ok.filter((m) => m.wow != null && !m.lowTraffic && Math.abs(m.wow) >= 10).sort((a, b) => Math.abs(b.wow) - Math.abs(a.wow)).slice(0, 3);
  if (movers.length)
    out.push({ title: "Biggest changes since the previous week", text: movers.map((m) => `${m.name} ${signed(m.wow)}`).join(", ") + "." });
  return out;
}
