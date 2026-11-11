// ---------------------------------------------------------------------------
// UI: map, ranking table, detail view with chart, scenario tool, brief.
// Plain ES modules + Leaflet; hand-built SVG chart (no framework, no build).
// ---------------------------------------------------------------------------
import { CHOKEPOINTS, BASELINES } from "./config.js";
import { fetchLive, fetchSnapshot, fetchOptional, latestDate, COL } from "./data.js";
import { computeMetrics, finaliseScores, rolling7, addDays, runScenario, ruleBasedBrief, windowMean } from "./analytics.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtPct = (v, d = 0) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`);
const fmtNum = (v, d = 0) => (v == null ? "–" : v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));
const fmtTons = (v) => (v == null ? "–" : v >= 1e6 ? `${(v / 1e6).toFixed(2)} Mt` : `${(v / 1e3).toFixed(0)} kt`);
const cls = (v) => (v == null ? "muted" : v < 0 ? "neg" : "pos");
const fmtDate = (d) => (d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "–");
const statusColor = (id) => `var(--st-${id})`;

const state = { dataset: null, metrics: [], mode: "yoy", selected: "hormuz", context: null, map: null, markers: {} };

// ------------------------------------------------------------------ boot
async function boot() {
  $("#baseline").addEventListener("change", (e) => { state.mode = e.target.value; recompute(); });
  const [context, brief] = await Promise.all([fetchOptional("data/context.json"), fetchOptional("data/brief.md", "text")]);
  state.context = context;
  renderAiBrief(brief);
  initMap();
  initScenario();

  let snapshotDate = "";
  try {
    const snap = await fetchSnapshot();
    if (Object.keys(snap.chokepoints || {}).length) {
      state.dataset = snap;
      snapshotDate = latestDate(snap);
      setPill("snap", `Snapshot · data to ${fmtDate(snapshotDate)} · checking live…`);
      recompute();
    }
  } catch { /* no snapshot yet — fine */ }

  try {
    const live = await fetchLive();
    const liveDate = latestDate(live);
    if (!state.dataset || liveDate >= snapshotDate) {
      state.dataset = live;
      recompute();
    }
    setPill("live", `Live from PortWatch · data to ${fmtDate(latestDate(state.dataset))}`);
  } catch (err) {
    console.warn("Live PortWatch query failed:", err);
    if (state.dataset) setPill("snap", `Snapshot ${fmtDate(state.dataset.generated?.slice(0, 10))} · data to ${fmtDate(snapshotDate)}`);
    else {
      setPill("err", "No data available");
      $("#kpis").innerHTML = `<div class="card empty" style="grid-column:1/-1">Could not reach the PortWatch API and no snapshot is present yet. Run the “Update PortWatch data” GitHub Action once, or open the browser console for details.</div>`;
    }
  }
}

function setPill(kind, text) {
  const p = $("#source-pill");
  p.className = `pill ${kind}`;
  p.textContent = text;
}

function recompute() {
  const ds = state.dataset;
  const ms = CHOKEPOINTS.map((c) => computeMetrics(c, ds.chokepoints[c.key], state.mode));
  state.metrics = finaliseScores(ms);
  if (!state.metrics.find((m) => m.key === state.selected && !m.empty)) state.selected = state.metrics[0]?.key;
  renderKPIs();
  renderMap();
  renderTable();
  renderDetail();
  renderScenario();
  renderRuleBrief();
}

// ------------------------------------------------------------------ KPIs
function renderKPIs() {
  const live = state.metrics.filter((m) => !m.empty);
  const disrupted = live.filter((m) => ["severe", "disrupted"].includes(m.status.id));
  const top = live[0];
  const worst = [...live].sort((a, b) => (a.chg.total ?? 0) - (b.chg.total ?? 0))[0];
  const asOf = latestDate(state.dataset);
  const k = (label, value, foot) => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="foot">${foot}</div></div>`;
  $("#kpis").innerHTML = [
    k("Chokepoints disrupted or severe", `${disrupted.length}<span class="muted" style="font-size:16px"> / ${live.length}</span>`, disrupted.map((m) => m.conf.name).join(", ") || "None below −25%"),
    k("Highest commodity risk", esc(top?.conf.name ?? "–"), top ? `Score ${top.score} · exposure ${top.exposure}` : ""),
    k("Largest traffic drop", `<span class="neg">${fmtPct(worst?.chg.total)}</span>`, worst ? `${esc(worst.conf.name)} · ${BASELINES[state.mode].short}` : ""),
    k("Data through", fmtDate(asOf), "PortWatch updates weekly; recent days may be revised"),
  ].join("");
}

// ------------------------------------------------------------------ Map
function initMap() {
  state.map = L.map("map", { worldCopyJump: true, zoomControl: true, attributionControl: true, minZoom: 1 }).setView([22, 45], 2);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd", maxZoom: 8,
  }).addTo(state.map);
}

function renderMap() {
  for (const mk of Object.values(state.markers)) mk.remove();
  state.markers = {};
  const css = getComputedStyle(document.documentElement);
  for (const m of state.metrics) {
    const color = css.getPropertyValue(`--st-${m.status.id}`).trim();
    const radius = 6 + ((m.exposure ?? 10) / 100) * 16;
    const mk = L.circleMarker([m.conf.lat, m.conf.lon], {
      radius, color: m.key === state.selected ? "#f0efec" : "#1a1a19", weight: 2, fillColor: color, fillOpacity: 0.85,
    }).addTo(state.map);
    mk.bindTooltip(
      `<b>${esc(m.conf.name)}</b><br>${m.status.icon} ${m.status.label}` +
      (m.empty ? "" : `<br>${fmtNum(m.cur.total, 1)} ships/day · ${fmtPct(m.chg.total)} ${BASELINES[state.mode].short}<br>Risk score ${m.score}`),
      { direction: "top", offset: [0, -radius] }
    );
    mk.on("click", () => select(m.key));
    state.markers[m.key] = mk;
  }
}

// ------------------------------------------------------------------ Table
function statusBadge(s) {
  return `<span class="status"><span class="dot" style="background:${statusColor(s.id)}"></span>${s.icon} ${s.label}</span>`;
}

function renderTable() {
  const head = `<thead><tr><th>Chokepoint</th><th>Status</th><th>Ships/day</th><th>Δ total</th><th>Δ tankers</th><th>Δ bulk</th><th>Δ box</th><th title="z-score of the 7-day average vs the prior 12 months">z</th><th>Score</th></tr></thead>`;
  const body = state.metrics.map((m) => {
    if (m.empty) return `<tr data-k="${m.key}"><td>${esc(m.conf.name)}</td><td>${statusBadge(m.status)}</td><td colspan="7" class="muted">No data returned</td></tr>`;
    return `<tr data-k="${m.key}" class="${m.key === state.selected ? "sel" : ""}">
      <td>${esc(m.conf.name)}</td>
      <td>${statusBadge(m.status)}</td>
      <td>${fmtNum(m.cur.total, 1)}</td>
      <td class="${cls(m.chg.total)}">${fmtPct(m.chg.total)}</td>
      <td class="${cls(m.chg.tanker)}">${fmtPct(m.chg.tanker)}</td>
      <td class="${cls(m.chg.bulk)}">${fmtPct(m.chg.bulk)}</td>
      <td class="${cls(m.chg.container)}">${fmtPct(m.chg.container)}</td>
      <td>${m.z == null ? "–" : m.z.toFixed(1)}</td>
      <td><span class="scorebar"><b>${m.score}</b><span class="track"><span class="fill" style="width:${m.score}%"></span></span></span></td>
    </tr>`;
  }).join("");
  const t = $("#ranking");
  t.innerHTML = head + `<tbody>${body}</tbody>`;
  t.querySelectorAll("tbody tr").forEach((tr) => tr.addEventListener("click", () => select(tr.dataset.k)));
}

function select(key) {
  state.selected = key;
  renderTable();
  renderMap();
  renderDetail();
  $("#sc-cp").value = key;
  renderScenario();
  $("#detail").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ------------------------------------------------------------------ Detail
function renderDetail() {
  const m = state.metrics.find((x) => x.key === state.selected);
  const el = $("#detail");
  if (!m || m.empty) { el.innerHTML = `<div class="empty">Select a chokepoint.</div>`; return; }
  const c = m.conf;
  const notes = state.context?.notes?.[c.key] || [];
  const mode = BASELINES[state.mode];
  const types = [["Tankers", m.chg.tanker], ["Dry bulk", m.chg.bulk], ["Container", m.chg.container], ["All ships", m.chg.total]];
  const maxAbs = Math.max(50, ...types.map(([, v]) => Math.min(100, Math.abs(v ?? 0))));
  const bars = types.map(([l, v]) => {
    const w = v == null ? 0 : (Math.min(100, Math.abs(v)) / maxAbs) * 50;
    return `<span class="lab">${l}</span><span class="bar"><span class="${(v ?? 0) < 0 ? "n" : "p"}" style="width:${w}%"></span></span><span class="val ${cls(v)}">${fmtPct(v)}</span>`;
  }).join("");

  el.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${esc(c.name)}</h2>
        <div class="muted">${esc(c.region)} · data to ${fmtDate(m.asOf)} · ${statusBadge(m.status)}</div>
      </div>
      <div class="stats">
        <div class="stat"><div class="v">${fmtNum(m.cur.total, 1)}</div><div class="l">ships/day (7d avg)</div></div>
        <div class="stat"><div class="v ${cls(m.chg.total)}">${fmtPct(m.chg.total)}</div><div class="l">${esc(mode.short)}</div></div>
        <div class="stat"><div class="v">${fmtTons(m.cur.cap)}</div><div class="l">cargo/day (est.)</div></div>
        <div class="stat"><div class="v">${c.oilMbd ?? "–"}</div><div class="l">oil mb/d normal (EIA)</div></div>
        <div class="stat"><div class="v">${m.score}</div><div class="l">risk score</div></div>
      </div>
    </div>
    <div class="detail-grid">
      <div>
        <h3>Daily transits, 7-day average — last 12 months</h3>
        <div class="legend">
          <span><span class="sw" style="background:var(--series-1)"></span>Transits (7d avg)</span>
          <span><span class="sw dash"></span>${state.mode === "yoy" ? "Same days one year earlier" : "Jan–Oct 2023 average"}</span>
        </div>
        <div class="chart" id="chart"></div>
        <h3 style="margin-top:16px">Change by vessel type (${esc(mode.short)})</h3>
        <div class="typebars">${bars}</div>
      </div>
      <div class="side">
        <h3>Commodities exposed</h3>
        <div class="chips">${c.commodities.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>
        <h3>Trader watchlist</h3>
        <ul>${c.trader.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <h3>Risk drivers</h3>
        <ul>${c.risk.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <h3>Alternatives</h3>
        <ul>${c.bypass ? `<li>${esc(c.bypass.note)}</li>` : ""}<li>${esc(c.detour)}</li></ul>
        ${notes.length ? `<h3>Context notes</h3>` + notes.map((n) => `<div class="note"><div class="d">${esc(n.date)}${n.url ? ` · <a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.source || "source")}</a>` : ""}</div>${esc(n.text)}</div>`).join("") : ""}
      </div>
    </div>`;
  drawLineChart($("#chart"), m);
}

function drawLineChart(host, m) {
  const end = m.asOf;
  const start = addDays(end, -364);
  const cur = rolling7(m.idx, start, end, COL.total);
  const cmp = state.mode === "yoy"
    ? cur.map(([d]) => [d, windowMean(m.idx, addDays(d, -364), 7, COL.total, 4)])
    : cur.map(([d]) => [d, m.base.total]);
  const W = host.clientWidth || 700, H = host.clientHeight || 260;
  const pad = { l: 40, r: 12, t: 10, b: 24 };
  const vals = [...cur, ...cmp].map((p) => p[1]).filter((v) => v != null);
  const yMax = Math.max(1, ...vals) * 1.1;
  const x = (i) => pad.l + (i / (cur.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const path = (pts) => {
    let d = "", pen = false;
    pts.forEach(([, v], i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const ticks = niceTicks(yMax);
  const months = cur.map(([d], i) => [d, i]).filter(([d]) => d.endsWith("-01"));
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Line chart of 7-day average transits">
    ${ticks.map((t) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)" stroke-width="1"/>
      <text x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end" fill="var(--text-muted)" font-size="11">${t}</text>`).join("")}
    ${months.map(([d, i]) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" fill="var(--text-muted)" font-size="11">${new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</text>`).join("")}
    <path d="${path(cmp)}" fill="none" stroke="var(--baseline)" stroke-width="2" stroke-dasharray="4 3"/>
    <path d="${path(cur)}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round"/>
    <line id="xh" y1="${pad.t}" y2="${H - pad.b}" stroke="var(--text-muted)" stroke-width="1" visibility="hidden"/>
    <circle id="xd" r="4" fill="var(--series-1)" stroke="var(--surface-1)" stroke-width="2" visibility="hidden"/>
    <rect x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" fill="transparent" id="hit"/>
  </svg>`;
  const svg = host.querySelector("svg"), tip = $("#tooltip");
  const xh = svg.querySelector("#xh"), xd = svg.querySelector("#xd");
  const hit = svg.querySelector("#hit");
  hit.addEventListener("mousemove", (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (cur.length - 1));
    if (i < 0 || i >= cur.length) return;
    const [d, v] = cur[i], b = cmp[i][1];
    xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.setAttribute("visibility", "visible");
    if (v != null) { xd.setAttribute("cx", x(i)); xd.setAttribute("cy", y(v)); xd.setAttribute("visibility", "visible"); }
    tip.hidden = false;
    tip.innerHTML = `<div class="t">${fmtDate(d)}</div>Transits: <b>${fmtNum(v, 1)}</b><br>${state.mode === "yoy" ? "Year earlier" : "2023 avg"}: ${fmtNum(b, 1)}${v != null && b ? ` <span class="${cls(v - b)}">(${fmtPct(((v - b) / b) * 100)})</span>` : ""}`;
    tip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 200)}px`;
    tip.style.top = `${e.clientY - 10}px`;
  });
  hit.addEventListener("mouseleave", () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); xd.setAttribute("visibility", "hidden"); });
}

function niceTicks(max) {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((s) => max / s <= 5) || 1000;
  const out = [];
  for (let t = 0; t <= max; t += step) out.push(t);
  return out;
}

// ------------------------------------------------------------------ Scenario
function initScenario() {
  $("#sc-cp").innerHTML = CHOKEPOINTS.map((c) => `<option value="${c.key}">${esc(c.name)}</option>`).join("");
  $("#sc-cp").value = state.selected;
  for (const id of ["#sc-cp", "#sc-loss", "#sc-days"]) $(id).addEventListener("input", renderScenario);
}

function renderScenario() {
  const loss = +$("#sc-loss").value, days = +$("#sc-days").value;
  $("#sc-loss-out").textContent = `${loss}%`;
  $("#sc-days-out").textContent = `${days} days`;
  const m = state.metrics.find((x) => x.key === $("#sc-cp").value);
  if (!m) return;
  const s = runScenario(m, loss, days);
  const box = (v, l) => `<div class="sc-box"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  const c = m.conf;
  $("#sc-out").innerHTML = [
    box(s.oilNet == null ? "n/a" : `${s.oilNet.toFixed(1)} mb/d`, `oil displaced after bypass${s.bypassUsed ? ` (${s.bypassUsed.toFixed(1)} mb/d via pipelines)` : ""}`),
    box(s.oilShareWorld == null ? "n/a" : `${s.oilShareWorld.toFixed(1)}%`, "of world seaborne oil trade"),
    box(s.cumulativeMb == null ? "n/a" : `${fmtNum(s.cumulativeMb)} mb`, `cumulative oil over ${days} days`),
    box(s.lngLost == null ? "n/a" : `${s.lngLost.toFixed(1)} bcf/d`, `LNG displaced${s.lngShareWorld != null ? ` (≈${s.lngShareWorld.toFixed(0)}% of global LNG trade)` : ""}`),
    box(s.vesselsPerDay == null ? "n/a" : fmtNum(s.vesselsPerDay, 0), "vessels/day to reroute or wait (vs baseline)"),
    box(s.cumulativeMt == null ? "n/a" : `${s.cumulativeMt.toFixed(1)} Mt`, `cargo affected over ${days} days (PortWatch est.)`),
    `<div class="sc-wide"><b>Read-through:</b> ${esc(c.trader.slice(0, 3).join(" · "))}.<br><b>Detour:</b> ${esc(c.detour)}<br><b>Reality check:</b> PortWatch currently shows transits ${fmtPct(s.observedChg)} ${esc(BASELINES[state.mode].short)} — ${s.observedChg != null && s.observedChg <= -loss ? "the observed disruption already exceeds this scenario." : "this scenario is worse than what is currently observed."}</div>`,
  ].join("");
}

// ------------------------------------------------------------------ Brief
function renderRuleBrief() {
  $("#rule-brief").innerHTML = ruleBasedBrief(state.metrics, state.mode).map((l) => `<li>${esc(l)}</li>`).join("");
}

function renderAiBrief(md) {
  if (!md || !md.trim()) return;
  // Minimal markdown: first line "<!-- generated: ... -->" optional, headings, bullets, paragraphs.
  const gen = md.match(/<!--\s*generated:\s*(.*?)\s*-->/)?.[1];
  // Line-by-line: headings, bullet runs, paragraphs.
  let html = "", list = [], para = [];
  const flush = () => {
    if (list.length) html += `<ul class="brief">${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`;
    if (para.length) html += `<p>${inline(para.join(" "))}</p>`;
    list = []; para = [];
  };
  for (const line of md.replace(/<!--.*?-->/gs, "").trim().split("\n")) {
    if (/^#+\s/.test(line)) { flush(); html += `<h4>${inline(line.replace(/^#+\s/, ""))}</h4>`; }
    else if (/^\s*[-*]\s+/.test(line)) { if (para.length) flush(); list.push(line.replace(/^\s*[-*]\s+/, "")); }
    else if (!line.trim()) flush();
    else { if (list.length) flush(); para.push(line.trim()); }
  }
  flush();
  $("#ai-brief").innerHTML = `${html}<div class="tag">AI-written summary${gen ? ` · generated ${esc(gen)}` : ""} · rule-based signals below</div>`;
  $("#brief-hint").textContent = "AI brief + rule-based signals";
}
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

boot();
