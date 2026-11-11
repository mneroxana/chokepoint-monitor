// ---------------------------------------------------------------------------
// Page rendering: map, ranking, chokepoint detail, scenario and weekly brief.
// ---------------------------------------------------------------------------
import { BASELINES, FOCUS, STATUS, VESSEL_TYPES, WORLD, ENERGY } from "./config.js";
import { SOURCES, OFFICIAL, EVENTS, REVIEWED } from "./profiles.js";
import { loadSnapshot, topUpFromPortWatch, loadOptional, profileFor, COL } from "./data.js";
import { computeMetrics, rankAll, rolling7, addDays, windowMean, runScenario, weeklySummary, normalOn, LOW_TRAFFIC } from "./analytics.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MINUS = "−";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtPct = (v) => { if (v == null) return "–"; const r = Math.round(v); return `${r > 0 ? "+" : r < 0 ? MINUS : ""}${Math.abs(r)}%`; };
const fmtNum = (v, d = 0) => (v == null ? "–" : v.toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d }));
const fmtShips = (v) => (v == null ? "–" : fmtNum(v, v < 10 ? 1 : 0));
const fmtGap = (v) => (v == null ? "–" : v >= 0 ? fmtTons(v) : `+${fmtTons(-v)}`);
const fmtTons = (v) => (v == null ? "–" : v >= 1e6 ? `${fmtNum(v / 1e6, v >= 1e8 ? 0 : 1)} Mt` : `${fmtNum(Math.round(v / 1e3) * 1e3)} t`);
const dirClass = (v) => (v == null || Math.round(v) === 0 ? "muted" : v < 0 ? "down" : "up");
const fmtDate = (d, opts = { day: "numeric", month: "long", year: "numeric" }) =>
  d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" }) : "–";
const shortDate = (d) => fmtDate(d, { day: "numeric", month: "short", year: "numeric" });
const src = (kind) => ({
  pw: '<span class="src src-pw">IMF PortWatch</span>', eia: '<span class="src src-eia">U.S. EIA</span>',
  calc: '<span class="src src-calc">Calculated</span>', analyst: '<span class="src src-analyst">Analyst view</span>',
  official: '<span class="src src-official">Official updates</span>',
}[kind]);
const statusVar = (id) => `var(--st-${id})`;
const statusPill = (s) => `<span class="status"><span class="dot" style="background:${statusVar(s.id)}"></span>${s.label}</span>`;

const state = {
  data: null, metrics: [], mode: "normal", focus: "all", selected: null, range: "year",
  map: null, markerLayer: null, checked: null, live: false,
};

// ------------------------------------------------------------------ start-up
async function boot() {
  $("#baseline").addEventListener("change", (e) => { state.mode = e.target.value; render(); });
  $("#focus").addEventListener("change", (e) => { state.focus = e.target.value; render(); });
  $("#status-key").innerHTML = STATUS.map((s) => `${statusPill(s)} <span class="muted">${s.text}.</span>`).join(" ");
  updateBaselineText();

  const [aiBrief, land, borders] = await Promise.all([
    loadOptional("data/brief.md", "text"), loadOptional("data/land.geojson"), loadOptional("data/borders.geojson"),
  ]);
  initMap(land, borders);
  initScenario();
  renderAiBrief(aiBrief);

  try {
    state.data = prepare(await loadSnapshot());
  } catch (err) {
    $("#freshness").textContent = err.message;
    $("#kpis").innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(err.message)} Open the repository on GitHub, go to Actions, choose “Update PortWatch data” and click “Run workflow”.</div>`;
    return;
  }
  state.checked = new Date();
  render();

  try {
    await topUpFromPortWatch(state.data);
    state.live = true;
    state.checked = new Date();
    render();
  } catch (err) {
    console.warn("Could not reach PortWatch directly; showing the saved copy.", err);
    updateFreshness();
  }
}

function prepare(raw) {
  const cps = {};
  for (const [id, c] of Object.entries(raw.chokepoints)) {
    if (!c.rows?.length) continue;
    const profile = profileFor(c.name);
    cps[id] = {
      id, rows: c.rows, profile, industries: c.industries || [],
      normal: c.normal, normalAvg: c.normalAvg, weekly: c.weekly || [], first: c.first,
      displayName: profile?.name || c.name,
      lat: c.lat ?? profile?.lat, lon: c.lon ?? profile?.lon,
    };
  }
  return { generated: raw.generated, latest: raw.latest, chokepoints: cps };
}

function render() {
  updateBaselineText();
  const cps = Object.values(state.data.chokepoints);
  for (const cp of cps) cp.idx = null; // rows may have changed after the live update
  state.metrics = rankAll(cps.map((cp) => computeMetrics(cp, state.mode, state.focus)));
  if (!state.selected || !state.metrics.find((m) => m.id === state.selected)) state.selected = state.metrics[0]?.id;
  updateFreshness();
  renderKpis();
  renderMap();
  renderTable();
  renderDetail();
  refreshScenarioOptions();
  renderScenario();
  renderBrief();
}

function updateBaselineText() {
  const b = BASELINES[state.mode];
  $("#baseline-explain").innerHTML = `<b>${esc(b.label)}:</b> ${esc(b.explain)}`;
}

function updateFreshness() {
  if (!state.data) return;
  const time = state.checked?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const how = state.live
    ? `Checked with PortWatch today at ${time}.`
    : `Showing the copy saved on ${shortDate(state.data.generated?.slice(0, 10))}; PortWatch could not be reached directly.`;
  $("#freshness").innerHTML = `Ship data up to <b>${fmtDate(state.data.latest)}</b>. IMF PortWatch publishes once a week with a few days' delay. ${how}`;
}

// ------------------------------------------------------------------ headline figures
function renderKpis() {
  const ms = state.metrics;
  const reliable = ms.filter((m) => !m.lowTraffic && m.focusChg != null);
  const disrupted = ms.filter((m) => ["severe", "disrupted"].includes(m.status.id));
  const surge = reliable.filter((m) => m.status.id === "surge");
  const top = ms.find((m) => m.gap != null);
  const worst = [...reliable].sort((a, b) => a.focusChg - b.focusChg)[0];
  const list = (arr) => {
    if (!arr.length) return "None";
    const names = arr.map((m) => m.name);
    return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
  };
  const kpi = (label, value, foot, small = false) =>
    `<div class="kpi"><div class="k-label">${label}</div><div class="k-value${small ? " small" : ""}">${value}</div><div class="k-foot">${foot}</div></div>`;
  $("#kpis").innerHTML = [
    kpi("Chokepoints disrupted", `${disrupted.length} <span class="of">of ${ms.length}</span>`, esc(list(disrupted))),
    kpi("Most cargo missing", esc(top?.name ?? "–"), top ? `${fmtTons(top.gap)} a day below normal (${fmtNum(top.gapShareWorld, 1)}% of world seaborne trade)` : "", true),
    kpi("Largest fall in traffic", `<span class="down">${fmtPct(worst?.focusChg)}</span>`, worst ? `${esc(worst.name)}, ${esc(BASELINES[state.mode].short)}` : ""),
    kpi("Traffic above normal", String(surge.length), surge.length ? `${esc(list(surge))}; often a sign of rerouting` : "No chokepoint more than 25% above normal"),
  ].join("");
}

// ------------------------------------------------------------------ map
function initMap(land, borders) {
  state.map = L.map("map", {
    zoomSnap: 0.25, minZoom: 0, maxZoom: 7, worldCopyJump: false,
    maxBounds: [[-65, -220], [82, 220]], maxBoundsViscosity: 0.8, attributionControl: true, scrollWheelZoom: false,
  });
  const fit = () => state.map.fitBounds([[-50, -150], [72, 165]], { padding: [6, 6] });
  fit();
  window.addEventListener("resize", () => { fit(); });
  state.map.on("zoomend moveend", () => placeLabels());
  state.map.attributionControl.setPrefix(false).addAttribution("Map: Natural Earth");
  if (land) L.geoJSON(land, { interactive: false, style: { stroke: false, fillColor: "#fbfaf8", fillOpacity: 1 } }).addTo(state.map);
  if (borders) L.geoJSON(borders, { interactive: false, style: { color: "#dcd5cb", weight: 0.6, fill: false } }).addTo(state.map);
  state.markerLayer = L.layerGroup().addTo(state.map);
  $("#map-legend").innerHTML =
    STATUS.map((s) => `<span><i class="dot" style="background:${statusVar(s.id)}"></i>${s.label}</span>`).join("") +
    `<span>Larger circle = more cargo normally</span><span>Black outline = selected</span>`;
}

function renderMap() {
  state.markerLayer.clearLayers();
  const css = getComputedStyle(document.documentElement);
  state.mapMarkers = [];
  // draw large circles first so small ones stay on top and clickable
  for (const m of [...state.metrics].sort((a, b) => b.size - a.size)) {
    if (m.cp.lat == null) continue;
    const radius = 5 + m.size * 15;
    const sel = m.id === state.selected;
    const mk = L.circleMarker([m.cp.lat, m.cp.lon], {
      radius, color: sel ? "#111111" : "#ffffff", weight: sel ? 3 : 1.5,
      fillColor: css.getPropertyValue(`--st-${m.status.id}`).trim(), fillOpacity: 0.9,
    });
    mk.bindTooltip(
      `<b>${esc(m.name)}</b><br>${m.status.label}: ${fmtPct(m.focusChg)} ${esc(BASELINES[state.mode].short)}<br>` +
      `${fmtShips(m.focusCur)} ${esc(FOCUS[state.focus].noun)} a day<br>Cargo vs normal: ${m.gap == null ? "–" : m.gap >= 0 ? `${fmtTons(m.gap)} a day missing` : `${fmtTons(-m.gap)} a day extra`}`,
      { direction: "top", offset: [0, -radius] }
    );
    mk.on("click", () => select(m.id));
    mk.addTo(state.markerLayer);
    state.mapMarkers.push({ m, radius });
  }
  placeLabels();
}

/** Name the most relevant chokepoints, skipping any label that would overlap a circle or another label. */
function placeLabels() {
  if (!state.labelLayer) state.labelLayer = L.layerGroup().addTo(state.map);
  state.labelLayer.clearLayers();
  if (window.innerWidth < 700 || !state.mapMarkers) return;
  const size = state.map.getSize();
  const circles = state.mapMarkers.map(({ m, radius }) => {
    const p = state.map.latLngToContainerPoint([m.cp.lat, m.cp.lon]);
    return { m, radius, p, box: [p.x - radius, p.y - radius, p.x + radius, p.y + radius] };
  });
  const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const placed = [];
  // priority: the selected chokepoint, then the biggest cargo shortfalls, then the busiest
  const priority = (c) => (c.m.id === state.selected ? 1e12 : 0) + (c.m.tonsBase ?? 0) + 2 * Math.max(0, c.m.gap ?? 0);
  const order = [...circles].sort((a, b) => priority(b) - priority(a));
  for (const c of order) {
    if (placed.length >= 16) break;
    const w = c.m.name.length * 6.3 + 4, h = 15, r = c.radius, { x, y } = c.p;
    const options = [
      ["right", [x + r + 3, y - h / 2, x + r + 3 + w, y + h / 2], [r + 2, 0]],
      ["left", [x - r - 3 - w, y - h / 2, x - r - 3, y + h / 2], [-(r + 2), 0]],
      ["top", [x - w / 2, y - r - 3 - h, x + w / 2, y - r - 3], [0, -(r + 1)]],
      ["bottom", [x - w / 2, y + r + 3, x + w / 2, y + r + 3 + h], [0, r + 1]],
      ["right", [x + r * 0.7, y - r * 0.7 - h, x + r * 0.7 + w, y - r * 0.7], [r * 0.7 - 1, -r * 0.7 - h / 2]],
      ["right", [x + r * 0.7, y + r * 0.7, x + r * 0.7 + w, y + r * 0.7 + h], [r * 0.7 - 1, r * 0.7 + h / 2]],
      ["left", [x - r * 0.7 - w, y - r * 0.7 - h, x - r * 0.7, y - r * 0.7], [-r * 0.7 + 1, -r * 0.7 - h / 2]],
      ["left", [x - r * 0.7 - w, y + r * 0.7, x - r * 0.7, y + r * 0.7 + h], [-r * 0.7 + 1, r * 0.7 + h / 2]],
    ];
    const fit = options.find(([, box]) =>
      box[0] > 4 && box[1] > 4 && box[2] < size.x - 4 && box[3] < size.y - 4 &&
      !placed.some((pb) => overlaps(box, pb)) &&
      !circles.some((o) => o !== c && overlaps(box, o.box)));
    if (!fit) continue;
    placed.push(fit[1]);
    L.tooltip({ permanent: true, direction: fit[0], offset: fit[2], className: "map-label", interactive: false })
      .setLatLng([c.m.cp.lat, c.m.cp.lon]).setContent(esc(c.m.name)).addTo(state.labelLayer);
  }
}

// ------------------------------------------------------------------ ranking table
function renderTable() {
  const f = FOCUS[state.focus];
  const b = BASELINES[state.mode];
  const maxGap = Math.max(1, ...state.metrics.map((m) => m.gap ?? 0));
  const head = `<thead><tr>
    <th class="l">#</th><th class="l">Chokepoint</th><th class="l">Status</th>
    <th>${esc(cap(f.noun))} a day</th><th>Change ${esc(b.short)}</th>
    <th class="grp">Tankers</th><th>Dry bulk</th><th>Containers</th>
    <th class="grp">Normal cargo a day</th><th>Cargo missing a day</th>${state.focus === "tanker" ? '<th class="grp">Oil normally (EIA)</th>' : ""}</tr></thead>`;
  const rows = state.metrics.map((m, i) => `
    <tr data-id="${m.id}" class="${m.id === state.selected ? "sel" : ""} ${m.lowTraffic ? "low" : ""}" tabindex="0">
      <td class="l rank">${i + 1}</td>
      <td class="l"><span class="cp">${esc(m.name)}</span>${m.lowTraffic ? '<span class="tag-low">Low traffic</span>' : ""}<span class="region">${esc(m.p?.region ?? "")}</span></td>
      <td class="l">${statusPill(m.status)}</td>
      <td>${fmtShips(m.focusCur)}</td>
      <td class="${dirClass(m.focusChg)}">${fmtPct(m.focusChg)}</td>
      <td class="grp ${dirClass(m.chg.tanker)}">${fmtPct(m.chg.tanker)}</td>
      <td class="${dirClass(m.chg.bulk)}">${fmtPct(m.chg.bulk)}</td>
      <td class="${dirClass(m.chg.container)}">${fmtPct(m.chg.container)}</td>
      <td class="grp">${fmtTons(m.tonsBase)}</td>
      <td><span class="score"><b class="${m.gap > 0 ? "" : "muted"}">${fmtGap(m.gap)}</b><span class="track"><span class="fill" style="width:${Math.max(0, (m.gap ?? 0) / maxGap) * 100}%"></span></span></span></td>
      ${state.focus === "tanker" ? `<td class="grp">${energyFor(m) ? `${energyFor(m).oilMbd} mb/d` : '<span class="muted">–</span>'}</td>` : ""}
    </tr>`).join("");
  const t = $("#ranking");
  t.innerHTML = head + `<tbody>${rows}</tbody>`;
  t.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("click", () => select(tr.dataset.id));
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter") select(tr.dataset.id); });
  });
  $("#rank-lede").textContent =
    `All ${state.metrics.length} chokepoints tracked by PortWatch, ranked by how much cargo is missing compared with normal. Ships are 7-day averages; cargo is PortWatch's estimate in metric tonnes. Use the Cargo menu at the top to rank by tankers, dry bulk or containers. Click a row for details.`;
  $("#rank-foot").textContent =
    `Latest 7 days to ${fmtDate(state.data.latest)}. Cargo missing = normal cargo a day minus cargo in the latest week; a “+” means more cargo than normal. ` +
    `“Low traffic” means fewer than ${LOW_TRAFFIC} ships a day normally pass, so percentages are less reliable.` +
    (state.focus === "tanker" ? " Oil normally: average oil flow in million barrels a day, first half of 2025, from the U.S. EIA, which covers eight chokepoints." : "");
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const energyFor = (m) => (state.focus === "tanker" && m.p?.match ? ENERGY.flows[m.p.match] : null);
const eiaCite = () => `<sup class="cite"><a href="${esc(ENERGY.source.url)}" target="_blank" rel="noopener" title="${esc(ENERGY.source.label)}">[EIA]</a></sup>`;

function select(id) {
  state.selected = id;
  renderTable();
  renderMap();
  renderDetail();
  $("#sc-cp").value = id;
  renderScenario();
  $("#detail").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ------------------------------------------------------------------ chokepoint detail
const cite = (keys, used) => (keys || []).map((k) => {
  const s = SOURCES[k];
  if (!s) return "";
  if (!used.includes(k)) used.push(k);
  return `<sup class="cite"><a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.label)}">[${used.indexOf(k) + 1}]</a></sup>`;
}).join("");

function profileHtml(m) {
  const p = m.p || {};
  if (!p.facts) {
    return `<div class="profile">
      <h3>About this chokepoint</h3>
      <p>${esc(p.short || "No description yet.")}</p>
      <p class="reviewed">No detailed profile yet. The figures on this page come from IMF PortWatch.</p>
    </div>`;
  }
  const used = [];
  const facts = p.facts.map((f) => `<p>${esc(f.text)}${cite(f.src, used)}</p>`).join("");
  const commodities = `<div class="chips">${p.commodities.items.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>`;
  const official = p.official?.length ? `<div class="block-head" style="margin-top:22px"><h3 style="margin:0">Live official updates</h3>${src("official")}</div>
    <div class="official">${p.official.map((k) => `<a href="${esc(OFFICIAL[k].url)}" target="_blank" rel="noopener">${esc(OFFICIAL[k].label)}</a>`).join("")}</div>` : "";
  return `<div class="profile">
    <h3>Why it matters</h3>
    <div class="facts">${facts}</div>
    <h3>Main commodities</h3>${commodities}
    ${official}
    <p class="reviewed">Numbers in brackets link to sources. Profile last reviewed ${esc(REVIEWED)}.</p>
  </div>`;
}

function eventsFor(m) {
  const key = m.p?.match;
  return EVENTS.filter((e) => key && e.at.includes(key)).sort((a, b) => (a.date < b.date ? -1 : 1));
}

function renderDetail() {
  const m = state.metrics.find((x) => x.id === state.selected);
  if (!m) return;
  const p = m.p || {};
  const b = BASELINES[state.mode];
  const f = FOCUS[state.focus];

  // Cargo mix: share of normal (2019–2022) tonnage by vessel type, plus change in ships.
  const normal = VESSEL_TYPES.map((t) => ({ ...t, tons: m.cp.normalAvg?.[t.capCol - 1] ?? 0 }));
  const totalTons = normal.reduce((s, t) => s + t.tons, 0) || 1;
  const mixRows = normal.map((t) => `<tr>
      <td><b>${t.label}</b><span class="carries">${esc(t.carries)}</span></td>
      <td><span class="sharebar"><span style="width:${(t.tons / totalTons) * 100}%"></span></span>${fmtNum((t.tons / totalTons) * 100)}%</td>
      <td>${fmtTons(m.base[t.id + "Cap"])}</td>
      <td>${fmtTons(m.cur[t.id + "Cap"])}</td>
      <td class="${dirClass(m.chg[t.id])}">${fmtPct(m.chg[t.id])}</td></tr>`).join("");

  const industries = m.cp.industries.length ? `
    <div class="block">
      <div class="block-head"><h3>Main industries served</h3>${src("pw")}</div>
      <p class="lede">PortWatch's classification of the goods that most often pass this chokepoint.</p>
      <div class="chips">${m.cp.industries.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>
    </div>` : "";

  const en = energyFor(m);
  const energy = state.focus !== "tanker" ? "" : !en ? `
    <div class="block">
      <div class="block-head"><h3>Energy flows</h3><span class="src src-eia">U.S. EIA</span></div>
      <p class="lede">The U.S. EIA does not publish oil or LNG flows for this chokepoint. The figures above come from PortWatch.</p>
    </div>` : (() => {
      const drop = Math.max(0, Math.min(100, -(m.chg.tanker ?? 0)));
      const oilOff = en.oilMbd * drop / 100;
      return `
    <div class="block">
      <div class="block-head"><h3>Energy flows</h3><span class="src src-eia">U.S. EIA</span></div>
      <p class="lede">Shown only in the energy view. Normal flows are averages for the first half of 2025.${en.note ? ` ${esc(en.note)}` : ""}</p>
      <div class="energy">
        <div><div class="v">${en.oilMbd} mb/d</div><div class="l">Oil (crude and fuels) normally, ${fmtNum(en.oilMbd / ENERGY.worldSeaborneOilMbd * 100)}% of world seaborne oil${eiaCite()}</div></div>
        ${en.lngBcfd != null ? `<div><div class="v">${en.lngBcfd} bcf/d</div><div class="l">LNG normally${eiaCite()}</div></div>` : ""}
        ${en.bypassMbd ? `<div><div class="v">${en.bypassMbd} mb/d</div><div class="l">Pipeline capacity that can bypass it: ${esc(en.bypassNote)}${eiaCite()}</div></div>` : ""}
        <div><div class="v">≈ ${fmtNum(oilOff, 1)} mb/d</div><div class="l">Rough estimate of oil not moving: EIA normal flow × the ${fmtNum(drop)}% fall in tanker transits ${esc(b.short)}</div></div>
      </div>
    </div>`;
    })();

  const why = `
    <div class="block why-score">
      <div class="block-head"><h3>Why it ranks where it does</h3>${src("calc")}</div>
      <table>
        <tr><td>Normal cargo a day${state.focus === "all" ? "" : ` (${esc(f.noun)} only)`}, ${esc(b.label.charAt(0).toLowerCase() + b.label.slice(1))}</td><td>${fmtTons(m.tonsBase)}</td></tr>
        <tr><td>Cargo a day in the latest week</td><td>${fmtTons(m.tonsCur)}</td></tr>
        <tr class="total"><td>Cargo ${m.gap >= 0 ? "missing" : "above normal"} a day</td><td>${fmtTons(Math.abs(m.gap ?? 0))}</td></tr>
        ${state.focus === "all" && m.gap > 0 ? `<tr><td>Share of all seaborne trade worldwide<sup class="cite"><a href="${esc(WORLD.source.url)}" target="_blank" rel="noopener" title="${esc(WORLD.source.label)}">[w]</a></sup></td><td>${fmtNum(m.gapShareWorld, 1)}%</td></tr>` : ""}
      </table>
    </div>`;

  const evs = eventsFor(m);
  const cmpLabel = state.range === "long" ? "Seasonal normal (2019–2022)"
    : state.mode === "yoy" ? "Same days a year earlier" : esc(b.label);

  $("#detail").innerHTML = `
    <div class="detail-top">
      <div>
        <h2>${esc(m.name)}</h2>
        <div class="meta"><span>${esc(p.region ?? "")}</span>${statusPill(m.status)}<span>Data to ${shortDate(m.asOf)}</span>${m.lowTraffic ? '<span class="tag-low">Low traffic</span>' : ""}</div>
      </div>
      <div class="stats">
        <div class="stat"><div class="v">${fmtShips(m.focusCur)}</div><div class="l">${esc(f.noun)} a day, 7-day average</div></div>
        <div class="stat"><div class="v ${dirClass(m.focusChg)}">${fmtPct(m.focusChg)}</div><div class="l">change ${esc(b.short)}</div></div>
        <div class="stat"><div class="v">${fmtTons(m.cur.cap)}</div><div class="l">cargo a day (estimate)</div></div>
        <div class="stat"><div class="v">${fmtGap(m.gap)}</div><div class="l">cargo missing a day vs normal</div></div>
      </div>
    </div>
    <div class="detail-grid">
      <div>
        <div class="block">
          <div class="block-head"><h3>${esc(cap(f.noun))} per day</h3>${src("pw")}</div>
          <div class="tabs" role="group" aria-label="Chart period">
            <button type="button" data-range="year" aria-pressed="${state.range === "year"}">Last 12 months</button>
            <button type="button" data-range="long" aria-pressed="${state.range === "long"}">Since 2019</button>
          </div>
          <div class="legend"><span><i></i>${state.range === "long" ? "Weekly average" : "7-day average"}</span><span><i class="dash"></i>${cmpLabel}</span>${evs.length ? `<span><i class="ev"></i>Events</span>` : ""}</div>
          <div class="chart" id="chart"></div>
          ${evs.length ? `<ol class="events">${evs.map((e, i) => `<li><span class="n">${i + 1}</span><span class="d">${shortDate(e.date)}</span><span>${esc(e.label)}${cite(e.src, [])}</span></li>`).join("")}</ol>` : ""}
        </div>
        <div class="block">
          <div class="block-head"><h3>What passes through</h3><span>${src("pw")}${src("calc")}</span></div>
          <p class="lede">Each vessel type's share of normal cargo (2019–2022), its normal and latest cargo per day, and the change in ships ${esc(b.short)}.</p>
          <table class="mix"><thead><tr><th>Vessel type and typical cargo</th><th>Share of cargo</th><th>Normal a day</th><th>Latest a day</th><th>Change in ships</th></tr></thead><tbody>${mixRows}</tbody></table>
        </div>
        ${energy}
        ${industries}
        ${why}
      </div>
      <div>${profileHtml(m)}</div>
    </div>`;
  $("#detail").querySelectorAll(".tabs button").forEach((btn) =>
    btn.addEventListener("click", () => { state.range = btn.dataset.range; renderDetail(); }));
  drawChart($("#chart"), m, evs);
}

function drawChart(host, m, evs) {
  const f = FOCUS[state.focus];
  const idx = m.cp.idx;
  let cur, cmp;
  if (state.range === "long") {
    const ci = { 1: 1, 2: 2, 3: 3, 4: 4 }[f.col];
    cur = m.cp.weekly.map((w) => [w[0], w[ci]]);
    cmp = cur.map(([d]) => [d, normalOn(m.cp, d, f.col)]);
  } else {
    const end = m.asOf, start = addDays(end, -364);
    cur = rolling7(idx, start, end, f.col);
    cmp = state.mode === "yoy" ? cur.map(([d]) => [d, windowMean(idx, addDays(d, -364), 7, f.col, 4)])
      : state.mode === "normal" ? cur.map(([d]) => [d, normalOn(m.cp, d, f.col)])
      : cur.map(([d]) => [d, m.focusBase]);
  }
  if (!cur.length) { host.innerHTML = '<p class="muted">No data for this period.</p>'; return; }
  const W = host.clientWidth || 700, H = host.clientHeight || 260;
  const pad = { l: 40, r: 10, t: 16, b: 26 };
  const vals = [...cur, ...cmp].map((p) => p[1]).filter((v) => v != null);
  const ticks = niceTicks(Math.max(1, ...vals));
  const yMax = ticks.at(-1);
  const x = (i) => pad.l + (i / Math.max(1, cur.length - 1)) * (W - pad.l - pad.r);
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
  const xOfDate = (d) => {
    const i = cur.findIndex(([cd]) => cd >= d);
    return i < 0 ? null : x(i);
  };
  const labels = state.range === "long"
    ? cur.map(([d], i) => [d, i]).filter(([d], i) => i === 0 || d.slice(0, 4) !== cur[i - 1][0].slice(0, 4)).map(([d, i]) => [d.slice(0, 4), i])
    : cur.map(([d], i) => [d, i]).filter(([d]) => d.endsWith("-01")).map(([d, i]) => [MONTHS[+d.slice(5, 7) - 1], i]);
  const evMarks = evs.map((e, n) => ({ n: n + 1, x: e.date >= cur[0][0] ? xOfDate(e.date) : null })).filter((e) => e.x != null);
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of ${esc(f.noun)} per day">
    ${ticks.map((t) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? "#cfc8bf" : "#ece8e2"}" stroke-width="1"/>
      <text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end" fill="#8a847d" font-size="12" font-family="Montserrat, sans-serif">${t}</text>`).join("")}
    ${labels.map(([t, i]) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${state.range === "long" ? "start" : "middle"}" fill="#8a847d" font-size="12" font-family="Montserrat, sans-serif">${t}</text>`).join("")}
    ${evMarks.map((e) => `<line x1="${e.x}" x2="${e.x}" y1="${pad.t}" y2="${H - pad.b}" stroke="#a8615a" stroke-width="1.5"/>
      <circle cx="${e.x}" cy="${pad.t - 4}" r="8" fill="#a8615a"/><text x="${e.x}" y="${pad.t}" text-anchor="middle" fill="#fff" font-size="10.5" font-weight="700" font-family="Montserrat, sans-serif">${e.n}</text>`).join("")}
    <path d="${path(cmp)}" fill="none" stroke="#a39d95" stroke-width="1.5" stroke-dasharray="4 3"/>
    <path d="${path(cur)}" fill="none" stroke="#3e5c6e" stroke-width="2" stroke-linejoin="round"/>
    <line class="xh" y1="${pad.t}" y2="${H - pad.b}" stroke="#8a847d" stroke-width="1" visibility="hidden"/>
    <circle class="xd" r="4" fill="#3e5c6e" stroke="#fff" stroke-width="2" visibility="hidden"/>
    <rect class="hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" fill="transparent"/>
  </svg>`;
  const svg = host.querySelector("svg"), tip = $("#tooltip");
  const xh = svg.querySelector(".xh"), xd = svg.querySelector(".xd");
  const cmpName = state.range === "long" || state.mode === "normal" ? "Normal" : state.mode === "yoy" ? "A year earlier" : "Before the war";
  svg.querySelector(".hit").addEventListener("mousemove", (e) => {
    const r = svg.getBoundingClientRect();
    const i = Math.round((((e.clientX - r.left) / r.width) * W - pad.l) / (W - pad.l - pad.r) * (cur.length - 1));
    if (i < 0 || i >= cur.length) return;
    const [d, v] = cur[i], bv = cmp[i][1];
    xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.setAttribute("visibility", "visible");
    if (v != null) { xd.setAttribute("cx", x(i)); xd.setAttribute("cy", y(v)); xd.setAttribute("visibility", "visible"); }
    tip.hidden = false;
    tip.innerHTML = `<div class="t">7 days to ${shortDate(d)}</div>${esc(cap(f.noun))} a day: <b>${fmtShips(v)}</b><br>${cmpName}: ${fmtShips(bv)}` +
      (v != null && bv ? ` <span class="${dirClass(v - bv)}">(${fmtPct(((v - bv) / bv) * 100)})</span>` : "");
    tip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 220)}px`;
    tip.style.top = `${e.clientY - 12}px`;
  });
  svg.querySelector(".hit").addEventListener("mouseleave", () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); xd.setAttribute("visibility", "hidden"); });
}

function niceTicks(max) {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].find((s) => max / s <= 5) || 1000;
  const out = [];
  for (let t = 0; t < max + step; t += step) out.push(t);
  return out;
}

// ------------------------------------------------------------------ scenario
function initScenario() {
  for (const id of ["#sc-cp", "#sc-loss", "#sc-days"]) $(id).addEventListener("input", renderScenario);
}

function refreshScenarioOptions() {
  const sel = $("#sc-cp");
  const current = sel.value || state.selected;
  const sorted = [...state.metrics].sort((a, b) => b.size - a.size);
  sel.innerHTML = sorted.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("");
  sel.value = state.metrics.find((m) => m.id === current) ? current : state.selected;
}

function renderScenario() {
  const loss = +$("#sc-loss").value, days = +$("#sc-days").value;
  $("#sc-loss-out").textContent = `${loss}%`;
  $("#sc-days-out").textContent = `${days} days`;
  const m = state.metrics.find((x) => x.id === $("#sc-cp").value);
  if (!m) return;
  const s = runScenario(m, loss, days);
  const b = BASELINES[state.mode];
  const types = s.byType.filter((t) => t.lostTotal > 0).sort((a, c) => c.lostTotal - a.lostTotal);
  const story = `If the ${esc(m.name)} lost ${loss}% of its normal traffic for ${days} days, about <b>${fmtShips(s.shipsLost)} ships a day</b> would have to wait or reroute, carrying <b>${fmtTons(s.tonsLostDay)} of cargo a day</b>. ` +
    `That is ${fmtNum(s.shareWorld, 1)}% of all seaborne trade worldwide, or <b>${fmtTons(s.tonsLostTotal)}</b> over the whole period.` +
    (types.length ? ` The largest share would be on ${esc(types[0].label.toLowerCase())}, which carry ${esc(types[0].carries.charAt(0).toLowerCase() + types[0].carries.slice(1))}.` : "");
  const boxes = [
    [fmtShips(s.shipsLost), "Ships a day affected"],
    [fmtTons(s.tonsLostDay), "Cargo a day affected"],
    [`${fmtNum(s.shareWorld, 1)}%`, "Of world seaborne trade"],
    [fmtTons(s.tonsLostTotal), `Cargo affected over ${days} days`],
  ];
  const typeRows = types.map((t) => `<tr><td><b>${t.label}</b><span class="carries">${esc(t.carries)}</span></td><td>${fmtTons(t.lostDay)}</td><td>${fmtTons(t.lostTotal)}</td></tr>`).join("");
  const en = energyFor(m);
  let energyHtml = "";
  if (state.focus === "tanker") {
    if (!en) energyHtml = `<p class="footnote">The U.S. EIA does not publish oil flows for this chokepoint, so the energy estimate is not available.</p>`;
    else {
      const f = loss / 100, oilLost = en.oilMbd * f, bypass = Math.min(en.bypassMbd ?? 0, oilLost), oilNet = oilLost - bypass;
      energyHtml = `
      <div class="block-head" style="margin-top:20px"><h3 style="margin:0">Energy view</h3><span class="src src-eia">U.S. EIA</span></div>
      <p class="sc-story" style="font-size:15px">In oil terms, about <b>${fmtNum(oilLost, 1)} million barrels a day</b> would stop flowing (${loss}% of the normal ${en.oilMbd} mb/d).${bypass > 0 ? ` Pipelines could carry ${fmtNum(bypass, 1)} mb/d around the blockage, leaving <b>${fmtNum(oilNet, 1)} mb/d</b> lost.` : ""} That is ${fmtNum(oilNet / ENERGY.worldSeaborneOilMbd * 100, 1)}% of world seaborne oil, or ${fmtNum(oilNet * days)} million barrels over ${days} days.${en.lngBcfd ? ` LNG: about ${fmtNum(en.lngBcfd * f, 1)} billion cubic feet a day.` : ""}${eiaCite()}</p>`;
    }
  }
  const now = m.focusChg != null ? `For comparison, PortWatch currently shows ${esc(FOCUS[state.focus].noun)} here at ${fmtPct(m.focusChg)} ${esc(b.short)}.` : "";
  $("#sc-out").innerHTML = `
    <p class="sc-story">${story}</p>
    <div class="sc-boxes">${boxes.map(([v, l]) => `<div class="sc-box"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("")}</div>
    <table class="mix" style="margin-top:16px"><thead><tr><th>Cargo affected, by vessel type</th><th>A day</th><th>Over ${days} days</th></tr></thead><tbody>${typeRows}</tbody></table>
    ${energyHtml}
    <p class="footnote">${now}</p>
    <details class="sc-steps"><summary>Show the calculation</summary><ol>
      <li>Normal traffic (${esc(b.label)}) from PortWatch: ${fmtShips(s.shipsNormal)} ships and ${fmtTons(s.tonsNormal)} of cargo a day.</li>
      <li>Lost: × ${loss}% = ${fmtShips(s.shipsLost)} ships and ${fmtTons(s.tonsLostDay)} a day; × ${days} days = ${fmtTons(s.tonsLostTotal)}.</li>
      <li>Share of world seaborne trade: ${fmtTons(s.tonsLostDay)} ÷ ${fmtTons(WORLD.seaborneTonsPerDay)} a day (12,720 million tonnes in 2024, <a href="${esc(WORLD.source.url)}" target="_blank" rel="noopener">UNCTAD</a>) = ${fmtNum(s.shareWorld, 1)}%.</li>
    </ol></details>`;
}

// ------------------------------------------------------------------ weekly brief
function renderBrief() {
  const items = weeklySummary(state.metrics, state.mode, state.focus);
  $("#rule-brief").innerHTML = items.map((it) => `<div class="brief-item"><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p></div>`).join("");
}

function renderAiBrief(md) {
  if (!md || !md.trim()) return;
  const gen = md.match(/<!--\s*generated:\s*(.*?)\s*-->/)?.[1];
  let html = "", list = [], para = [];
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const flush = () => {
    if (list.length) html += `<ul>${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`;
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
  $("#ai-brief").innerHTML = `<div class="block-head"><h3 style="margin:0">AI-written summary</h3><span class="src src-analyst">AI (Claude)</span></div>
    <p class="footnote" style="margin:0 0 8px">Written by an AI model from the same numbers${gen ? `, ${esc(gen)}` : ""}. It is told not to add facts that are not in the data.</p>${html}`;
}

boot();
