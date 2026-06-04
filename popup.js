// Diverging color scale centered on session mean
// t = normalized deviation: -1 (fastest) → 0 (avg/white) → +1 (slowest)
function timeToColor(time, avg, maxDev) {
  if (maxDev === 0) return '#ffffff';
  const t = Math.max(-1, Math.min(1, (time - avg) / maxDev));
  const intensity = Math.abs(t);
  const sat = Math.round(intensity * 80);
  const light = Math.round(100 - intensity * 55); // 100% white → 45% dark
  const hue = t <= 0 ? 120 : 0; // green if faster, red if slower
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function fmt(ms) {
  return (ms / 1000).toFixed(2) + 's';
}

function buildStats(problems) {
  if (!problems.length) return null;
  const times = problems.map(p => p.time);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const maxDev = Math.max(...times.map(t => Math.abs(t - avg)));
  const fastest = Math.min(...times);
  const slowest = Math.max(...times);
  const corrections = problems.reduce((a, p) => a + p.backspaces, 0);
  return { avg, maxDev, fastest, slowest, corrections };
}

function renderHeatmap(containerId, problems) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (!problems.length) return;

  const stats = buildStats(problems);

  problems.forEach((p, i) => {
    const cell = document.createElement('div');
    cell.className = 'hm-cell' + (p.backspaces > 0 ? ' has-backspace' : '');
    cell.style.background = timeToColor(p.time, stats.avg, stats.maxDev);
    const label = p.text === '?' ? '(missed label)' : p.text;
    cell.title = `#${i + 1}: ${label}\nTime: ${fmt(p.time)}\nCorrections: ${p.backspaces}`;
    container.appendChild(cell);
  });
}

function renderLegend(legendId, stats) {
  const legend = document.getElementById(legendId);
  if (!stats) { legend.innerHTML = ''; return; }
  legend.innerHTML = `
    <span>${fmt(stats.fastest)}</span>
    <div class="legend-bar"></div>
    <span>${fmt(stats.slowest)}</span>
  `;
}

function updateLiveStats(problems) {
  if (!problems.length) return;
  const stats = buildStats(problems);
  document.getElementById('rec-count').textContent = `${problems.length} solved`;
  document.getElementById('live-avg').textContent = fmt(stats.avg);
  document.getElementById('live-fast').textContent = fmt(stats.fastest);
  document.getElementById('live-errs').textContent = stats.corrections;
  renderHeatmap('live-heatmap', problems);
  renderLegend('live-legend', stats);
}

function showScreen(id) {
  ['screen-away', 'screen-idle', 'screen-recording', 'screen-results'].forEach(s => {
    document.getElementById(s).classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
}

function sendToTab(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, msg);
  });
}

function isOnZetamac(tab) {
  return tab?.url?.includes('arithmetic.zetamac.com');
}

// Boot: determine which screen to show
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!isOnZetamac(tab)) {
    showScreen('screen-away');
    return;
  }

  chrome.storage.local.get(['recording', 'problems'], (data) => {
    if (data.recording) {
      showScreen('screen-recording');
      updateLiveStats(data.problems || []);
    } else if (data.problems?.length) {
      showScreen('screen-results');
      showResults(data.problems, data.sessionStart);
    } else {
      showScreen('screen-idle');
    }
  });
});

// Live updates while popup is open
chrome.storage.onChanged.addListener((changes) => {
  if (changes.problems) {
    const problems = changes.problems.newValue || [];
    chrome.storage.local.get(['recording'], (data) => {
      if (data.recording) updateLiveStats(problems);
    });
  }
  if (changes.recording && changes.recording.newValue === false) {
    chrome.storage.local.get(['problems', 'sessionStart'], (data) => {
      showScreen('screen-results');
      showResults(data.problems || [], data.sessionStart);
    });
  }
});

// ── Problem parser for persistent history ────────────────────────────────
function parseProblemForPerf(text) {
  if (!text || text === '?') return null;
  const m = text.match(/(\d+)\s*([+\-−×÷])\s*(\d+)/);
  if (!m) return null;
  const a = parseInt(m[1]), op = m[2], b = parseInt(m[3]);

  if (op === '×') {
    // Normalise: the factor in 2–12 is the row
    const row = a <= 12 ? a : b;
    const col = a <= 12 ? b : a;
    return `muldiv:${row}:${col}`;
  }
  if (op === '÷') {
    // b is divisor (2–12), quotient = a/b
    return `muldiv:${b}:${Math.round(a / b)}`;
  }
  if (op === '+') {
    return `addsub:${Math.min(a, b)}:${Math.max(a, b)}`;
  }
  if (op === '-' || op === '−') {
    const c = a - b;
    return `addsub:${Math.min(b, c)}:${Math.max(b, c)}`;
  }
  return null;
}

function updatePerfData(problems) {
  chrome.storage.local.get(['perfData', 'perfSessions'], data => {
    const perf     = data.perfData     || {};
    const sessions = (data.perfSessions || 0) + 1;
    for (const p of problems) {
      const key = parseProblemForPerf(p.text);
      if (!key) continue;
      if (!perf[key]) perf[key] = { n: 0, ms: 0 };
      perf[key].n++;
      perf[key].ms += p.time;
    }
    chrome.storage.local.set({ perfData: perf, perfSessions: sessions });
  });
}

// ── Open history page ─────────────────────────────────────────────────────
function openHistory() {
  chrome.tabs.create({ url: chrome.runtime.getURL('heatmap.html') });
}

function showResults(problems, sessionStart) {
  if (!problems.length) { showScreen('screen-idle'); return; }
  updatePerfData(problems);
  const stats = buildStats(problems);
  const dur = sessionStart ? Date.now() - sessionStart : null;

  document.getElementById('res-count').textContent = problems.length;
  document.getElementById('res-avg').textContent = fmt(stats.avg);
  document.getElementById('res-fast').textContent = fmt(stats.fastest);
  document.getElementById('res-slow').textContent = fmt(stats.slowest);
  document.getElementById('res-errs').textContent = stats.corrections;
  document.getElementById('res-dur').textContent = dur ? Math.round(dur / 1000) + 's' : '—';

  renderHeatmap('res-heatmap', problems);
  renderLegend('res-legend', stats);
}

// Button handlers
document.getElementById('btn-stop').addEventListener('click', () => {
  sendToTab({ type: 'STOP' });
  // Wait for content script to save the last in-progress problem before reading results
  setTimeout(() => {
    chrome.storage.local.get(['problems', 'sessionStart'], (data) => {
      chrome.storage.local.set({ recording: false });
      showScreen('screen-results');
      showResults(data.problems || [], data.sessionStart);
    });
  }, 400);
});

document.getElementById('btn-history-idle').addEventListener('click', openHistory);
document.getElementById('btn-history-results').addEventListener('click', openHistory);

document.getElementById('btn-new').addEventListener('click', () => {
  chrome.storage.local.set({ problems: [], recording: false, sessionStart: null });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.update(tabs[0].id, { url: 'https://arithmetic.zetamac.com/' });
  });
});
