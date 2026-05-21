// assets/js/ui.js — Screen state machine + event binding + full styled results render

import { parseZip, parseFolder, parseTxt } from './parser.js';

// ── Screen references ─────────────────────────────────────────────────────────
const screens = {
  'upload':         null,
  'processing':     null,
  'results':        null,
  'without-media':  null,
};

// ── Module-level state ────────────────────────────────────────────────────────
// Holds the plain-text output of the most recent parse so copy/download handlers
// can access it without being tightly coupled to renderChatLog.
let currentPlainText = null;

/**
 * Show one screen; hide all others.
 * @param {'upload'|'processing'|'results'|'without-media'} name
 */
function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    if (el) {
      el.style.display = key === name ? 'block' : 'none';
    }
  }
}

// ── Error display ─────────────────────────────────────────────────────────────

/**
 * Show a parse error inline on the upload screen.
 * Replaces any previous error. Uses textContent — never innerHTML (T-01-05).
 * @param {string} message
 */
function showParseError(message) {
  const screen = screens['upload'];
  if (!screen) return;
  // Remove any previous error
  const prev = screen.querySelector('.parse-error');
  if (prev) prev.remove();
  const p = document.createElement('p');
  p.className = 'parse-error';
  p.textContent = message; // safe — only err.message, never full Error object
  screen.appendChild(p);
}

// ── Results render ────────────────────────────────────────────────────────────

/**
 * Build a single message row element for the chat log.
 * Uses textContent exclusively — never innerHTML — for all user-supplied values (T-03-01).
 * @param {{ type: string, timestamp: string, sender?: string, content: string, matched?: boolean, annotation?: string }} msg
 * @returns {HTMLDivElement}
 */
function renderMessage(msg) {
  const row = document.createElement('div');
  row.className = 'message-row';

  const ts = document.createElement('span');
  ts.className = 'timestamp';
  ts.textContent = msg.timestamp; // NEVER innerHTML — user data (T-03-01)

  const sender = document.createElement('span');
  sender.className = 'sender';
  sender.textContent = (msg.sender || '') + ': '; // NEVER innerHTML — user data (T-03-01)

  const body = document.createElement('span');
  if (msg.type === 'voice' && msg.matched) {
    body.className = 'voice-annotation';
    body.textContent = '[Voice message: transcription pending]';
    // ERR-02: Phase 2 replaces this with real transcript or [Audio unreadable] if decode fails
  } else if (msg.type === 'voice' && !msg.matched) {
    body.className = 'voice-annotation error';
    body.textContent = msg.annotation || '[Audio file missing]'; // NEVER innerHTML — user data
  } else if (msg.type === 'voice-omitted') {
    body.className = 'voice-annotation';
    body.textContent = '[Audio not available]';
  } else {
    body.textContent = msg.content; // NEVER innerHTML — user chat content (T-03-01)
  }

  row.appendChild(ts);
  row.appendChild(sender);
  row.appendChild(body);
  return row;
}

/**
 * Render the full styled chat log into #chat-log and set #summary-line.
 * Stores plainText on the module-level currentPlainText variable for copy/download.
 * Replaces the previous renderSkeletonResults from Plan 01-01.
 * @param {{ messages: Array, plainText: string, stats: { voiceTotal: number, voiceMatched: number }, mode: string }} result
 */
function renderChatLog(result) {
  const { messages, plainText, stats } = result;

  // Store for copy/download handlers
  currentPlainText = plainText || null;

  const summaryEl = document.getElementById('summary-line');
  if (summaryEl) {
    if (!stats || stats.voiceTotal === 0) {
      summaryEl.textContent = 'No voice messages found in this export';
    } else if (stats.voiceMatched > 0) {
      summaryEl.textContent = stats.voiceMatched + ' of ' + stats.voiceTotal + ' voice messages identified';
    } else {
      // voiceMatched === 0 && voiceTotal > 0 — parse-only mode (INPUT-04) or export with no matched audio
      summaryEl.textContent = '0 of ' + stats.voiceTotal + ' voice messages available — audio not included in this export';
    }
  }

  const log = document.getElementById('chat-log');
  if (!log) return;
  log.textContent = ''; // clear previous content (safe — not innerHTML)

  if (!messages) return;
  for (const msg of messages) {
    if (msg.type === 'system') continue; // skip system messages
    const rowEl = renderMessage(msg);
    log.appendChild(rowEl);
  }
}

/**
 * Copy text to clipboard using navigator.clipboard with execCommand fallback.
 * On success: changes button label to "Copied!" for 1500ms then reverts.
 * On failure: shows error label for 3000ms then reverts.
 * Implements OUT-03 and UI-SPEC Clipboard Copy interaction contract.
 * @param {string} text
 * @param {HTMLButtonElement} button
 */
async function copyToClipboard(text, button) {
  const originalLabel = button.textContent;

  const onSuccess = () => {
    button.textContent = 'Copied!';
    setTimeout(() => { button.textContent = originalLabel; }, 1500);
  };

  const onFailure = () => {
    button.textContent = 'Copy failed — try selecting and copying manually';
    setTimeout(() => { button.textContent = originalLabel; }, 3000);
  };

  try {
    await navigator.clipboard.writeText(text);
    onSuccess();
  } catch (_err) {
    // Fallback: hidden textarea + execCommand (deprecated but widely supported)
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (ok) {
      onSuccess();
    } else {
      onFailure();
    }
  }
}

/**
 * Download the given text as voicefill-export.txt via a Blob object URL.
 * Revokes the URL immediately after triggering the download (T-03-04, no URL leak).
 * Implements OUT-04 and UI-SPEC File Download interaction contract.
 * @param {string} text
 */
function downloadTxt(text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'voicefill-export.txt';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url); // immediately revoke to prevent URL leak (T-03-04)
}

// ── File processing ───────────────────────────────────────────────────────────

/**
 * Show processing screen, parse ZIP, enforce 300ms minimum display, then route to results.
 * @param {File} file
 */
async function processFile(file) {
  showScreen('processing');
  const start = Date.now();

  let result;
  try {
    result = await parseZip(file);
  } catch (err) {
    showScreen('upload');
    showParseError(err.message);
    return;
  }

  // Enforce 300ms minimum on processing screen to prevent jarring flash (Pitfall 6)
  const elapsed = Date.now() - start;
  if (elapsed < 300) {
    await new Promise(r => setTimeout(r, 300 - elapsed));
  }

  if (result.mode === 'without-media') {
    showScreen('without-media');
  } else {
    renderChatLog(result);
    showScreen('results');
  }
}

/**
 * Show processing screen, parse extracted folder (INPUT-03), enforce 300ms minimum, then route.
 * @param {FileList} fileList
 */
async function processFolder(fileList) {
  showScreen('processing');
  const start = Date.now();

  let result;
  try {
    result = await parseFolder(fileList);
  } catch (err) {
    showScreen('upload');
    showParseError(err.message);
    return;
  }

  const elapsed = Date.now() - start;
  if (elapsed < 300) {
    await new Promise(r => setTimeout(r, 300 - elapsed));
  }

  if (result.mode === 'without-media') {
    showScreen('without-media');
  } else {
    renderChatLog(result);
    showScreen('results');
  }
}

/**
 * Show processing screen, parse raw .txt chat log (INPUT-04), enforce 300ms minimum, then route.
 * Parse-only mode always goes to results (mode is always 'with-media' per Pitfall 5).
 * @param {File} file
 */
async function processTxt(file) {
  showScreen('processing');
  const start = Date.now();

  let result;
  try {
    result = await parseTxt(file);
  } catch (err) {
    showScreen('upload');
    showParseError(err.message);
    return;
  }

  const elapsed = Date.now() - start;
  if (elapsed < 300) {
    await new Promise(r => setTimeout(r, 300 - elapsed));
  }

  // parse-only .txt always returns mode 'with-media' — goes directly to results
  renderSkeletonResults(result);
  showScreen('results');
}

// ── Public init ───────────────────────────────────────────────────────────────

/**
 * Initialise all event bindings. Called once from main.js on DOMContentLoaded.
 */
export function init() {
  // Resolve screen elements
  screens['upload']        = document.getElementById('screen-upload');
  screens['processing']    = document.getElementById('screen-processing');
  screens['results']       = document.getElementById('screen-results');
  screens['without-media'] = document.getElementById('screen-without-media');

  const dropZone       = document.getElementById('drop-zone');
  const btnBrowse      = document.getElementById('btn-browse');
  const fileInput      = document.getElementById('file-input');
  const folderInput    = document.getElementById('folder-input');
  const btnBrowseFolder = document.getElementById('btn-browse-folder');
  const txtInput       = document.getElementById('txt-input');
  const btnBrowseTxt   = document.getElementById('btn-browse-txt');
  const btnTryAgainWm  = document.getElementById('btn-try-again-wm');
  const btnTryAnother  = document.getElementById('btn-try-another');
  const btnCopy        = document.getElementById('btn-copy');
  const btnDownload    = document.getElementById('btn-download');

  // ── Drag and Drop ──────────────────────────────────────────────────────────

  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault(); // required to enable drop
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // Silently ignore non-ZIP drops — no error (per UI-SPEC Drag and Drop contract)
    if (!file.name.toLowerCase().endsWith('.zip')) return;
    processFile(file);
  });

  // ── File Picker ────────────────────────────────────────────────────────────

  btnBrowse.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be re-selected
    processFile(file);
  });

  // ── Folder Picker (INPUT-03) ───────────────────────────────────────────────

  if (btnBrowseFolder) {
    btnBrowseFolder.addEventListener('click', () => {
      folderInput.click();
    });
  }

  if (folderInput) {
    folderInput.addEventListener('change', (e) => {
      if (!e.target.files || e.target.files.length === 0) return;
      processFolder(e.target.files);
      e.target.value = ''; // reset so same folder can be re-selected
    });
  }

  // ── Txt File Picker (INPUT-04) ─────────────────────────────────────────────

  if (btnBrowseTxt) {
    btnBrowseTxt.addEventListener('click', () => {
      txtInput.click();
    });
  }

  if (txtInput) {
    txtInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = ''; // reset so same file can be re-selected
      processTxt(file);
    });
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  if (btnTryAgainWm) {
    btnTryAgainWm.addEventListener('click', () => {
      showScreen('upload');
    });
  }

  if (btnTryAnother) {
    btnTryAnother.addEventListener('click', () => {
      currentPlainText = null;
      const log = document.getElementById('chat-log');
      if (log) log.textContent = '';
      const summaryEl = document.getElementById('summary-line');
      if (summaryEl) summaryEl.textContent = '';
      showScreen('upload');
    });
  }

  // ── Copy to clipboard ──────────────────────────────────────────────────────

  if (btnCopy) {
    btnCopy.addEventListener('click', (e) => {
      if (currentPlainText === null) return; // guard: no data yet
      copyToClipboard(currentPlainText, e.currentTarget);
    });
  }

  // ── Download .txt ──────────────────────────────────────────────────────────

  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      if (currentPlainText === null) return; // guard: no data yet
      downloadTxt(currentPlainText);
    });
  }
}
