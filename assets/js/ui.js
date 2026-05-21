// assets/js/ui.js — Screen state machine + event binding + thin results render
// Walking Skeleton: wires drag-drop and file picker → parseZip → DOM render.

import { parseZip, parseFolder, parseTxt } from './parser.js';

// ── Screen references ─────────────────────────────────────────────────────────
const screens = {
  'upload':         null,
  'processing':     null,
  'results':        null,
  'without-media':  null,
};

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

// ── Results render (thin skeleton — replaced by styled render in Plan 01-03) ──

/**
 * Render parsed messages into #chat-log and set #summary-line.
 * Thin skeleton render — replaced by styled render in Plan 01-03.
 * @param {{ messages: Array, stats: { voiceTotal: number, voiceMatched: number }, rawLines: string[] }} result
 */
function renderSkeletonResults(result) {
  const { stats, rawLines } = result;
  const summaryEl = document.getElementById('summary-line');
  if (summaryEl) {
    if (stats && stats.voiceTotal > 0) {
      summaryEl.textContent = stats.voiceMatched + ' of ' + stats.voiceTotal + ' voice messages identified';
    } else if (stats) {
      summaryEl.textContent = 'Chat parsed — no voice messages found';
    } else {
      // Fallback for backward compat
      summaryEl.textContent = (rawLines ? rawLines.length : 0) + ' lines parsed';
    }
  }

  const log = document.getElementById('chat-log');
  if (!log) return;
  log.textContent = ''; // clear previous content

  // Use rawLines for the thin skeleton render (plain line-by-line display)
  const lines = rawLines || [];
  for (const line of lines) {
    const div = document.createElement('div');
    div.textContent = line; // NEVER innerHTML — user chat content is untrusted (T-01-02)
    log.appendChild(div);
  }
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
    renderSkeletonResults(result);
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
    renderSkeletonResults(result);
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
      showScreen('upload');
    });
  }
}
