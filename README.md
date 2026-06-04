# Zetamac Session Recorder

A Chrome extension that sits on top of [arithmetic.zetamac.com](https://arithmetic.zetamac.com) and records your sessions — tracking response time per problem, typing corrections, and building a persistent heatmap of your performance across every number combination you've ever practiced.

---

## The Idea

Zetamac tells you your final score but nothing else. You don't know which problems slowed you down, which ones you had to correct, or whether you're getting faster at `7 × 8` over time.

This extension fixes that. It records every problem silently in the background, then shows:

- **Per-session results** — response time per problem, avg/fastest/slowest, correction count
- **A session heatmap** — one colored square per problem. White = your average. Darker green = faster than average. Darker red = slower than average. A dot = you used backspace on that one.
- **A persistent history heatmap** — a full multiplication table (rows 2–12, cols 2–100) and addition grid (2–99 × 2–99) that fills in over time as you practice. Every session accumulates into the same grid so you can see long-term patterns.

---

## Features

| Feature | Detail |
|---|---|
| Auto-start | Detects when you click **Start** on zetamac — no button to press |
| Auto-stop | Reads the selected duration (30s / 60s / 120s / etc.) and stops automatically |
| Response timing | Measures time from when each problem appears to when you answer correctly |
| Correction tracking | Counts backspace presses per problem as a proxy for typing errors |
| Session heatmap | Diverging color scale centered on your session mean |
| History heatmap | Persistent grid that accumulates across all sessions, stored locally |
| Score-accurate | Uses zetamac's score counter as the ground truth — matches your final score |
| No account needed | All data lives in `chrome.storage.local` on your machine |

---

## Project Structure

```
zetamac-extension/
├── manifest.json      — Chrome extension config (Manifest V3)
├── content.js         — Injected into zetamac, detects problems and tracks timing
├── popup.html         — Extension popup UI
├── popup.css          — Popup styling
├── popup.js           — Popup logic, session results, data accumulation
├── heatmap.html       — Full-page persistent history heatmap
├── heatmap.css        — Heatmap page styling
└── heatmap.js         — Heatmap rendering (canvas-based grids + tooltips)
```

---

## Installation

### 1. Get the files

Clone or download this folder to your computer. All files should be in one flat directory — no build step required.

```
git clone <repo-url>
```

Or just download and unzip if you have the folder as a zip.

### 2. Open Chrome Extensions

In Chrome, navigate to:

```
chrome://extensions
```

### 3. Enable Developer Mode

In the top-right corner of the Extensions page, toggle **Developer mode** on.

![Developer mode toggle in the top right]

### 4. Load the extension

Click **Load unpacked**, then select the `zetamac-extension` folder (the one containing `manifest.json`).

The extension will appear in your list with the name **Zetamac Session Recorder**.

### 5. Pin it to your toolbar

Click the puzzle piece icon (🧩) in the Chrome toolbar, find **Zetamac Session Recorder**, and click the pin icon so it's always visible.

---

## Usage

### Running a session

1. Go to [arithmetic.zetamac.com](https://arithmetic.zetamac.com)
2. Pick your settings (duration, operations, ranges) as normal
3. Click **Start** on the zetamac page — the extension begins recording automatically
4. Do your session
5. When the timer ends, the extension stops automatically and your results appear in the popup

There are no buttons to click in the extension during a session.

### Reading session results

Click the extension icon after a session to see:

- **Solved** — number of problems answered correctly (matches zetamac's score)
- **Avg / Fastest / Slowest** — response times in seconds
- **Corrections** — total backspace presses across the session
- **Duration** — total session length
- **Response Time Heatmap** — one cell per problem, colored relative to your session average:
  - Dark green = much faster than your average
  - White = at your average
  - Dark red = much slower than your average
  - Small white dot on a cell = you used backspace on that problem

Hover any cell to see the exact problem, your time, and correction count.

### Viewing history

Click **History →** in the popup (available on both the idle and results screens) to open a full-page heatmap in a new tab.

**× ÷ tab** — A grid with rows 2–12 and columns 2–100. Each cell represents a multiplication fact (e.g. row 7, col 52 = the fact `7 × 52`). Division problems map to the same grid since `364 ÷ 7 = 52` tests the same underlying fact as `7 × 52`.

**+ − tab** — A grid with rows 2–99 and columns 2–99. Each cell represents an addition pair (e.g. row 18, col 37). Subtraction problems normalize to the same grid (`55 − 18 = 37` maps to the same cell as `18 + 37`).

Color scale on the history heatmap is also diverging — centered on your overall average across all recorded problems of that type. Gray cells haven't been practiced yet.

Hover any cell to see the fact, how many times you've solved it, and your all-time average time for that combination.

### Starting a new session

Click **▶ New Session** to clear the current results and navigate back to zetamac's settings page.

---

## How data is stored

Everything is kept in `chrome.storage.local` — nothing leaves your browser.

| Key | What it holds |
|---|---|
| `problems` | The current session's problem list (cleared on new session) |
| `recording` | Boolean — whether a session is active |
| `sessionStart` | Timestamp when the current session started |
| `duration` | Duration in ms read from zetamac's settings |
| `perfData` | Persistent history: a key-value map of problem combinations → `{ n, ms }` |
| `perfSessions` | Total number of sessions recorded |

The history data is cumulative — each session adds to `perfData` without overwriting it. To reset, click **Clear History** on the history page.

---

## Updating the extension

If you edit any of the files after loading the extension:

1. Go to `chrome://extensions`
2. Click the **refresh icon** (↻) on the Zetamac Recorder card
3. Refresh the zetamac tab

Changes to `content.js` require refreshing the zetamac tab. Changes to popup files take effect immediately on next popup open.

---

## Known limitations

- Requires the zetamac tab to be open when you click Start — the extension reads the Start button and duration selector directly from the page DOM
- Problems answered in the brief window between the timer ending and the extension's final check may occasionally be labeled `?` in the heatmap (timing is still captured correctly)
- History heatmap fills in gradually — most cells will be gray until you've practiced those specific combinations
