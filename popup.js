// ── Color scale — diverging, scaled to 0.5× stdDev so gradient spreads ──
function timeToColor(time, avg, scale) {
  if (!scale) return '#ffffff';
  const t = Math.max(-1, Math.min(1, (time - avg) / scale));
  const intensity = Math.abs(t);
  const hue   = t <= 0 ? 165 : 10;   // teal ← white → warm-red
  const sat   = Math.round(intensity * 72);
  const light = Math.round(96 - intensity * 53);
  return `hsl(${hue},${sat}%,${light}%)`;
}

function fmt(ms) { return (ms / 1000).toFixed(2) + 's'; }

function buildStats(problems) {
  if (!problems.length) return null;
  const times = problems.map(p => p.time);
  const avg   = times.reduce((a, b) => a + b, 0) / times.length;
  // Use 0.5 × stdDev as scale so ±0.5σ = full color — spreads the gradient
  const variance = times.reduce((s, t) => s + (t - avg) ** 2, 0) / times.length;
  const scale    = Math.max(Math.sqrt(variance) * 0.5, 50);
  const fastest  = Math.min(...times);
  const slowest  = Math.max(...times);
  const corrections = problems.reduce((a, p) => a + p.backspaces, 0);
  return { avg, scale, fastest, slowest, corrections };
}

const cellTooltip = document.getElementById('cell-tooltip');

function renderHeatmap(containerId, problems) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (!problems.length) return;
  const stats = buildStats(problems);

  problems.forEach((p, i) => {
    const cell = document.createElement('div');
    cell.className = 'hm-cell' + (p.backspaces > 0 ? ' has-backspace' : '');
    cell.style.background = timeToColor(p.time, stats.avg, stats.scale);

    const label = p.text === '?' ? 'unknown' : p.text;
    const tip   = `#${i + 1}  ${label}\n${fmt(p.time)}${p.backspaces > 0 ? `  ·  ${p.backspaces} correction${p.backspaces > 1 ? 's' : ''}` : ''}`;

    cell.addEventListener('mouseenter', e => {
      cellTooltip.textContent = tip;
      cellTooltip.style.display = 'block';
      positionTooltip(e);
    });
    cell.addEventListener('mousemove', positionTooltip);
    cell.addEventListener('mouseleave', () => { cellTooltip.style.display = 'none'; });

    container.appendChild(cell);
  });
}

function positionTooltip(e) {
  const pad = 10;
  const tw  = cellTooltip.offsetWidth;
  const th  = cellTooltip.offsetHeight;
  let x = e.clientX + pad;
  let y = e.clientY - th - pad;
  if (x + tw > window.innerWidth)  x = e.clientX - tw - pad;
  if (y < 0)                        y = e.clientY + pad;
  cellTooltip.style.left = x + 'px';
  cellTooltip.style.top  = y + 'px';
}

function renderLegend(legendId, stats) {
  const el = document.getElementById(legendId);
  if (!stats) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <span>${fmt(stats.fastest)}</span>
    <div class="legend-bar"></div>
    <span>${fmt(stats.slowest)}</span>`;
}

// ── Screen management ─────────────────────────────────────────────────────
const SCREENS = ['s-away', 's-idle', 's-recording', 's-done'];

function showScreen(id) {
  SCREENS.forEach(s => document.getElementById(s).classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ── History pane renderer ─────────────────────────────────────────────────
function loadHistoryPane() {
  chrome.storage.local.get(['sessionLog', 'dailyBests'], data => {
    const log   = data.sessionLog || [];
    const bests = data.dailyBests || {};
    const list  = document.getElementById('history-list');

    if (!log.length) {
      list.innerHTML = '<div class="empty-state">No sessions yet.<br>Complete a session to see your history.</div>';
      return;
    }

    const today     = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    function dateLabel(d) {
      if (d === today)     return 'Today';
      if (d === yesterday) return 'Yesterday';
      const [, m, day] = d.split('-');
      return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]} ${+day}`;
    }

    list.innerHTML = log.slice(0, 15).map(s => {
      const dailyBest = bests[s.date]?.[String(s.durationSec)];
      const isBest    = dailyBest && dailyBest.score === s.score;
      return `
        <div class="history-row">
          <span class="h-date">${dateLabel(s.date)}</span>
          <span class="h-dur">${s.durationSec}s</span>
          <span class="h-score">${s.score}</span>
          <span class="h-avg">${fmt(s.avgMs)}${isBest ? ' <span class="h-best">★</span>' : ''}</span>
        </div>`;
    }).join('');
  });
}

// Tab switching inside s-done
document.querySelectorAll('#s-done .tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#s-done .tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const which = btn.dataset.tab;
    document.getElementById('pane-session').classList.toggle('hidden', which !== 'session');
    document.getElementById('pane-history').classList.toggle('hidden', which !== 'history');
    if (which === 'history') loadHistoryPane();
  });
});

// ── Live stats (recording) ────────────────────────────────────────────────
function updateLiveStats(problems) {
  if (!problems.length) return;
  const stats = buildStats(problems);
  document.getElementById('rec-count').textContent  = `${problems.length} solved`;
  document.getElementById('live-avg').textContent   = fmt(stats.avg);
  document.getElementById('live-fast').textContent  = fmt(stats.fastest);
  document.getElementById('live-errs').textContent  = stats.corrections;
  renderHeatmap('live-heatmap', problems);
  renderLegend('live-legend', stats);
}

// ── Utilities ─────────────────────────────────────────────────────────────
function sendToTab(msg) {
  chrome.tabs.query({ url: '*://arithmetic.zetamac.com/*' }, tabs => {
    if (!tabs.length) return;
    chrome.tabs.sendMessage(tabs[0].id, msg, () => void chrome.runtime.lastError);
  });
}

function isOnZetamac(tab) {
  return tab?.url?.includes('arithmetic.zetamac.com');
}

function openHistory() {
  chrome.tabs.create({ url: chrome.runtime.getURL('heatmap.html') });
}

// ── Perf data accumulation ────────────────────────────────────────────────
function parseProblemForPerf(text) {
  if (!text || text === '?') return null;
  const m = text.match(/(\d+)\s*([+\-−×÷])\s*(\d+)/);
  if (!m) return null;
  const a = parseInt(m[1]), op = m[2], b = parseInt(m[3]);
  if (op === '×') {
    const row = a <= 12 ? a : b, col = a <= 12 ? b : a;
    return `muldiv:${row}:${col}`;
  }
  if (op === '÷') return `muldiv:${b}:${Math.round(a / b)}`;
  if (op === '+') return `addsub:${Math.min(a,b)}:${Math.max(a,b)}`;
  if (op === '-' || op === '−') {
    const c = a - b;
    return `addsub:${Math.min(b,c)}:${Math.max(b,c)}`;
  }
  return null;
}

function updatePerfData(problems) {
  chrome.storage.local.get(['perfData', 'perfSessions', 'sessionLog', 'dailyBests', 'duration', 'sessionLogged'], data => {
    if (data.sessionLogged) return;  // already logged this session

    const perf     = data.perfData  || {};
    const sessions = (data.perfSessions || 0) + 1;
    const log      = data.sessionLog || [];
    const bests    = data.dailyBests || {};
    const durSec   = Math.round((data.duration || 60000) / 1000);

    // Update per-problem averages
    for (const p of problems) {
      const key = parseProblemForPerf(p.text);
      if (!key) continue;
      if (!perf[key]) perf[key] = { n: 0, ms: 0 };
      perf[key].n++;
      perf[key].ms += p.time;
    }

    // Log this session
    const date   = new Date().toISOString().split('T')[0];
    const score  = problems.length;
    const avgMs  = score > 0 ? Math.round(problems.reduce((s, p) => s + p.time, 0) / score) : 0;
    const corrections = problems.reduce((s, p) => s + p.backspaces, 0);
    log.unshift({ date, durationSec: durSec, score, avgMs, corrections });
    if (log.length > 50) log.pop();

    // Update daily best
    if (!bests[date]) bests[date] = {};
    const durKey = String(durSec);
    if (!bests[date][durKey] || score > bests[date][durKey].score) {
      bests[date][durKey] = { score, avgMs };
    }

    chrome.storage.local.set({ perfData: perf, perfSessions: sessions, sessionLog: log, dailyBests: bests, sessionLogged: true });
  });
}

// ── Results ───────────────────────────────────────────────────────────────
function showResults(problems, sessionStart) {
  if (!problems.length) { showScreen('s-idle'); return; }
  updatePerfData(problems);
  const stats = buildStats(problems);

  document.getElementById('res-count').textContent = problems.length;
  document.getElementById('res-avg').textContent   = fmt(stats.avg);
  document.getElementById('res-errs').textContent  = stats.corrections;

  renderHeatmap('res-heatmap', problems);
  renderLegend('res-legend', stats);
  showScreen('s-done');
  loadHistoryPane();
}

// ── Boot ──────────────────────────────────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  const tab = tabs[0];
  if (!isOnZetamac(tab)) { showScreen('s-away'); return; }

  chrome.storage.local.get(['recording', 'problems', 'sessionStart'], data => {
    if (data.recording) {
      showScreen('s-recording');
      updateLiveStats(data.problems || []);
    } else if (data.problems?.length) {
      showResults(data.problems, data.sessionStart);
    } else {
      showScreen('s-idle');
    }
  });
});

// Live updates while popup is open
chrome.storage.onChanged.addListener(changes => {
  if (changes.problems) {
    const problems = changes.problems.newValue || [];
    chrome.storage.local.get(['recording'], data => {
      if (data.recording) updateLiveStats(problems);
    });
  }
  if (changes.recording && changes.recording.newValue === false) {
    chrome.storage.local.get(['problems', 'sessionStart'], data => {
      showResults(data.problems || [], data.sessionStart);
    });
  }
});

// ── Button handlers ───────────────────────────────────────────────────────
document.getElementById('btn-stop').addEventListener('click', () => {
  sendToTab({ type: 'STOP' });
  setTimeout(() => {
    chrome.storage.local.get(['problems', 'sessionStart'], data => {
      chrome.storage.local.set({ recording: false });
      showResults(data.problems || [], data.sessionStart);
    });
  }, 400);
});

document.getElementById('btn-history-idle').addEventListener('click', openHistory);
document.getElementById('btn-history-results').addEventListener('click', openHistory);
document.getElementById('btn-heatmap').addEventListener('click', openHistory);

document.getElementById('btn-new').addEventListener('click', () => {
  chrome.storage.local.set({ problems: [], recording: false, sessionStart: null });
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.update(tabs[0].id, { url: 'https://arithmetic.zetamac.com/' });
  });
});
