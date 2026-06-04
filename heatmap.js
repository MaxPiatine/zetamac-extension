const storage = keys => new Promise(r => chrome.storage.local.get(keys, r));

// ── Ranges ────────────────────────────────────────────────────────────────
const MUL_ROWS = range(2, 12);   // factors 2–12 (rows)
const MUL_COLS = range(2, 100);  // factors 2–100 (cols)
const ADD_ROWS = range(2, 99);   // addend 2–99 (rows)
const ADD_COLS = range(2, 99);   // addend 2–99 (cols)

function range(a, b) {
  return Array.from({ length: b - a + 1 }, (_, i) => i + a);
}

// ── Drawing constants ─────────────────────────────────────────────────────
const CFG = {
  muldiv: { cell: 14, gap: 2 },
  addsub: { cell:  9, gap: 1 },
};
const LBL_W = 34;
const LBL_H = 26;

function S(type) { return CFG[type].cell + CFG[type].gap; }
function C(type) { return CFG[type].cell; }

// ── Color ─────────────────────────────────────────────────────────────────
function timeToColor(ms, avg, maxDev) {
  if (maxDev === 0) return '#ffffff';
  const t = Math.max(-1, Math.min(1, (ms - avg) / maxDev));
  const intensity = Math.abs(t);
  const hue   = t <= 0 ? 120 : 0;
  const sat   = Math.round(intensity * 80);
  const light = Math.round(100 - intensity * 55);
  return `hsl(${hue},${sat}%,${light}%)`;
}

// ── Tooltip ───────────────────────────────────────────────────────────────
const tooltip = document.getElementById('tooltip');

function attachTooltip(canvas, rows, cols, type, dataMap) {
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    const j = Math.floor((e.clientX - r.left  - LBL_W) / S(type));
    const i = Math.floor((e.clientY - r.top   - LBL_H) / S(type));

    if (i < 0 || i >= rows.length || j < 0 || j >= cols.length) {
      tooltip.style.display = 'none';
      return;
    }

    const row = rows[i], col = cols[j];
    const cell = dataMap[row]?.[col];
    let txt;
    if (type === 'muldiv') {
      txt = `${row} × ${col} = ${row * col}`;
    } else {
      txt = `${row} + ${col} = ${row + col}`;
    }
    txt += cell
      ? `\n${cell.n} solved · avg ${(cell.ms / cell.n / 1000).toFixed(2)}s`
      : '\nNot yet practiced';

    tooltip.textContent = txt;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top  = (e.clientY - 8)  + 'px';
  });
  canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
}

// ── Rendering ─────────────────────────────────────────────────────────────
function drawGrid(canvasId, rows, cols, type, dataMap) {
  const canvas = document.getElementById(canvasId);
  const ctx    = canvas.getContext('2d');
  const s = S(type), c = C(type);

  canvas.width  = LBL_W + cols.length * s;
  canvas.height = LBL_H + rows.length * s;

  // Background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Gather all avg times for the color scale
  const times = [];
  rows.forEach(row => cols.forEach(col => {
    const d = dataMap[row]?.[col];
    if (d) times.push(d.ms / d.n);
  }));

  let avg = 0, maxDev = 0;
  if (times.length) {
    avg    = times.reduce((a, b) => a + b, 0) / times.length;
    maxDev = Math.max(...times.map(t => Math.abs(t - avg)));
  }

  // Column labels
  ctx.fillStyle = '#475569';
  ctx.font      = '9px monospace';
  ctx.textAlign = 'center';
  cols.forEach((col, j) => {
    if (col === 2 || col % (type === 'muldiv' ? 10 : 20) === 0) {
      ctx.fillText(String(col), LBL_W + j * s + c / 2, LBL_H - 8);
    }
  });

  // Row labels
  ctx.textAlign = 'right';
  rows.forEach((row, i) => {
    const show = type === 'muldiv' ? true : (row === 2 || row % 20 === 0);
    if (show) ctx.fillText(String(row), LBL_W - 4, LBL_H + i * s + c / 2 + 3);
  });

  // Cells
  rows.forEach((row, i) => {
    cols.forEach((col, j) => {
      const d = dataMap[row]?.[col];
      ctx.fillStyle = d ? timeToColor(d.ms / d.n, avg, maxDev) : '#1e293b';
      ctx.fillRect(LBL_W + j * s, LBL_H + i * s, c, c);
    });
  });

  attachTooltip(canvas, rows, cols, type, dataMap);
}

// ── Build data maps ───────────────────────────────────────────────────────
function buildMaps(perfData) {
  const mulMap = {}, addMap = {};
  let mulTotal = 0, addTotal = 0;

  for (const [key, val] of Object.entries(perfData)) {
    const parts = key.split(':');
    const type  = parts[0];
    const row   = parseInt(parts[1]);
    const col   = parseInt(parts[2]);

    if (type === 'muldiv') {
      if (!mulMap[row]) mulMap[row] = {};
      mulMap[row][col] = val;
      mulTotal += val.n;
    } else if (type === 'addsub') {
      if (!addMap[row]) addMap[row] = {};
      addMap[row][col] = val;
      addTotal += val.n;
    }
  }
  return { mulMap, addMap, mulTotal, addTotal };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function render() {
  const { perfData = {}, perfSessions = 0 } = await storage(['perfData', 'perfSessions']);
  const { mulMap, addMap, mulTotal, addTotal } = buildMaps(perfData);

  document.getElementById('stat-muldiv').textContent   = `${mulTotal} × ÷ problems`;
  document.getElementById('stat-addsub').textContent   = `${addTotal} + − problems`;
  document.getElementById('stat-sessions').textContent = `${perfSessions} sessions`;

  const hasData = mulTotal > 0 || addTotal > 0;
  document.getElementById('empty-state').classList.toggle('hidden', hasData);

  if (hasData) {
    drawGrid('canvas-muldiv', MUL_ROWS, MUL_COLS, 'muldiv', mulMap);
    drawGrid('canvas-addsub', ADD_ROWS, ADD_COLS, 'addsub', addMap);
  }
}

// ── Tabs ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const which = btn.dataset.tab;
    document.getElementById('pane-muldiv').classList.toggle('hidden', which !== 'muldiv');
    document.getElementById('pane-addsub').classList.toggle('hidden', which !== 'addsub');
  });
});

// ── Clear ─────────────────────────────────────────────────────────────────
document.getElementById('btn-clear').addEventListener('click', () => {
  if (confirm('Clear all performance history? This cannot be undone.')) {
    chrome.storage.local.set({ perfData: {}, perfSessions: 0 }, render);
  }
});

// ── Live refresh when storage changes ─────────────────────────────────────
chrome.storage.onChanged.addListener(changes => {
  if (changes.perfData || changes.perfSessions) render();
});

render();
