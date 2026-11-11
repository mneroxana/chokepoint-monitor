// ---------------------------------------------------------------------------
// Analytics: turn daily transit counts into risk signals.
//
//  • 7-day moving averages (PortWatch daily counts are noisy).
//  • % change vs a chosen baseline (same week last year, or pre-Red Sea 2023).
//  • z-score of the current 7DMA vs the prior year's distribution.
//  • Status band (Normal / Watch / Disrupted / Severe / Surge).
//  • Commodity risk score = structural exposure × disruption intensity.
// ---------------------------------------------------------------------------
import { COL } from "./data.js";
import { BASELINES, STATUS, WORLD } from "./config.js";

const DAY = 86400000;
export const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const pct = (cur, base) => (cur == null || !base ? null : ((cur - base) / base) * 100);

export function indexRows(rows) {
  return new Map(rows.map((r) => [r[0], r]));
}

/** Mean of a column over [end-days+1, end]; null if fewer than minDays observed. */
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

/** Rolling 7-day mean for each date in [from, to]. */
export function rolling7(idx, from, to, col) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push([d, windowMean(idx, d, 7, col, 4)]);
  return out;
}

export function statusFor(chg) {
  if (chg == null) return { id: "nodata", label: "No data", icon: "–" };
  return STATUS.find((s) => chg <= s.max);
}

/** Baseline value for a column given the selected baseline mode. */
function baselineValue(rows, idx, asOf, mode, col) {
  if (mode === "pre") return rangeMean(rows, BASELINES.pre.from, BASELINES.pre.to, col);
  return windowMean(idx, addDays(asOf, -364), 7, col); // 364 = same weekday last year
}

export function computeMetrics(conf, data, mode) {
  if (!data || !data.rows.length) return { key: conf.key, conf, empty: true, status: statusFor(null) };
  const { rows } = data;
  const idx = indexRows(rows);
  const asOf = rows.at(-1)[0];

  const cols = { total: COL.total, tanker: COL.tanker, bulk: COL.bulk, container: COL.container, cap: COL.cap, capTanker: COL.capTanker };
  const cur = {}, base = {}, chg = {};
  for (const [k, c] of Object.entries(cols)) {
    cur[k] = windowMean(idx, asOf, 7, c);
    base[k] = baselineValue(rows, idx, asOf, mode, c);
    chg[k] = pct(cur[k], base[k]);
  }
  const prevWeek = windowMean(idx, addDays(asOf, -7), 7, COL.total);
  const wow = pct(cur.total, prevWeek);

  // z-score: current 7DMA vs distribution of 7DMAs over the year before the last month.
  const hist = rolling7(idx, addDays(asOf, -395), addDays(asOf, -31), COL.total).map((p) => p[1]).filter((v) => v != null);
  const mu = mean(hist);
  const sd = hist.length > 30 ? Math.sqrt(mean(hist.map((v) => (v - mu) ** 2))) : null;
  const z = sd ? (cur.total - mu) / sd : null;

  // Structural exposure (0–100): energy share of world seaborne flows + cargo weight.
  const oilShare = conf.oilMbd ? conf.oilMbd / WORLD.maritimeOilMbd : 0;
  const lngShare = conf.lngBcfd ? conf.lngBcfd / WORLD.lngBcfd : 0;
  const energy = clamp((0.7 * oilShare + 0.3 * lngShare) / 0.25, 0, 1);

  // Disruption intensity (0–100): drop in all traffic and in tankers specifically.
  const drop = (v) => clamp(-(v ?? 0), 0, 100);
  const disruption = 0.5 * drop(chg.total) + 0.5 * drop(chg.tanker);

  return {
    key: conf.key, conf, asOf, cur, base, chg, wow, z,
    status: statusFor(chg.total),
    energy, oilShare, lngShare, disruption,
    baseCap: base.cap,
    rows, idx,
  };
}

/** Second pass: cargo weight needs all chokepoints to normalise. */
export function finaliseScores(metrics) {
  const maxCap = Math.max(...metrics.filter((m) => !m.empty).map((m) => m.baseCap || 0), 1);
  for (const m of metrics) {
    if (m.empty) { m.exposure = null; m.score = null; continue; }
    const cargo = (m.baseCap || 0) / maxCap;
    m.exposure = Math.round(100 * clamp(0.75 * m.energy + 0.25 * cargo, 0, 1));
    // Score = exposure × (structural floor 0.35 + 0.65 × disruption)
    m.score = Math.round(m.exposure * (0.35 + 0.65 * (m.disruption / 100)));
  }
  return metrics.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

// ---------------------------------------------------------------------------
// Scenario: what if a chokepoint loses X% of capacity for N days?
// ---------------------------------------------------------------------------
export function runScenario(m, lossPct, days) {
  const f = lossPct / 100;
  const c = m.conf;
  const oilLost = c.oilMbd ? c.oilMbd * f : null;
  const bypass = c.bypass?.mbd ?? 0;
  // Bypass pipelines only help with crude/products, and only up to their capacity.
  const oilNet = oilLost == null ? null : Math.max(0, oilLost - bypass);
  const lngLost = c.lngBcfd ? c.lngBcfd * f : null;
  const baseVessels = m.base?.total ?? null;
  const baseTons = m.base?.cap ?? null;
  return {
    oilLost, oilNet, bypassUsed: oilLost == null ? 0 : Math.min(bypass, oilLost),
    oilShareWorld: oilNet == null ? null : (oilNet / WORLD.maritimeOilMbd) * 100,
    cumulativeMb: oilNet == null ? null : oilNet * days,
    lngLost, lngShareWorld: lngLost == null ? null : (lngLost / WORLD.lngBcfd) * 100,
    vesselsPerDay: baseVessels == null ? null : baseVessels * f,
    tonsPerDay: baseTons == null ? null : baseTons * f,
    cumulativeMt: baseTons == null ? null : (baseTons * f * days) / 1e6,
    observedChg: m.chg?.total ?? null,
  };
}

// ---------------------------------------------------------------------------
// Rule-based brief: a deterministic, data-driven summary (no LLM needed).
// ---------------------------------------------------------------------------
const fmtPct = (v) => (v == null ? "n/a" : `${v > 0 ? "+" : ""}${v.toFixed(0)}%`);

export function ruleBasedBrief(metrics, mode) {
  const live = metrics.filter((m) => !m.empty);
  const M = Object.fromEntries(live.map((m) => [m.key, m]));
  const lines = [];
  const top = live.slice(0, 3);
  lines.push(
    `Highest commodity-risk chokepoints: ${top.map((m) => `${m.conf.name} (score ${m.score}, transits ${fmtPct(m.chg.total)} ${BASELINES[mode].short})`).join("; ")}.`
  );
  const severe = live.filter((m) => ["severe", "disrupted"].includes(m.status.id));
  if (severe.length)
    lines.push(`${severe.length} chokepoint${severe.length > 1 ? "s are" : " is"} disrupted or worse: ${severe.map((m) => m.conf.name).join(", ")}.`);
  const tankerHit = live.filter((m) => m.chg.tanker != null && m.chg.tanker < -25 && m.conf.oilMbd);
  for (const m of tankerHit.slice(0, 2)) {
    const lost = (m.conf.oilMbd * Math.min(100, -m.chg.tanker)) / 100;
    lines.push(
      `${m.conf.name}: tanker transits ${fmtPct(m.chg.tanker)}. Applied to EIA's ${m.conf.oilMbd} mb/d normal flow, that implies roughly ${lost.toFixed(1)} mb/d of oil not moving by sea through this route (before bypasses) — watch ${m.conf.trader[0]}.`
    );
  }
  if (M.cape && M.babelmandeb && M.cape.chg.total > 10 && M.babelmandeb.chg.total < -10)
    lines.push(`Rerouting signal: Cape of Good Hope ${fmtPct(M.cape.chg.total)} while Bab el-Mandeb is ${fmtPct(M.babelmandeb.chg.total)} — ships are still avoiding the Red Sea, supporting ton-mile demand and freight rates.`);
  const movers = [...live].filter((m) => m.wow != null).sort((a, b) => Math.abs(b.wow) - Math.abs(a.wow)).slice(0, 2);
  if (movers.length)
    lines.push(`Biggest week-on-week moves: ${movers.map((m) => `${m.conf.name} ${fmtPct(m.wow)}`).join(", ")}.`);
  const zs = live.filter((m) => m.z != null && Math.abs(m.z) >= 2);
  if (zs.length)
    lines.push(`Statistically unusual (|z| ≥ 2 vs prior-year range): ${zs.map((m) => `${m.conf.name} (z = ${m.z.toFixed(1)})`).join(", ")}.`);
  return lines;
}
