const storage = keys => new Promise(r => chrome.storage.local.get(keys, r));

// ── Ranges ────────────────────────────────────────────────────────────────
const MUL_ROWS = range(2, 12);
const MUL_COLS = range(2, 100);
const ADD_ROWS = range(2, 99);
const ADD_COLS = range(2, 99);

function range(a, b) {
  return Array.from({ length: b - a + 1 }, (_, i) => i + a);
}

// ── Canvas config ─────────────────────────────────────────────────────────
const CFG = {
  muldiv: { cell: 14, gap: 2 },
  addsub: { cell:  9, gap: 1 },
};
const LBL_W = 34;
const LBL_H = 26;

function S(type) { return CFG[type].cell + CFG[type].gap; }
function C(type) { return CFG[type].cell; }

// ── Color — 0.5×stdDev scale ──────────────────────────────────────────────
function timeToColor(ms, avg, scale) {
  if (!scale) return '#ffffff';
  const t = Math.max(-1, Math.min(1, (ms - avg) / scale));
  const intensity = Math.abs(t);
  const hue   = t <= 0 ? 165 : 10;
  const sat   = Math.round(intensity * 72);
  const light = Math.round(96 - intensity * 53);
  return `hsl(${hue},${sat}%,${light}%)`;
}

function fmt(ms) { return (ms / 1000).toFixed(2) + 's'; }

// ── Tooltip ───────────────────────────────────────────────────────────────
const tooltip = document.getElementById('tooltip');

function attachTooltip(canvas, rows, cols, type, dataMap) {
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    const j = Math.floor((e.clientX - r.left  - LBL_W) / S(type));
    const i = Math.floor((e.clientY - r.top   - LBL_H) / S(type));
    if (i < 0 || i >= rows.length || j < 0 || j >= cols.length) {
      tooltip.style.display = 'none'; return;
    }
    const row = rows[i], col = cols[j];
    const d = dataMap[row]?.[col];
    const expr = type === 'muldiv' ? `${row} × ${col} = ${row * col}` : `${row} + ${col} = ${row + col}`;
    const detail = d
      ? `${d.n} solved · avg ${fmt(d.ms / d.n)}`
      : 'Not yet practiced';
    tooltip.textContent = `${expr}\n${detail}`;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top  = (e.clientY - 8)  + 'px';
  });
  canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
}

// ── Grid renderer ─────────────────────────────────────────────────────────
function drawGrid(canvasId, rows, cols, type, dataMap) {
  const canvas = document.getElementById(canvasId);
  const ctx    = canvas.getContext('2d');
  const s = S(type), c = C(type);

  canvas.width  = LBL_W + cols.length * s;
  canvas.height = LBL_H + rows.length * s;

  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const times = [];
  rows.forEach(row => cols.forEach(col => {
    const d = dataMap[row]?.[col];
    if (d) times.push(d.ms / d.n);
  }));

  let avg = 0, scale = 0;
  if (times.length) {
    avg = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((s, t) => s + (t - avg) ** 2, 0) / times.length;
    scale = Math.max(Math.sqrt(variance) * 0.5, 50);
  }

  ctx.fillStyle = '#606060';
  ctx.font      = '9px monospace';
  ctx.textAlign = 'center';
  cols.forEach((col, j) => {
    if (col === 2 || col % (type === 'muldiv' ? 10 : 20) === 0)
      ctx.fillText(String(col), LBL_W + j * s + c / 2, LBL_H - 8);
  });

  ctx.textAlign = 'right';
  rows.forEach((row, i) => {
    const show = type === 'muldiv' ? true : (row === 2 || row % 20 === 0);
    if (show) ctx.fillText(String(row), LBL_W - 4, LBL_H + i * s + c / 2 + 3);
  });

  rows.forEach((row, i) => {
    cols.forEach((col, j) => {
      const d = dataMap[row]?.[col];
      ctx.fillStyle = d ? timeToColor(d.ms / d.n, avg, scale) : '#262626';
      ctx.fillRect(LBL_W + j * s, LBL_H + i * s, c, c);
    });
  });

  attachTooltip(canvas, rows, cols, type, dataMap);
}

// ── Daily tab ─────────────────────────────────────────────────────────────
function renderDaily(sessionLog, dailyBests) {
  const pane = document.getElementById('pane-daily');
  if (!sessionLog?.length) {
    pane.innerHTML = `<div class="empty">Complete a few sessions to start building your daily history.</div>`;
    return;
  }

  // Collect unique durations seen
  const durations = [...new Set(sessionLog.map(s => s.durationSec))].sort((a, b) => a - b);

  // Group daily bests by date
  const dates = Object.keys(dailyBests || {}).sort((a, b) => b.localeCompare(a)).slice(0, 14);

  const today    = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  function dateLabel(d) {
    if (d === today)     return 'Today';
    if (d === yesterday) return 'Yesterday';
    const [, m, day] = d.split('-');
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]} ${+day}`;
  }

  // Build table
  const durCols = durations.map(d => `<th>${d}s</th>`).join('');
  const rows = dates.map(date => {
    const bests = dailyBests[date] || {};
    const cells = durations.map(d => {
      const b = bests[String(d)];
      return b ? `<td class="best-score">${b.score}<span class="best-avg">${fmt(b.avgMs)}</span></td>`
               : `<td class="no-data">—</td>`;
    }).join('');
    return `<tr><td class="date-cell">${dateLabel(date)}</td>${cells}</tr>`;
  }).join('');

  // Recent sessions list
  const recent = sessionLog.slice(0, 20).map(s => {
    const d = s.date === today ? 'Today' : s.date === yesterday ? 'Yesterday' : s.date;
    return `
      <div class="session-row">
        <span class="s-date">${d}</span>
        <span class="s-dur">${s.durationSec}s</span>
        <span class="s-score">${s.score} solved</span>
        <span class="s-avg">${fmt(s.avgMs)}</span>
      </div>`;
  }).join('');

  pane.innerHTML = `
    <div class="daily-section-label">Daily Bests</div>
    <div class="table-wrap">
      <table class="daily-table">
        <thead><tr><th>Date</th>${durCols}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="daily-section-label" style="margin-top:20px">Recent Sessions</div>
    <div class="session-list">${recent}</div>
  `;
}

// ── Data maps ─────────────────────────────────────────────────────────────
function buildMaps(perfData) {
  const mulMap = {}, addMap = {};
  let mulTotal = 0, addTotal = 0;
  for (const [key, val] of Object.entries(perfData)) {
    const [type, r, c] = key.split(':');
    const row = parseInt(r), col = parseInt(c);
    if (type === 'muldiv') {
      if (!mulMap[row]) mulMap[row] = {};
      mulMap[row][col] = val; mulTotal += val.n;
    } else if (type === 'addsub') {
      if (!addMap[row]) addMap[row] = {};
      addMap[row][col] = val; addTotal += val.n;
    }
  }
  return { mulMap, addMap, mulTotal, addTotal };
}

// ── Main render ───────────────────────────────────────────────────────────
async function render() {
  const { perfData = {}, perfSessions = 0, sessionLog = [], dailyBests = {} }
    = await storage(['perfData', 'perfSessions', 'sessionLog', 'dailyBests']);

  const { mulMap, addMap, mulTotal, addTotal } = buildMaps(perfData);

  document.getElementById('stat-muldiv').textContent   = `${mulTotal} × ÷ problems`;
  document.getElementById('stat-addsub').textContent   = `${addTotal} + − problems`;
  document.getElementById('stat-sessions').textContent = `${perfSessions} sessions`;

  // × ÷ pane
  const hasMul = mulTotal > 0;
  document.getElementById('empty-muldiv').classList.toggle('hidden', hasMul);
  document.getElementById('grid-muldiv').classList.toggle('hidden', !hasMul);
  if (hasMul) drawGrid('canvas-muldiv', MUL_ROWS, MUL_COLS, 'muldiv', mulMap);

  // + − pane
  const hasAdd = addTotal > 0;
  document.getElementById('empty-addsub').classList.toggle('hidden', hasAdd);
  document.getElementById('grid-addsub').classList.toggle('hidden', !hasAdd);
  if (hasAdd) drawGrid('canvas-addsub', ADD_ROWS, ADD_COLS, 'addsub', addMap);

  // Daily pane (always renders)
  renderDaily(sessionLog, dailyBests);

  // Show/hide legend (not relevant on daily tab)
  const activeTab = document.querySelector('.tab.active')?.dataset.tab;
  document.getElementById('legend-row').classList.toggle('hidden', activeTab === 'daily');
}

// ── Tabs ──────────────────────────────────────────────────────────────────
const PANES = ['muldiv', 'addsub', 'daily'];

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const which = btn.dataset.tab;
    PANES.forEach(p => {
      document.getElementById(`pane-${p}`).classList.toggle('hidden', p !== which);
    });
    document.getElementById('legend-row').classList.toggle('hidden', which === 'daily');
  });
});

// ── Clear ─────────────────────────────────────────────────────────────────
document.getElementById('btn-clear').addEventListener('click', () => {
  if (confirm('Clear all performance history? This cannot be undone.')) {
    chrome.storage.local.set({ perfData: {}, perfSessions: 0, sessionLog: [], dailyBests: {} }, render);
  }
});

chrome.storage.onChanged.addListener(changes => {
  if (changes.perfData || changes.perfSessions || changes.sessionLog || changes.dailyBests) render();
});

render();
