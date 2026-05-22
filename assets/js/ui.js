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

// Phase 2: Worker lifecycle state
let worker = null;           // singleton Worker instance
let isWorkerReady = false;   // true after first 'ready' message (Pitfall 6)
let pendingQueue = [];       // jobs buffered while model is still loading (D-02)
let transcribeTotal = 0;     // voice messages to process in this session
let transcribeDone = 0;      // completed count (result or error)

// Phase 2: DOM refs promoted to module scope (resolved at init() time)
let btnCopy = null;
let btnDownload = null;
let modelBanner = null;
const modelFileProgress = {}; // file → { loaded, total } — for aggregate download %

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
    body.className = 'voice-annotation pending';
    body.textContent = '[Voice message: transcription pending]';
    row.dataset.filename = msg.basename; // enables querySelector lookup by Worker result handler
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

// ── Phase 2: Worker helper functions ─────────────────────────────────────────

/**
 * Extract raw audio bytes from a voice message entry.
 * Handles both ZIP mode (ZipObject) and folder mode (File).
 * @param {File|Object} audioEntry
 * @returns {Promise<Uint8Array>}
 */
async function getAudioBytes(audioEntry) {
  if (audioEntry instanceof File) {
    const buf = await audioEntry.arrayBuffer();
    return new Uint8Array(buf);
  } else {
    // ZipObject (JSZip) — async('uint8array') returns Uint8Array directly
    return await audioEntry.async('uint8array');
  }
}

/**
 * Decode and resample audio to a Float32Array at 16kHz.
 * Must run on the main thread — OfflineAudioContext is not available in Web Workers.
 * Two-step: first OfflineAudioContext decodes at native rate; second resamples to 16kHz.
 * @param {File|Object} audioEntry
 * @returns {Promise<Float32Array>}
 */
async function decodeAudio(audioEntry) {
  const bytes = await getAudioBytes(audioEntry);
  // .slice(0) is mandatory: decodeAudioData detaches the ArrayBuffer
  const decodeCtx = new OfflineAudioContext(1, 1, 48000);
  const decoded = await decodeCtx.decodeAudioData(bytes.buffer.slice(0));
  const targetRate = 16000;
  const targetLength = Math.ceil(decoded.duration * targetRate);
  const resampleCtx = new OfflineAudioContext(1, targetLength, targetRate);
  const source = resampleCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(resampleCtx.destination);
  source.start(0);
  const resampled = await resampleCtx.startRendering();
  return resampled.getChannelData(0); // Float32Array at 16kHz
}

/**
 * Update a matched voice row in-place with transcript or error text.
 * Uses CSS.escape for safe filename lookup. textContent only — never innerHTML (T-02-01).
 * @param {{ status: string, filename: string, text?: string }} data
 */
function updateRowInPlace(data) {
  const row = document.querySelector('[data-filename="' + CSS.escape(data.filename) + '"]');
  if (!row) return;
  const body = row.querySelector('.voice-annotation');
  if (!body) return;

  if (data.status === 'error') {
    body.textContent = '[Audio unreadable]'; // ERR-02 / D-13
    body.classList.remove('pending');
    body.classList.add('error');
  } else {
    const text = data.text === '[No speech detected]'
      ? '[No speech detected]'                    // D-13 silence annotation
      : '[Voice message: "' + data.text + '"]';   // D-13 / OUT-01 transcript format
    body.textContent = text; // textContent ONLY — never innerHTML (T-02-01)
    body.classList.remove('pending');
    body.classList.add('resolved'); // CSS handles fade-in via .resolved animation (D-06)
  }
}

/**
 * Update the summary line with transcription progress.
 * D-08: "Transcribing N of M..." while in progress.
 * D-09: "X of M voice messages transcribed — Y silent" when done.
 * @param {number} done
 * @param {number} total
 */
function updateSummaryLine(done, total) {
  const summaryEl = document.getElementById('summary-line');
  if (!summaryEl) return;

  if (done < total) {
    // D-08: in-progress format
    summaryEl.textContent = 'Transcribing ' + done + ' of ' + total + ' voice messages...';
  } else {
    // D-09: final summary with silence count
    const allRows = document.querySelectorAll('[data-filename]');
    let silentCount = 0;
    allRows.forEach(function(row) {
      const body = row.querySelector('.voice-annotation');
      if (body && body.textContent === '[No speech detected]') silentCount++;
    });
    const transcribed = total - silentCount;
    summaryEl.textContent = transcribed + ' of ' + total + ' voice messages transcribed — ' + silentCount + ' silent';
  }
}

/**
 * Disable Copy and Download buttons while transcription is in progress (D-05).
 * Sets disabled attribute and inline opacity for immediate visual feedback.
 */
function disableCopyDownload() {
  if (btnCopy)     { btnCopy.disabled = true;     btnCopy.style.opacity = '0.4'; }
  if (btnDownload) { btnDownload.disabled = true;  btnDownload.style.opacity = '0.4'; }
}

/**
 * Enable Copy and Download buttons after all transcription is complete (D-05).
 * Clears inline opacity so natural CSS takes over.
 */
function enableCopyDownload() {
  if (btnCopy)     { btnCopy.disabled = false;     btnCopy.style.opacity = ''; }
  if (btnDownload) { btnDownload.disabled = false;  btnDownload.style.opacity = ''; }
}

/**
 * Show or update the model download progress banner (D-07).
 * Tracks per-file loaded/total bytes so multi-file models show a true aggregate %.
 * @param {{ status: string, file?: string, loaded?: number, total?: number }} progressData
 */
function updateBanner(progressData) {
  if (!modelBanner) return;
  const { file, loaded, total, status } = progressData;

  if (file) {
    if (!modelFileProgress[file]) modelFileProgress[file] = { loaded: 0, total: 0 };
    if (loaded != null) modelFileProgress[file].loaded = loaded;
    if (total != null && total > 0) modelFileProgress[file].total = total;
    if (status === 'done') modelFileProgress[file].loaded = modelFileProgress[file].total;
  }

  const allFiles = Object.values(modelFileProgress);
  const totalBytes = allFiles.reduce((s, f) => s + f.total, 0);
  const loadedBytes = allFiles.reduce((s, f) => s + f.loaded, 0);
  const pct = totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : null;

  const totalMB = totalBytes > 0 ? Math.round(totalBytes / 1024 / 1024) : null;
  modelBanner.style.display = 'block';
  modelBanner.textContent = pct != null && totalMB != null
    ? 'Loading model... ' + pct + '% (~' + totalMB + 'MB, downloads once)'
    : 'Loading model... (downloads once)';
}

/**
 * Hide the model download progress banner after Worker emits 'ready'.
 */
function hideBanner() {
  if (!modelBanner) return;
  modelBanner.style.display = 'none';
}

/**
 * Handle all messages from the Worker.
 * Routes: ready → drain queue; progress → update banner; result/error → update row + summary.
 * @param {MessageEvent} e
 */
function onWorkerMessage(e) {
  const data = e.data;

  if (data.status === 'ready') {
    // D-03: Worker is ready — mark it, hide banner, drain any buffered jobs
    isWorkerReady = true;
    hideBanner();
    for (const job of pendingQueue) {
      worker.postMessage(job, [job.pcmData.buffer]); // Transferable
    }
    pendingQueue = [];
    return;
  }

  if (data.status === 'initiate' || data.status === 'progress' || data.status === 'done') {
    updateBanner(data); // D-07 — all three events carry file/loaded/total needed for aggregate %
    return;
  }

  if (data.status === 'result' || data.status === 'error') {
    transcribeDone++;
    updateRowInPlace(data);                              // D-04 / D-06: in-place fade-in update
    updateSummaryLine(transcribeDone, transcribeTotal);  // D-08 / D-09
    if (transcribeDone === transcribeTotal) {
      enableCopyDownload(); // D-05: enable after all done
    }
  }
}

/**
 * Dispatch transcription jobs to the Worker for all matched voice messages.
 * Progressive: results screen is already visible; rows update in-place as Worker responds.
 * @param {{ messages: Array }} result
 */
async function dispatchTranscription(result) {
  const voiceMessages = result.messages.filter(function(m) {
    return m.type === 'voice' && m.matched;
  });

  transcribeTotal = voiceMessages.length;
  transcribeDone = 0;

  if (transcribeTotal === 0) {
    enableCopyDownload(); // nothing to transcribe — enable buttons immediately
    return;
  }

  disableCopyDownload(); // D-05: disable until all done
  updateSummaryLine(0, transcribeTotal); // D-08: set initial "Transcribing 0 of N..."

  // Decode all audio concurrently so decode of message N+1 overlaps with Worker inference on N.
  await Promise.all(voiceMessages.map(async (msg, i) => {
    let pcmData;
    try {
      pcmData = await decodeAudio(msg.audioEntry);
    } catch (_err) {
      transcribeDone++;
      updateRowInPlace({ status: 'error', filename: msg.basename });
      updateSummaryLine(transcribeDone, transcribeTotal);
      if (transcribeDone === transcribeTotal) enableCopyDownload();
      return;
    }

    const job = {
      type: 'transcribe',
      pcmData: pcmData,
      filename: msg.basename,
      index: i + 1,
      total: transcribeTotal,
    };

    if (isWorkerReady) {
      worker.postMessage(job, [pcmData.buffer]);
    } else {
      pendingQueue.push(job);
    }
  }));
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
    console.error('[VoiceFill] parseZip failed:', err);
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
    await dispatchTranscription(result); // Phase 2: dispatch Worker jobs for matched voice messages
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
    await dispatchTranscription(result); // Phase 2: dispatch Worker jobs for matched voice messages
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
  renderChatLog(result);
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

  // Phase 2: construct singleton Worker eagerly on init (D-01)
  // type: 'module' required — worker.js uses ES module import syntax (RESEARCH.md Pattern 4)
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', onWorkerMessage);

  // Phase 2: resolve DOM refs used by helper functions
  modelBanner = document.getElementById('model-banner');

  const dropZone       = document.getElementById('drop-zone');
  const btnBrowse      = document.getElementById('btn-browse');
  const fileInput      = document.getElementById('file-input');
  const folderInput    = document.getElementById('folder-input');
  const btnBrowseFolder = document.getElementById('btn-browse-folder');
  const txtInput       = document.getElementById('txt-input');
  const btnBrowseTxt   = document.getElementById('btn-browse-txt');
  const btnTryAgainWm  = document.getElementById('btn-try-again-wm');
  const btnTryAnother  = document.getElementById('btn-try-another');
  // Phase 2: assigned to module-level variables so disableCopyDownload/enableCopyDownload can access them
  btnCopy        = document.getElementById('btn-copy');
  btnDownload    = document.getElementById('btn-download');

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

  dropZone.addEventListener('dragend', () => {
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
      // Phase 2: reset transcription state for next file (Pitfall 6: do NOT reset isWorkerReady)
      transcribeTotal = 0;
      transcribeDone = 0;
      pendingQueue = [];
      modelLoadMaxPct = 0;
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
