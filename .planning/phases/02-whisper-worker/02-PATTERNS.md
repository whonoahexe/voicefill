# Phase 2: Whisper Worker - Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** 4 (2 replaced/extended, 2 minor extensions)
**Analogs found:** 4 / 4

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `assets/js/worker.js` | worker (Web Worker) | event-driven, streaming | `assets/js/worker.js` (stub) + RESEARCH.md skeleton | stub-to-impl (same file) |
| `assets/js/ui.js` | state machine / orchestrator | event-driven, request-response | `assets/js/ui.js` (existing, extend in place) | same-file extension |
| `assets/css/style.css` | styles | transform | `assets/css/style.css` (existing, extend) | same-file extension |
| `index.html` | markup | — | `index.html` (existing, extend) | same-file extension |

---

## Pattern Assignments

### `assets/js/worker.js` (worker, event-driven → streaming results)

**Analog:** `assets/js/worker.js` stub (lines 1-28) for message protocol; RESEARCH.md §Code Examples for body.

**Fixed message protocol — DO NOT CHANGE** (stub, lines 5-15):
```javascript
// Main thread → Worker
{ type: 'transcribe', audioData: Uint8Array, filename: string, index: number, total: number }

// Worker → Main thread
{ status: 'result',  filename: string, text: string, index: number, total: number }
{ status: 'error',   filename: string, message: string }
{ status: 'ready' }
// Plus progress_callback forwarded messages:
{ status: 'initiate'|'progress'|'done', file: string, progress: number, loaded: number, total: number }
```

**Imports pattern** (CDN — Pitfall 1 in RESEARCH.md: cannot use node_modules without bundler):
```javascript
// Top of worker.js — must be first line of ES module worker
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

env.allowLocalModels = false;
```

**Core pattern — Pipeline Singleton** (RESEARCH.md §Pattern 1):
```javascript
const RMS_SILENCE_THRESHOLD = 0.01; // 1% of max amplitude (pavi2410 blog standard)

class WhisperSingleton {
  static instance = null;

  static async getInstance(progress_callback) {
    if (this.instance === null) {
      this.instance = pipeline(
        'automatic-speech-recognition',
        'onnx-community/whisper-tiny.en',
        { dtype: 'q8', progress_callback }
      );
    }
    return this.instance; // returns the Promise — callers await it
  }
}
```

**Eager warm-up on Worker creation** (RESEARCH.md §Pattern 3, D-01):
```javascript
// Runs immediately when Worker script is loaded — kicks off model download
WhisperSingleton.getInstance((progressData) => {
  self.postMessage(progressData); // forward {status, file, progress, loaded, total} to main thread
}).then(() => {
  self.postMessage({ status: 'ready' }); // emitted exactly once per Worker lifetime
});
```

**Message handler — transcribe event** (stub line 17 pattern, extended):
```javascript
self.addEventListener('message', async (e) => {
  if (e.data.type !== 'transcribe') return;
  const { audioData, filename, index, total } = e.data;

  try {
    const transcriber = await WhisperSingleton.getInstance(); // resolves immediately if cached
    const samples = await decodeAndResample(audioData);       // Float32Array at 16kHz

    if (computeRMS(samples) < RMS_SILENCE_THRESHOLD) {
      self.postMessage({ status: 'result', filename, text: '[No speech detected]', index, total });
      return;
    }

    const result = await transcriber(samples);
    self.postMessage({ status: 'result', filename, text: result.text.trim(), index, total });

  } catch (err) {
    console.warn('[VoiceFill Worker] Error processing', filename, err); // D-11
    self.postMessage({ status: 'error', filename, message: err.message });
  }
});
```

**Audio decode helper — two-step decode + resample** (RESEARCH.md §Pattern 2, Pitfall 5):
```javascript
// Step 1 at 48kHz (WhatsApp Opus native rate), Step 2 resample to 16kHz for Whisper.
// OfflineAudioContext.decodeAudioData does NOT auto-resample to context sampleRate (Pitfall 5).
// Always use .buffer.slice(0) — decodeAudioData detaches the buffer (Pitfall 3).
async function decodeAndResample(uint8Array) {
  const decodeCtx = new OfflineAudioContext(1, 1, 48000);
  const decoded = await decodeCtx.decodeAudioData(uint8Array.buffer.slice(0));

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
```

**RMS silence gate** (RESEARCH.md §Pitfall 2):
```javascript
// Applied BEFORE calling pipeline — no_speech_prob is not exposed by transformers.js API.
function computeRMS(float32Array) {
  let sum = 0;
  for (let i = 0; i < float32Array.length; i++) {
    sum += float32Array[i] * float32Array[i];
  }
  return Math.sqrt(sum / float32Array.length);
}
```

**Error handling pattern** (wraps entire transcribe handler body):
```javascript
// Pattern: single try/catch around the entire job. On decode failure (ERR-02), on pipeline
// failure — emit { status: 'error' } and continue. Worker never crashes the queue.
try {
  // ... decode, gate, transcribe ...
} catch (err) {
  console.warn('[VoiceFill Worker] Error processing', filename, err);
  self.postMessage({ status: 'error', filename, message: err.message });
  // no re-throw — queue continues to next message
}
```

---

### `assets/js/ui.js` (state machine / orchestrator, event-driven)

**Analog:** `assets/js/ui.js` (existing file, in-place extension)

**Module-level state additions** (after existing `let currentPlainText = null;` at line 17):
```javascript
// New module-level state for Phase 2
let worker = null;           // singleton Worker instance
let isWorkerReady = false;   // true after first 'ready' message (Pitfall 6)
let pendingQueue = [];       // jobs buffered while Worker is still loading
let transcribeTotal = 0;     // voice messages to transcribe in this session
let transcribeDone = 0;      // completed (result OR error) count
```

**Worker construction in `init()`** (RESEARCH.md §Pattern 4, D-01):
```javascript
// Must use { type: 'module' } — worker.js uses ES module import syntax
// Constructed eagerly at init() time — model download begins immediately on app open
worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

worker.addEventListener('message', onWorkerMessage);
```

**Worker message handler** (drives all progress UI per D-02..D-09):
```javascript
function onWorkerMessage(e) {
  const data = e.data;

  if (data.status === 'ready') {
    // D-03: hide model-download banner; mark ready; flush any buffered jobs
    isWorkerReady = true;
    hideBanner();
    for (const job of pendingQueue) worker.postMessage(job, [job.audioData.buffer]);
    pendingQueue = [];
    return;
  }

  if (data.status === 'progress') {
    // D-07: update model download banner
    updateBanner(data);
    return;
  }

  if (data.status === 'initiate' || data.status === 'done') {
    return; // progress_callback noise — no UI update needed
  }

  if (data.status === 'result' || data.status === 'error') {
    transcribeDone++;
    updateRowInPlace(data);                        // D-04 / D-06: fade-in update
    updateSummaryLine(transcribeDone, transcribeTotal); // D-08 / D-09
    if (transcribeDone === transcribeTotal) {
      enableCopyDownload();                        // D-05: enable after all done
    }
  }
}
```

**`renderMessage()` extension — data-filename tag** (ui.js lines 70-73, RESEARCH.md §Pattern 5):
```javascript
// Existing block (ui.js line 70–73) — ADD dataset.filename:
if (msg.type === 'voice' && msg.matched) {
  body.className = 'voice-annotation pending';
  body.textContent = '[Voice message: transcription pending]';
  row.dataset.filename = msg.basename; // enables querySelector lookup by Worker result handler
}
```

**In-place row update — `updateRowInPlace()`** (RESEARCH.md §Pattern 5, D-06, D-13):
```javascript
// textContent ONLY — XSS rule from Phase 1 (T-03-01 in ui.js line 63, 66, 81)
function updateRowInPlace(data) {
  const row = document.querySelector(`[data-filename="${CSS.escape(data.filename)}"]`);
  if (!row) return;
  const body = row.querySelector('.voice-annotation');
  if (!body) return;

  if (data.status === 'error') {
    body.textContent = '[Audio unreadable]'; // D-13 / ERR-02
    body.classList.remove('pending');
    body.classList.add('error');
  } else {
    const text = data.text === '[No speech detected]'
      ? '[No speech detected]'                      // D-13 silence annotation
      : `[Voice message: "${data.text}"]`;          // D-13 / OUT-01 transcript format
    body.textContent = text; // textContent ONLY — never innerHTML
    body.classList.remove('pending');
    body.classList.add('resolved'); // CSS handles fade-in via .resolved animation (D-06)
  }
}
```

**Summary line update — `updateSummaryLine()`** (D-08, D-09):
```javascript
function updateSummaryLine(done, total) {
  const summaryEl = document.getElementById('summary-line');
  if (!summaryEl) return;

  if (done < total) {
    // D-08: in-progress format
    summaryEl.textContent = `Transcribing ${done} of ${total} voice messages...`;
  } else {
    // D-09: final summary with silence count
    const allRows = document.querySelectorAll('[data-filename]');
    let silentCount = 0;
    allRows.forEach(row => {
      const body = row.querySelector('.voice-annotation');
      if (body && body.textContent === '[No speech detected]') silentCount++;
    });
    const transcribed = total - silentCount;
    summaryEl.textContent = `${transcribed} of ${total} voice messages transcribed — ${silentCount} silent`;
  }
}
```

**Worker dispatch — audio byte extraction** (RESEARCH.md §Reading Audio Bytes, CONTEXT.md §Integration Points):
```javascript
// audioEntry is ZipObject (ZIP mode) or File (folder mode) — both patterns from parser.js
async function getAudioBytes(audioEntry) {
  if (audioEntry instanceof File) {
    const buf = await audioEntry.arrayBuffer();
    return new Uint8Array(buf);
  } else {
    // ZipObject (JSZip) — async('uint8array') returns Uint8Array directly
    return await audioEntry.async('uint8array');
  }
}
```

**`processFile()` / `processFolder()` extension** (ui.js lines 217-219, parallel to existing pattern):
```javascript
// AFTER existing renderChatLog(result) + showScreen('results') calls,
// ADD transcription dispatch for matched voice messages:
const voiceMessages = result.messages.filter(m => m.type === 'voice' && m.matched);
transcribeTotal = voiceMessages.length;
transcribeDone = 0;

if (transcribeTotal === 0) {
  enableCopyDownload(); // nothing to transcribe — enable buttons immediately
} else {
  disableCopyDownload(); // D-05: disable until all done
  updateSummaryLine(0, transcribeTotal); // set initial "Transcribing 0 of N..."

  for (let i = 0; i < voiceMessages.length; i++) {
    const msg = voiceMessages[i];
    const audioData = await getAudioBytes(msg.audioEntry);
    const job = { type: 'transcribe', audioData, filename: msg.basename, index: i + 1, total: transcribeTotal };

    if (isWorkerReady) {
      worker.postMessage(job, [audioData.buffer]); // Transferable: avoids copy
    } else {
      pendingQueue.push(job); // D-02: buffer until 'ready' fires
    }
  }
}
```

**"Try another file" reset extension** (ui.js lines 390-397, existing `btnTryAnother` handler):
```javascript
// ADD to existing btnTryAnother click handler after clearing chat-log:
transcribeTotal = 0;
transcribeDone = 0;
pendingQueue = [];
// Note: isWorkerReady stays true — Worker is singleton, 'ready' fires only once (Pitfall 6)
```

**`enableCopyDownload()` / `disableCopyDownload()` helpers** (D-05):
```javascript
// Follows existing pattern: btn references resolved at init() time
function disableCopyDownload() {
  if (btnCopy)     { btnCopy.disabled = true;     btnCopy.style.opacity = '0.4'; }
  if (btnDownload) { btnDownload.disabled = true;  btnDownload.style.opacity = '0.4'; }
}

function enableCopyDownload() {
  if (btnCopy)     { btnCopy.disabled = false;     btnCopy.style.opacity = ''; }
  if (btnDownload) { btnDownload.disabled = false;  btnDownload.style.opacity = ''; }
}
```

**Model download banner — `updateBanner()` / `hideBanner()`** (D-07):
```javascript
// Banner element resolved at init() time: const modelBanner = document.getElementById('model-banner');
function updateBanner(progressData) {
  if (!modelBanner) return;
  const pct = progressData.progress != null ? Math.round(progressData.progress) : null;
  modelBanner.style.display = 'block';
  // textContent ONLY — progress values are numbers from library, but follow the rule
  modelBanner.textContent = pct != null
    ? `Loading model... ${pct}% (40MB, downloads once)`
    : 'Loading model...';
}

function hideBanner() {
  if (!modelBanner) return;
  modelBanner.style.display = 'none';
}
```

**Error handling pattern** (mirrors existing processFile/processFolder try/catch structure, ui.js lines 199-207):
```javascript
// Pattern already established: try/catch wraps async operations; errors show inline message.
// Worker errors (status: 'error') are NOT parse errors — handle in onWorkerMessage,
// not in the processFile try/catch. processFile error handling is unchanged.
```

---

### `assets/css/style.css` (styles, extend in place)

**Analog:** `assets/css/style.css` (existing file)

**Existing animation pattern to copy** (style.css lines 175-184 — `@keyframes dot-blink`):
```css
/* EXISTING pattern — CSS-only animation for processing dots.
   New keyframe follows the same structure: named, placed with related rules */
@keyframes dot-blink {
  0%, 100% { opacity: 0; }
  50%       { opacity: 1; }
}
```

**New keyframe — transcript fade-in pulse** (D-06, parchment aesthetic — "ink appearing on parchment"):
```css
/* Add near the Voice Annotation section (after line 333) */
@keyframes transcript-appear {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.voice-annotation.resolved {
  animation: transcript-appear 350ms ease-in forwards;
  opacity: 1; /* final state explicit for browsers that don't respect forwards fill */
  font-style: normal; /* resolved transcripts are not italic — distinguish from pending/error */
}

.voice-annotation.pending {
  font-style: italic;
  opacity: 0.6; /* matches existing .voice-annotation base style */
}
```

**Model download banner** (D-07 — "footnote, not a status bar"):
```css
/* Add after #screen-upload rules */
#model-banner {
  display: none; /* hidden by default; shown by JS when progress arrives */
  font-size: 12px;
  opacity: 0.6;
  margin-top: 16px;
  font-style: italic;
  text-align: center;
}
```

**Disabled button state** (D-05 — complements existing .btn-primary / .btn-secondary):
```css
/* Add after existing .btn-primary:active rule (line 104) */
.btn-primary:disabled,
#btn-copy:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-secondary:disabled,
#btn-download:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

---

### `index.html` (markup, minor extension)

**Analog:** `index.html` (existing file)

**Existing screen element pattern** (index.html lines 14-36 — upload screen structure):
```html
<!-- Pattern: each screen is a <main> with id="screen-*"; style="display:none" hides inactive screens -->
<main id="screen-upload">
  ...content...
</main>
```

**New model download banner element** (D-07 — added inside `#screen-upload`, after the fine-print block):
```html
<!-- After the existing fine-print paragraphs in #screen-upload, before closing </main> -->
<!-- Banner is hidden by default (display:none in CSS); shown by JS on progress_callback -->
<p id="model-banner"></p>
```

**No new screens** — Phase 2 uses existing `#screen-results` for progressive updates. The only HTML change is the banner `<p>` element.

---

## Shared Patterns

### textContent-only rule (XSS prevention)
**Source:** `assets/js/ui.js` lines 63, 66, 81 — multiple explicit comments `// NEVER innerHTML`
**Apply to:** ALL text produced by Worker results (`updateRowInPlace`), banner text (`updateBanner`), summary line (`updateSummaryLine`), and any new DOM writes in Phase 2.
```javascript
// Pattern from ui.js line 63:
ts.textContent = msg.timestamp; // NEVER innerHTML — user data (T-03-01)
// All Worker-returned strings (transcript text, error messages) must follow same rule
body.textContent = `[Voice message: "${data.text}"]`; // textContent ONLY
```

### Module-level state pattern
**Source:** `assets/js/ui.js` line 17
**Apply to:** All new session state variables in Phase 2 (`worker`, `isWorkerReady`, `pendingQueue`, `transcribeTotal`, `transcribeDone`).
```javascript
// Existing pattern (ui.js line 17):
let currentPlainText = null;

// Follow same pattern for new state:
let worker = null;
let isWorkerReady = false;
// etc.
```

### Button reference resolution at `init()` time
**Source:** `assets/js/ui.js` lines 294-301 — all button `const` declarations at top of `init()`
**Apply to:** `modelBanner`, `btnCopy`, `btnDownload` references needed by new Phase 2 helpers.
```javascript
// Pattern: resolve DOM elements once at init(); store in variables used by handler functions
const btnCopy     = document.getElementById('btn-copy');
const btnDownload = document.getElementById('btn-download');
// New in Phase 2:
const modelBanner = document.getElementById('model-banner');
```

### 300ms minimum display guard (DO NOT apply to transcription phase)
**Source:** `assets/js/ui.js` lines 208-211
**Apply to:** Parse step ONLY (already implemented). Transcription live-updates on `#screen-results` need no minimum delay — they are incremental DOM mutations, not screen transitions.
```javascript
// Existing guard (DO NOT replicate for transcription):
const elapsed = Date.now() - start;
if (elapsed < 300) {
  await new Promise(r => setTimeout(r, 300 - elapsed));
}
```

### CSS animation conventions
**Source:** `assets/css/style.css` lines 175-184
**Apply to:** New `@keyframes transcript-appear` for D-06.
- Named `@keyframes` blocks grouped with the rule that uses them
- No bouncing, scaling, or color flash — opacity transitions only (matches existing `dot-blink`)
- Duration 300–500ms (existing `transition: background-color 80ms` for micro-interactions; 350ms for content fade-in per CONTEXT.md §Specific Ideas)

---

## No Analog Found

All files have strong analogs in the codebase (same-file extensions or verified research patterns).

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | No gaps — all patterns covered by existing codebase or RESEARCH.md verified examples |

---

## Critical Anti-Patterns (Do Not Repeat)

These are explicit violations flagged in RESEARCH.md — the planner must include them as plan-step guards:

| Anti-Pattern | Where It Surfaces | Prevention |
|---|---|---|
| `innerHTML` for transcript text | `updateRowInPlace()` | `textContent` only — enforced by T-03-01 in Phase 1 |
| `import { pipeline } from '@huggingface/transformers'` (bare specifier) | Top of worker.js | CDN URL import required — Pitfall 1 |
| `uint8Array.buffer` without `.slice(0)` | `decodeAudioData()` call | Always `.buffer.slice(0)` — Pitfall 3 |
| Single `OfflineAudioContext` at 16kHz for decode+resample | `decodeAndResample()` | Two-step: 48kHz decode + 16kHz render — Pitfall 5 |
| `result.no_speech_prob` from pipeline output | silence gate | RMS-only gate — `no_speech_prob` not exposed — Pitfall 2 |
| Waiting for second `{ status: 'ready' }` on "Try another file" | `btnTryAnother` handler | `isWorkerReady` boolean flag — Pitfall 6 |

---

## Metadata

**Analog search scope:** `assets/js/`, `assets/css/`, `index.html` (entire codebase — small project)
**Files read:** worker.js, ui.js, parser.js, main.js, style.css, index.html
**Pattern extraction date:** 2026-05-21
