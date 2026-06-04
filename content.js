(() => {
  const log = (...args) => console.log('[ZetamacExt]', ...args);

  const PROBLEM_RE = /\d+\s*[+\-−×÷*/]\s*\d+/;
  const SCORE_RE   = /Score:\s*(\d+)/;

  const storage = {
    get: (keys) => new Promise(r => chrome.storage.local.get(keys, r)),
    set: (obj)  => new Promise(r => chrome.storage.local.set(obj, r)),
  };

  let recording      = false;
  let currentProblem = null;
  let problemStart   = null;
  let backspaces     = 0;
  let lastScore      = -1;
  let pollInterval   = null;
  let observer       = null;
  let debounceTimer  = null;

  // ── Detection ────────────────────────────────────────────────────────────

  function readPage() {
    const body     = document.body.innerText;
    const problem  = (body.match(PROBLEM_RE) ?? [])[0]?.trim() ?? null;
    const scoreStr = (body.match(SCORE_RE) ?? [])[1];
    const score    = scoreStr != null ? parseInt(scoreStr) : null;
    return { problem, score };
  }

  async function saveProblem(text, elapsed, bs) {
    log(`Saving: "${text}" | ${(elapsed / 1000).toFixed(2)}s | ${bs} backspaces`);
    const { problems = [] } = await storage.get(['problems']);
    problems.push({ text, time: elapsed, backspaces: bs, timestamp: Date.now() });
    await storage.set({ problems });
  }

  function check() {
    if (!recording) return;
    const { problem, score } = readPage();

    if (lastScore === -1) {
      if (score === null) return;
      lastScore      = score;
      currentProblem = problem;
      problemStart   = Date.now();
      log('Initialized. Score:', score, '| Problem:', problem);
      return;
    }

    if (score !== null && score > lastScore) {
      log('Score:', lastScore, '→', score);
      if (currentProblem && problemStart) {
        saveProblem(currentProblem, Date.now() - problemStart, backspaces);
      }
      backspaces     = 0;
      lastScore      = score;
      currentProblem = problem;
      problemStart   = Date.now();
      log('Next problem:', problem);
    }
  }

  function handleKeydown(e) {
    if (recording && e.key === 'Backspace') backspaces++;
  }

  // ── Tracking lifecycle ───────────────────────────────────────────────────

  function startTracking() {
    stopTracking();
    backspaces = 0; currentProblem = null; problemStart = null; lastScore = -1;

    document.addEventListener('keydown', handleKeydown);

    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(check, 10);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    pollInterval = setInterval(check, 50);
    log('Tracking started');
    check();
  }

  function stopTracking() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    if (observer)     { observer.disconnect(); observer = null; }
    clearTimeout(debounceTimer);
    document.removeEventListener('keydown', handleKeydown);
  }

  async function stopRecording() {
    if (!recording) return;
    recording = false;
    if (currentProblem && problemStart) {
      await saveProblem(currentProblem, Date.now() - problemStart, backspaces);
    }
    stopTracking();
    await storage.set({ recording: false });
    log('Recording stopped');
  }

  // ── Page-specific setup ──────────────────────────────────────────────────

  const isGamePage = window.location.href.includes('/game');

  if (isGamePage) {
    // Game page: resume recording from storage and schedule auto-stop
    storage.get(['recording', 'duration', 'sessionStart']).then(data => {
      if (!data.recording) return;
      recording = true;
      startTracking();

      const sessionStart = data.sessionStart ?? Date.now();
      const duration     = data.duration     ?? 60000;
      const remaining    = duration - (Date.now() - sessionStart);

      log(`Auto-stop in ${(remaining / 1000).toFixed(1)}s`);

      if (remaining > 0) {
        setTimeout(() => { if (recording) { log('Auto-stop'); stopRecording(); } }, remaining);
      } else {
        stopRecording();
      }
    });

  } else {
    // Settings page: detect Start button click and read selected duration
    const startBtn      = document.querySelector('input[type="submit"][value="Start"]');
    const durationSelect = document.querySelector('select[name="duration"]');

    if (startBtn) {
      log('Start button found — waiting for click');
      startBtn.addEventListener('click', () => {
        const duration = durationSelect ? parseInt(durationSelect.value) * 1000 : 60000;
        log('Start clicked. Duration:', duration / 1000, 's');
        // Set before page navigates to /game
        chrome.storage.local.set({
          recording:    true,
          problems:     [],
          sessionStart: Date.now(),
          duration,
        });
      });
    } else {
      log('Settings page — no Start button found');
    }
  }

  // Still handle manual Stop Early from popup
  chrome.runtime.onMessage.addListener((msg) => {
    log('Message:', msg.type);
    if (msg.type === 'STOP') stopRecording();
  });

  log('Content script loaded on', window.location.href);
})();
