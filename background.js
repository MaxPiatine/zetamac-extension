// When a session ends, open the extension's own popup (Chrome 127+)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!changes.recording) return;
  if (changes.recording.newValue !== false) return;
  if (changes.recording.oldValue !== true)  return;

  chrome.action.openPopup().catch(() => {
    // openPopup fails silently if no Chrome window is focused — that's fine
  });
});
