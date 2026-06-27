/* ============================================================
   VJAlgo Dashboard — app.js
   Reads JSON data files published by publish_data.py
   ============================================================ */

const DATA_BASE = './data/';
let DATA = {};
let pnlChart = null;

// ── NAVIGATION ──────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('page-' + tab.dataset.page).classList.add('active');
    renderPage(tab.dataset.page);
  });
});

// ── LOAD ALL DATA ────────────────────────────────────────────
async function loadAll() {
  const files = ['summary', 'daily_pnl', 'real_trades', 'open_positions',
                 'signals', 'watchlist', 'post_exit', 'strategy_stats', 'paper_stats'];
  const results = await Promise.allSettled(
    files.map(f => fetch(DATA_BASE + f + '.json?v=' + Date.now()).then(r => r.json()))
  );
  files.forEach((f, i) => {
    if (results[i].status === 'fulfilled') DATA[f] = results[i].value;
    else DATA[f] = null;
  });

  const ts = DATA.summary?.last_updated || '—';
  document.getElementById('last-updated').textContent = 'Updated: ' + ts;
  renderPage('live');
}

function renderPage(page) {
  if (page === 'live') renderLive();
  else if (page === 'journal') renderJournal();
  else if (page === 'signals') renderSignals();
  else if (page === 'watchlist') renderWatchlist();
  else if (page === 'analytics') renderAnalytics();
  else if (page === 'postex') renderPostExit();
  else if (page === 'vss') renderVSS();
}

// ── HELPERS ──────────────────────────────────────────────────
function pnlClass(v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : 'neutral'; }
function pnlFmt(v) {
  if (v == null) return '—';
  const abs = Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return (v >= 0 ? '+₹' : '−₹') + abs;
}
function pct(v) { return v != null ? (v >= 0 ? '+' : '') + Number(v).toFixed(1) + '%' : '—'; }
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

function dirBadge(dir) {
  const d = String(dir).toUpperCase();
  return `<span class="badge badge-${d.toLowerCase()}">${d}</span>`;
}
function statusBadge(s) {
  const cls = {OPEN:'open', WIN:'win', LOSS:'loss', CLOSED:'loss',
               PENDING:'pending', ACTIVE:'active', EXPIRED:'expired'}[s] || 'expired';
  return `<span class="badge badge-${cls}">${esc(s)}</span>`;
}
function convBadge(c) {
  if (!c) return '—';
  const cls = c.includes('HIGH') ? 'high' : 'medium';
  return `<span class="badge badge-${cls}">${esc(c)}</span>`;
}
function verdictBadge(v) {
  if (!v) return '—';
  const isGood = v.includes('EXIT_WAS_CORRECT') || v.includes('EXIT_BETTER');
  const cls = isGood ? 'exit-better' : 'held-better';
  const label = isGood ? '✓ Exit Right' : '▲ Held Better';
  return `<span class="badge badge-${cls}">${label}</span>`;
}

function miniBar(val, maxAbs, color) {
  const w = Math.min(120, Math.round((Math.abs(val) / (maxAbs || 1)) * 80));
  return `<div class="mini-bar-wrap">
    <div class="mini-bar" style="width:${w}px;background:${color}"></div>
    <span class="${pnlClass(val)}">${pnlFmt(val)}</span>
  </div>`;
}

// ── LIVE TRADING ─────────────────────────────────────────────
function renderLive() {
  const s = DATA.summary || {};
  const dp = DATA.daily_pnl || [];

  document.getElementById('hero-alltime-pnl').innerHTML =
    `<span class="${pnlClass(s.real_alltime_pnl)}">${pnlFmt(s.real_alltime_pnl)}</span>`;
  document.getElementById('hero-today-pnl').innerHTML =
    `<span class="${pnlClass(s.today_net_pnl)}">${pnlFmt(s.today_net_pnl)}</span>`;
  document.getElementById('hero-wr').textContent =
    s.win_rate != null ? s.win_rate.toFixed(0) + '%' : '—';
  document.getElementById('hero-trades').textContent = s.total_closed_trades ?? '—';
  document.getElementById('hero-open').textContent = s.open_positions ?? '0';

  // Open positions
  const op = DATA.open_positions || [];
  const tbody = document.getElementById('open-positions-body');
  const empty = document.getElementById('open-positions-empty');
  const tbl = document.getElementById('open-positions-table');

  if (op.length === 0) {
    tbl.style.display = 'none';
    empty.style.display = 'block';
  } else {
    tbl.style.display = '';
    empty.style.display = 'none';
    tbody.innerHTML = op.map(t => `<tr>
      <td class="accent-text">${esc(t.symbol)}</td>
      <td>${dirBadge(t.direction)}</td>
      <td>${esc(t.strategy)}</td>
      <td>${t.entry_premium ?? '—'}</td>
      <td>${t.current_premium ?? '—'}</td>
      <td class="${pnlClass(t.current_pnl)}">${pnlFmt(t.current_pnl)}</td>
      <td>${t.peak_premium ?? '—'}</td>
      <td>${statusBadge('OPEN')}</td>
    </tr>`).join('');
  }

  // Daily PnL table
  const maxAbs = Math.max(...dp.map(d => Math.abs(d.net_pnl || 0)), 1);
  document.getElementById('daily-pnl-body').innerHTML = dp.slice(0,20).map(d => {
    const wr = d.trades > 0 ? ((d.wins / d.trades) * 100).toFixed(0) + '%' : '—';
    const color = (d.net_pnl || 0) >= 0 ? 'var(--green)' : 'var(--red)';
    return `<tr>
      <td>${esc(d.date)}</td>
      <td>${d.trades}</td>
      <td class="pos">${d.wins}</td>
      <td class="neg">${d.losses}</td>
      <td>${wr}</td>
      <td class="${pnlClass(d.net_pnl)}">${pnlFmt(d.net_pnl)}</td>
      <td>${miniBar(d.net_pnl, maxAbs, color)}</td>
    </tr>`;
  }).join('');
}

// ── TRADE JOURNAL ─────────────────────────────────────────────
let journalData = [];
function renderJournal() {
  journalData = DATA.real_trades || [];
  applyJournalFilters();

  document.getElementById('journal-search').oninput = applyJournalFilters;
  document.getElementById('journal-filter-strategy').onchange = applyJournalFilters;
  document.getElementById('journal-filter-dir').onchange = applyJournalFilters;
  document.getElementById('journal-filter-result').onchange = applyJournalFilters;
}

function applyJournalFilters() {
  const search = document.getElementById('journal-search').value.toLowerCase();
  const strat = document.getElementById('journal-filter-strategy').value;
  const dir = document.getElementById('journal-filter-dir').value;
  const result = document.getElementById('journal-filter-result').value;

  const filtered = journalData.filter(t => {
    if (search && !t.symbol?.toLowerCase().includes(search)) return false;
    if (strat && t.strategy !== strat) return false;
    if (dir && t.direction !== dir) return false;
    if (result === 'win' && (t.net_pnl || 0) <= 0) return false;
    if (result === 'loss' && (t.net_pnl || 0) >= 0) return false;
    return true;
  });

  document.getElementById('journal-body').innerHTML = filtered.map(t => {
    const isWin = (t.net_pnl || 0) > 0;
    return `<tr>
      <td>${esc(t.entry_date)}</td>
      <td class="accent-text">${esc(t.symbol)}</td>
      <td class="neutral" style="font-size:10px">${esc(t.option_symbol)}</td>
      <td>${dirBadge(t.direction)}</td>
      <td>${esc(t.strategy)}</td>
      <td>${t.entry_premium ?? '—'}</td>
      <td>${t.exit_premium ?? '—'}</td>
      <td>${t.lots ?? '—'}</td>
      <td class="${pnlClass(t.net_pnl)}">${pnlFmt(t.net_pnl)}</td>
      <td class="neutral" style="font-size:10px">${esc(t.exit_reason)}</td>
      <td>${isWin ? `<span class="badge badge-win">WIN</span>` : `<span class="badge badge-loss">LOSS</span>`}</td>
    </tr>`;
  }).join('');

  document.getElementById('journal-footer').textContent =
    `Showing ${filtered.length} of ${journalData.length} trades`;
}

// ── SIGNALS ──────────────────────────────────────────────────
function renderSignals() {
  const sigs = DATA.signals || [];
  applySignalFilters(sigs);

  document.getElementById('signals-status').onchange = () => applySignalFilters(sigs);
  document.getElementById('signals-conviction').onchange = () => applySignalFilters(sigs);
}

function applySignalFilters(sigs) {
  const status = document.getElementById('signals-status').value;
  const conv = document.getElementById('signals-conviction').value;

  const filtered = sigs.filter(s => {
    if (status && s.status !== status) return false;
    if (conv === 'HIGH' && !s.conviction?.includes('HIGH')) return false;
    if (conv === 'MEDIUM' && !s.conviction?.includes('MEDIUM')) return false;
    return true;
  });

  document.getElementById('signals-body').innerHTML = filtered.map(s => `<tr>
    <td>${esc(s.scan_date)}</td>
    <td class="accent-text">${esc(s.symbol)}</td>
    <td class="neutral" style="font-size:10px;max-width:200px;white-space:normal">${esc(s.patterns)}</td>
    <td>${convBadge(s.conviction)}</td>
    <td>${s.cmp_at_scan ?? '—'}</td>
    <td class="gold">${s.breakout_level ?? '—'}</td>
    <td class="neg">${s.stop_loss ?? '—'}</td>
    <td class="pos">${s.t1 ?? '—'} <span class="neutral">(${pct(s.t1_pct)})</span></td>
    <td class="pos">${s.t2 ?? '—'} <span class="neutral">(${pct(s.t2_pct)})</span></td>
    <td class="pos">${s.t3 ?? '—'} <span class="neutral">(${pct(s.t3_pct)})</span></td>
    <td>${Number(s.score ?? 0).toFixed(2)}</td>
    <td>${statusBadge(s.status)}</td>
  </tr>`).join('');
}

// ── WATCHLIST ────────────────────────────────────────────────
function renderWatchlist() {
  const wl = DATA.watchlist || [];
  document.getElementById('watchlist-body').innerHTML = wl.map(w => {
    const scoreColor = w.score >= 90 ? 'var(--green)' : w.score >= 70 ? 'var(--gold)' : 'var(--text)';
    return `<tr>
      <td class="accent-text">${esc(w.symbol)}</td>
      <td style="color:${scoreColor};font-weight:700">${w.score}</td>
      <td>${w.score_a ?? '—'}</td><td>${w.score_b ?? '—'}</td>
      <td>${w.score_c ?? '—'}</td><td>${w.score_d ?? '—'}</td><td>${w.score_e ?? '—'}</td>
      <td>${w.ltp ?? '—'}</td>
      <td class="${(w.ret5d||0)>=0?'pos':'neg'}">${pct(w.ret5d)}</td>
      <td class="${(w.ret10d||0)>=0?'pos':'neg'}">${pct(w.ret10d)}</td>
      <td>${w.gap52w ?? '—'}%</td>
      <td>${Number(w.vol_ratio ?? 0).toFixed(2)}x</td>
    </tr>`;
  }).join('');
}

// ── ANALYTICS ────────────────────────────────────────────────
function renderAnalytics() {
  const stats = DATA.strategy_stats || [];
  document.getElementById('strat-body').innerHTML = stats.map(s => {
    const wr = s.trades > 0 ? ((s.wins / s.trades) * 100).toFixed(0) + '%' : '—';
    return `<tr>
      <td>${esc(s.strategy)}</td>
      <td>${dirBadge(s.direction)}</td>
      <td>${s.trades}</td>
      <td class="pos">${s.wins}</td>
      <td>${wr}</td>
      <td class="${pnlClass(s.total_pnl)}">${pnlFmt(s.total_pnl)}</td>
    </tr>`;
  }).join('');

  // Paper vs Real
  const ps = DATA.paper_stats || {};
  const s = DATA.summary || {};
  document.getElementById('paper-vs-real-body').innerHTML = `
    <tr><td>Total Trades</td><td>${ps.total_trades ?? '—'}</td><td>${s.total_closed_trades ?? '—'}</td></tr>
    <tr><td>Wins</td><td class="pos">${ps.wins ?? '—'}</td><td class="pos">${s.wins ?? '—'}</td></tr>
    <tr><td>Win Rate</td><td>${ps.win_rate != null ? ps.win_rate.toFixed(1)+'%' : '—'}</td><td>${s.win_rate != null ? s.win_rate.toFixed(1)+'%' : '—'}</td></tr>
    <tr><td>Net P&L</td><td class="${pnlClass(ps.net_pnl)}">${pnlFmt(ps.net_pnl)}</td><td class="${pnlClass(s.real_alltime_pnl)}">${pnlFmt(s.real_alltime_pnl)}</td></tr>
  `;

  // Cumulative PnL chart
  renderChart();
}

function renderChart() {
  const dp = (DATA.daily_pnl || []).slice().reverse();
  if (!dp.length) return;

  let cum = 0;
  const labels = [];
  const values = [];
  dp.forEach(d => {
    cum += (d.net_pnl || 0);
    labels.push(d.date);
    values.push(parseFloat(cum.toFixed(0)));
  });

  const ctx = document.getElementById('pnl-chart').getContext('2d');
  if (pnlChart) pnlChart.destroy();

  const colors = values.map(v => v >= 0 ? 'rgba(0,200,83,0.8)' : 'rgba(255,61,87,0.8)');
  const lineColor = values[values.length-1] >= 0 ? '#00c853' : '#ff3d57';

  pnlChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Cumulative Net P&L',
        data: values,
        backgroundColor: colors,
        borderRadius: 3,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => '₹' + ctx.parsed.y.toLocaleString('en-IN')
          }
        }
      },
      scales: {
        x: { ticks: { color: '#6b8299', font: { size: 10 } }, grid: { color: '#1e2a38' } },
        y: {
          ticks: { color: '#6b8299', font: { size: 10 },
            callback: v => '₹' + (v/1000).toFixed(0) + 'k'
          },
          grid: { color: '#1e2a38' }
        }
      }
    }
  });
}

// ── POST-EXIT ─────────────────────────────────────────────────
function renderPostExit() {
  const pe = DATA.post_exit || [];

  // Summary pills
  const exitBetter = pe.filter(r => r.verdict?.includes('EXIT'));
  const heldBetter = pe.filter(r => r.verdict?.includes('HELD'));
  const totalDelta = pe.reduce((a,r) => a + (r.pnl_delta_vs_actual || 0), 0);

  document.getElementById('postex-summary').innerHTML = `
    <div class="postex-pill">
      <div class="pill-label">Exit Was Right</div>
      <div class="pill-val pos">${exitBetter.length}</div>
    </div>
    <div class="postex-pill">
      <div class="pill-label">Held Was Better</div>
      <div class="pill-val neg">${heldBetter.length}</div>
    </div>
    <div class="postex-pill">
      <div class="pill-label">Total Missed P&L</div>
      <div class="pill-val ${pnlClass(totalDelta)}">${pnlFmt(totalDelta)}</div>
    </div>
    <div class="postex-pill">
      <div class="pill-label">Records</div>
      <div class="pill-val">${pe.length}</div>
    </div>
  `;

  // Sort by tracking date desc, unique latest per trade
  const seen = new Set();
  const latest = [];
  pe.slice().sort((a,b) => b.tracking_date?.localeCompare(a.tracking_date)).forEach(r => {
    const key = r.option_symbol + r.exit_date;
    if (!seen.has(key)) { seen.add(key); latest.push(r); }
  });

  document.getElementById('postex-body').innerHTML = latest.map(r => `<tr>
    <td class="accent-text">${esc(r.symbol)}</td>
    <td class="neutral" style="font-size:10px">${esc(r.option_symbol)}</td>
    <td>${dirBadge(r.direction)}</td>
    <td>${esc(r.exit_date)}</td>
    <td class="neutral">D+${r.days_since_exit ?? '—'}</td>
    <td class="${pnlClass(r.net_pnl_actual)}">${pnlFmt(r.net_pnl_actual)}</td>
    <td class="${pnlClass(r.pnl_if_held_close)}">${pnlFmt(r.pnl_if_held_close)}</td>
    <td class="${pnlClass(r.pnl_delta_vs_actual)}">${pnlFmt(r.pnl_delta_vs_actual)}</td>
    <td>${verdictBadge(r.verdict)}</td>
  </tr>`).join('');
}

// ── INIT + AUTO REFRESH ───────────────────────────────────────
loadAll();
setInterval(loadAll, 5 * 60 * 1000); // refresh every 5 min

// ── VSS LIVE ──────────────────────────────────────────────────
let vssRefreshTimer = null;
const VSS_POLL_MS = 3000; // poll every 3 seconds when tab is active
const SL_PTS = 8.0;
const ZONE2  = 8.0;
const ZONE3  = 15.0;
const TARGET = 20.0;

function renderVSS() {
  if (vssRefreshTimer) clearInterval(vssRefreshTimer);
  loadVSS();
  vssRefreshTimer = setInterval(loadVSS, VSS_POLL_MS);
}

async function loadVSS() {
  try {
    const res = await fetch(DATA_BASE + 'vss_live.json?v=' + Date.now());
    const d = await res.json();
    renderVSSData(d);
  } catch (e) {
    setVSSStatus('offline', 'Bridge offline');
  }
}

function renderVSSData(d) {
  if (!d || !d.last_updated) {
    setVSSStatus('offline', 'No data from bridge');
    return;
  }

  // Staleness check
  const updatedAt = new Date(d.last_updated);
  const ageS = (Date.now() - updatedAt) / 1000;
  document.getElementById('vss-last-tick').textContent = 'Updated: ' + d.last_updated;

  if (ageS > 15) {
    setVSSStatus('stale', `Stale — ${Math.round(ageS)}s ago`);
  } else if (d.market_open) {
    setVSSStatus('live', 'LIVE — market open');
  } else {
    setVSSStatus('stale', 'Market closed');
  }

  // Session stats
  const sess = d.session || {};
  const pnl = sess.total_pnl || 0;
  document.getElementById('vss-pnl').innerHTML =
    `<span class="${pnlClass(pnl)}">${pnlFmt(pnl)}</span>`;
  document.getElementById('vss-pnl-card').style.borderLeft =
    `3px solid ${pnl >= 0 ? 'var(--green)' : 'var(--red)'}`;
  document.getElementById('vss-trades').textContent = sess.total_trades ?? '0';
  document.getElementById('vss-wins').textContent   = sess.wins ?? '0';
  document.getElementById('vss-losses').textContent = sess.losses ?? '0';
  document.getElementById('vss-wr').textContent     =
    sess.win_rate != null ? sess.win_rate + '%' : '—';

  // Open position
  const op = d.open_trade;
  const card  = document.getElementById('vss-position-card');
  const noPos = document.getElementById('vss-no-position');

  if (op) {
    card.style.display  = '';
    noPos.style.display = 'none';

    const entry = parseFloat(op.entry_price || 0);
    const ltp   = parseFloat(op.current_ltp || entry);
    const sl    = parseFloat(op.current_sl  || (entry - SL_PTS));
    const peak  = parseFloat(op.peak_price  || entry);
    const pts   = ltp - entry;
    const pnlV  = pts * 65; // lot size

    document.getElementById('vss-pos-symbol').textContent = op.symbol || '—';
    document.getElementById('vss-pos-dir').innerHTML      = dirBadge(op.direction);
    const modeEl = document.getElementById('vss-pos-mode');
    modeEl.textContent = op.paper ? 'PAPER' : 'REAL';
    modeEl.className   = 'vss-pos-mode ' + (op.paper ? 'paper' : 'real');

    document.getElementById('vss-pos-entry').textContent = entry.toFixed(1);
    document.getElementById('vss-pos-ltp').textContent   = ltp.toFixed(1);
    document.getElementById('vss-pos-sl').textContent    = sl.toFixed(1);
    document.getElementById('vss-pos-peak').textContent  = peak.toFixed(1);
    document.getElementById('vss-pos-pnl').innerHTML =
      `<span class="${pnlClass(pnlV)}">${pnlFmt(pnlV)}</span>`;
    document.getElementById('vss-pos-pts').innerHTML =
      `<span class="${pnlClass(pts)}">${pts >= 0 ? '+' : ''}${pts.toFixed(1)}pt</span>`;

    // TSL bar — progress from 0 to TARGET+SL_PTS total range
    const totalRange = SL_PTS + TARGET; // 8 + 20 = 28
    const progress   = Math.max(0, Math.min(100, ((pts + SL_PTS) / totalRange) * 100));
    document.getElementById('vss-tsl-bar').style.width = progress + '%';

    // Zone label
    let zoneLabel = 'Zone 1 — Wide SL (8pt)';
    if (pts >= ZONE3)  zoneLabel = '🟢 Zone 3 — Tight Trail (2pt)';
    else if (pts >= ZONE2) zoneLabel = '🟡 Zone 2 — Active Trail (4pt)';
    document.getElementById('vss-tsl-zone').textContent = zoneLabel;

    // TSL marker positions (as % of totalRange)
    document.getElementById('vss-tsl-z2').style.left  = ((SL_PTS + ZONE2)  / totalRange * 100) + '%';
    document.getElementById('vss-tsl-z3').style.left  = ((SL_PTS + ZONE3)  / totalRange * 100) + '%';
    document.getElementById('vss-tsl-tgt').style.left = ((SL_PTS + TARGET) / totalRange * 100) + '%';

  } else {
    card.style.display  = 'none';
    noPos.style.display = '';
  }

  // Trades table
  const trades = (d.trades || []).filter(t => t.status === 'CLOSED');
  document.getElementById('vss-trades-body').innerHTML = trades.map(t => {
    const entry  = parseFloat(t.entry_price || 0);
    const exitP  = parseFloat(t.exit_price  || 0);
    const tPnl   = parseFloat(t.pnl || 0);
    const pts    = exitP - entry;
    const isWin  = tPnl > 0;
    const entryT = (t.entry_time || '').split(' ')[1]?.slice(0,5) || '—';
    return `<tr>
      <td class="neutral">${esc(entryT)}</td>
      <td class="accent-text">${esc(t.symbol)}</td>
      <td>${dirBadge(t.direction)}</td>
      <td><span class="badge ${t.paper ? 'badge-pending' : 'badge-active'}">${t.paper ? 'PAPER' : 'REAL'}</span></td>
      <td>${entry.toFixed(1)}</td>
      <td>${exitP.toFixed(1)}</td>
      <td class="${pnlClass(tPnl)}">${pnlFmt(tPnl)}</td>
      <td class="${pnlClass(pts)}">${pts >= 0 ? '+' : ''}${pts.toFixed(1)}</td>
      <td class="neutral">${Number(t.vol_ratio || 0).toFixed(1)}x</td>
      <td class="neutral" style="font-size:10px">${esc(t.exit_reason || '—')}</td>
      <td>${isWin ? '<span class="badge badge-win">WIN</span>' : '<span class="badge badge-loss">LOSS</span>'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="11" class="neutral" style="text-align:center;padding:20px">No trades today</td></tr>';

  // Candles table (last 20)
  const candles = (d.candles || []).slice(0, 20);
  document.getElementById('vss-candles-body').innerHTML = candles.map(c => {
    const isBull = parseFloat(c.close_p || 0) >= parseFloat(c.open_p || 0);
    const cls    = isBull ? 'candle-bull' : 'candle-bear';
    const dir    = isBull ? '▲' : '▼';
    const vr     = parseFloat(c.vol_ratio || 0);
    const vrCls  = vr >= 1.5 ? 'pos' : vr >= 1.0 ? 'gold' : 'neutral';
    const cTime  = (c.candle_time || '').split(' ')[1]?.slice(0,5) || '—';
    return `<tr>
      <td class="neutral">${cTime}</td>
      <td class="${cls}">${dir} ${esc(c.symbol)}</td>
      <td>${Number(c.open_p || 0).toFixed(1)}</td>
      <td>${Number(c.high_p || 0).toFixed(1)}</td>
      <td>${Number(c.low_p  || 0).toFixed(1)}</td>
      <td class="${cls}">${Number(c.close_p || 0).toFixed(1)}</td>
      <td class="${vrCls}">${vr.toFixed(2)}x</td>
      <td>${(parseFloat(c.body_ratio  || 0)*100).toFixed(0)}%</td>
      <td>${(parseFloat(c.delta_ratio || 0)*100).toFixed(0)}%</td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="neutral" style="text-align:center;padding:20px">No candles yet</td></tr>';
}

function setVSSStatus(state, text) {
  const dot  = document.getElementById('vss-dot');
  const txt  = document.getElementById('vss-status-text');
  dot.className = 'vss-dot ' + state;
  txt.textContent = text;
}

// Stop VSS polling when switching away from the tab
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.page !== 'vss' && vssRefreshTimer) {
      clearInterval(vssRefreshTimer);
      vssRefreshTimer = null;
    }
  });
});
