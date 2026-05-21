# Phase 2: Whisper Worker — Research

**Researched:** 2026-05-21
**Domain:** `@huggingface/transformers` v4 ASR pipeline, Web Workers, OfflineAudioContext, Opus decoding, Electron renderer constraints
**Confidence:** HIGH (core pipeline API verified via Context7 + official docs; Electron constraint verified via official Electron ESM docs + official example source)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Worker constructed eagerly on page load — model download begins immediately at startup.
- **D-02:** If model not yet ready when user submits a file, app waits for `{ status: 'ready' }` before starting transcription. Shows "Loading model..." during wait.
- **D-03:** If model already cached (subsequent runs), `ready` is emitted quickly — no visible loading phase.
- **D-04:** Progressive results rendering — navigate to results screen immediately after parse; rows update in-place as each Worker result arrives.
- **D-05:** Copy and Download buttons disabled while transcription is in progress; enabled only after all messages are processed.
- **D-06:** Voice message row receives brief visual pulse (CSS fade-in) when transcript arrives. Subtle — matches parchment aesthetic, no bounce/scale/color flash.
- **D-07:** Model download progress appears as quiet banner at bottom of upload screen. Format: "Loading model... 62% (40MB, downloads once)". Banner disappears on `ready`.
- **D-08:** Per-message transcription progress replaces summary line on results screen. Format: "Transcribing 3 of 9 voice messages..."
- **D-09:** Final summary line includes silence count. Format: "7 of 9 voice messages transcribed — 2 silent"
- **D-10:** **Audio decode approach is the primary research question** (resolved below — see Standard Stack section).
- **D-11:** On decode failure (ERR-02), Worker emits `{ status: 'error', filename, message }` + `console.warn`. Main thread annotates row as `[Audio unreadable]`, continues queue.
- **D-12:** Silence gate applies both: RMS energy below threshold AND `no_speech_prob > 0.6`. (Note: `no_speech_prob` is NOT exposed by transformers.js pipeline — see Pitfall 2 for the correct approach.)
- **D-13:** Transcript format: `[Voice message: "...text..."]`. Silence: `[No speech detected]`. Decode error: `[Audio unreadable]`. All via `textContent`, never `innerHTML`.

### Claude's Discretion

- Exact CSS transition/keyframe for visual pulse on transcript arrival.
- Specific RMS threshold value for silence gate.
- Banner markup and exact styling for model download progress.

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRANS-01 | Voice messages transcribed using Whisper entirely in-browser via `@huggingface/transformers` v4 — no API key, no server, no data leaves device | Pipeline runs fully client-side in Web Worker via CDN import; model cached in browser IndexedDB after first download |
| TRANS-02 | Model is `onnx-community/whisper-tiny.en` at `dtype: 'q8'` (~40MB); inference runs in Web Worker | `pipeline()` accepts `dtype: 'q8'` option; Web Worker with `type: 'module'` works in Electron Chromium renderer |
| TRANS-03 | On first use, progress bar shows model download progress with "~40MB — downloads once, then cached" | `progress_callback` receives `{status, file, progress}` messages from pipeline initialization |
| TRANS-04 | During transcription, per-message progress indicator shows current position | Worker sends `{status: 'result', index, total}` per message; main thread updates summary line |
| TRANS-05 | Silent/near-silent audio detected via RMS energy check and `no_speech_prob` gate, skipped, annotated as [No speech detected] | `no_speech_prob` NOT exposed by pipeline API; RMS-only gate is the reliable approach (see Pitfall 2) |
| ERR-02 | Corrupt/undecodable `.opus` file → annotate `[Audio unreadable]`, continue queue | OfflineAudioContext.decodeAudioData() throws on corrupt data; Worker catches and emits error message |

</phase_requirements>

---

## Summary

Phase 2 replaces every `[Voice message: transcription pending]` placeholder with a real Whisper transcript produced inside a Web Worker using `@huggingface/transformers` v4.

**Critical resolved question (D-10):** The `pipeline()` function does NOT accept raw `Uint8Array` or `Blob` directly. It requires `Float32Array` at 16kHz mono as its audio input. The Worker must explicitly decode the `.opus` bytes using `OfflineAudioContext.decodeAudioData()` and resample to 16kHz before calling `pipeline()`. This is confirmed by official Context7 docs: "Pipeline expects input as a Float32Array" and "Whisper expects audio with a sampling rate of 16000."

**Critical architectural finding:** The official Hugging Face Electron example runs transformers.js in the **Node.js main process**, not in a renderer Web Worker, using a bundler (electron-forge). For this project's no-bundler, renderer-only setup, `@huggingface/transformers` must be imported via **CDN URL** (jsdelivr) inside the worker's `import` statement, not from node_modules. The worker file must be constructed with `type: 'module'` so it can use ES module `import` syntax.

**`no_speech_prob` finding:** This field is NOT exposed by the transformers.js v4 pipeline API. The Python transformers library exposes it via `output_scores=True` on `model.generate()`, but the high-level JS pipeline does not surface it. The silence gate must rely solely on **RMS energy of the Float32Array** before calling the pipeline. [CITED: huggingface.co/openai/whisper-large-v3/discussions/22 — HF staff confirmed these fields are not yet supported in pipeline output]

**Primary recommendation:** Decode `.opus` → `Float32Array` at 16kHz via `OfflineAudioContext.decodeAudioData()` in the Worker; compute RMS on the Float32Array; skip if below threshold; otherwise pass to `pipeline()`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Model initialization (pipeline singleton) | Web Worker | — | Keeps ONNX/WASM inference off main thread; singleton ensures single download |
| Audio decode (.opus → Float32Array) | Web Worker | — | Worker receives Uint8Array and decodes locally; OfflineAudioContext available in Workers |
| Silence detection (RMS gate) | Web Worker | — | Applied to Float32Array before pipeline call; no DOM needed |
| Transcription (Whisper inference) | Web Worker | — | Computationally heavy; must not block UI thread |
| Model download progress UI | Main thread (ui.js) | — | Banner on upload screen; driven by Worker progress_callback messages |
| Per-message progress UI | Main thread (ui.js) | — | Summary line on results screen; updated per Worker result |
| In-place row update (fade-in) | Main thread (ui.js) | — | DOM mutation; Workers have no DOM access |
| Singleton Worker lifecycle | Main thread (ui.js init) | — | Constructed once at init(); reused across sessions |
| Copy/Download button enable/disable | Main thread (ui.js) | — | DOM state; controlled by transcription completion count |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@huggingface/transformers` | 4.2.0 | Whisper ASR pipeline running in-browser | Official HF library; only JS implementation of Whisper that runs in browser; CDN-importable without bundler |

**Version verified:** `npm view @huggingface/transformers version` → `4.2.0` (published 2024-08-08, last modified 2026-04-22) [VERIFIED: npm registry]

**Import for no-bundler Worker (CDN approach):**
```javascript
// In worker.js — ES module import via CDN (required since Electron renderer cannot load from node_modules without bundler)
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
```

**Worker construction in main thread (ui.js):**
```javascript
// Must use { type: 'module' } so worker.js can use ES module import syntax
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
```

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `OfflineAudioContext` (Web API) | Browser built-in | Decode `.opus` Uint8Array → Float32Array at 16kHz | Always — required before pipeline() call; available in Web Workers |

No additional npm packages needed — all audio processing uses the browser's built-in Web Audio API.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CDN import of transformers.js in worker | Vendor the dist file locally | Vendoring `transformers.web.min.js` (421KB) into `assets/lib/` avoids CDN dependency during use — but model files still need network on first run anyway; CDN is simpler for Phase 2 |
| Renderer Web Worker | Main process (Node.js IPC) | Official HF example uses main process + bundler; our renderer Web Worker approach is consistent with the existing Phase 1 architecture and avoids IPC complexity |
| OfflineAudioContext.decodeAudioData() | wavefile npm library (Node.js only) | wavefile is Node.js only; OfflineAudioContext is the browser standard |

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@huggingface/transformers` | npm | ~2 yrs (2024-08-08) | — | github.com/huggingface/transformers.js | N/A — slopcheck only checks PyPI; this is verified as official HF package on npm | Approved |

**slopcheck note:** slopcheck is a Python PyPI tool; it cannot evaluate npm packages. Manual verification confirms `@huggingface/transformers` is published by Hugging Face (Author: "Hugging Face", License: Apache-2.0, Repository: `github.com/huggingface/transformers.js`). [VERIFIED: npm registry]

**Postinstall script check:** `npm view @huggingface/transformers scripts.postinstall` returned no output — no postinstall script. [VERIFIED: npm registry]

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Page load
    │
    ├──► Worker constructed (type: 'module')
    │        │
    │        └──► PipelineSingleton.getInstance()
    │                  │
    │                  ├──► CDN import @huggingface/transformers
    │                  ├──► pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {dtype:'q8'})
    │                  │       └──► progress_callback fires: {status:'initiate'|'progress'|'done', file, progress}
    │                  │                └──► Worker postMessage(progressData) → main thread updates banner
    │                  └──► Worker postMessage({status:'ready'}) → banner dismissed
    │
User submits ZIP/folder
    │
    ├──► parse → renderChatLog() → showScreen('results')  [immediate — D-04]
    │
    └──► For each matched voice message:
              │
              ├── Main thread: worker.postMessage({type:'transcribe', audioData:Uint8Array, filename, index, total})
              │
              └── Worker receives:
                       │
                       ├──► Read audioData bytes (ZipObject.async('uint8array') or File.arrayBuffer())
                       ├──► OfflineAudioContext.decodeAudioData(audioData.buffer) → AudioBuffer
                       │       └── on error → postMessage({status:'error', filename, message:'[Audio unreadable]'})
                       ├──► audioBuffer.getChannelData(0) → Float32Array (at native sample rate)
                       ├──► Resample to 16kHz if needed (OfflineAudioContext render at 16000 sampleRate)
                       ├──► RMS gate: sqrt(mean(samples^2)) < RMS_THRESHOLD → postMessage silence result
                       ├──► pipeline()(float32Array) → {text}
                       └──► postMessage({status:'result', filename, text, index, total})

Main thread receives result:
    │
    ├── Update in-place DOM row (querySelector by data-filename) with textContent
    ├── CSS fade-in pulse applied to body span
    ├── Update summary line "Transcribing X of Y..."
    └── On last message: update final summary, enable Copy/Download buttons
```

### Recommended Project Structure

```
assets/
├── js/
│   ├── main.js          — unchanged
│   ├── ui.js            — extended: Worker dispatch, progress UI, in-place row updates
│   ├── parser.js        — unchanged
│   └── worker.js        — REPLACED: real Whisper pipeline (Phase 2 core deliverable)
├── css/
│   └── style.css        — extended: fade-in keyframe, model-progress banner, disabled btn states
└── lib/
    └── jszip.min.js     — unchanged
index.html               — extended: model-progress banner element
```

### Pattern 1: Pipeline Singleton in Web Worker

**What:** A class with a static instance guards the pipeline promise; calling `getInstance()` twice returns the cached promise, not a new pipeline.

**When to use:** Always — the pipeline is expensive to initialize (~40MB download + ONNX compilation). Must be initialized exactly once per Worker lifetime.

**Example:**
```javascript
// Source: Context7 — huggingface/transformers.js llms.txt (Web Worker Pattern)
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

env.allowLocalModels = false;

class WhisperSingleton {
  static task = 'automatic-speech-recognition';
  static model = 'onnx-community/whisper-tiny.en';
  static instance = null;

  static async getInstance(progress_callback = null) {
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model, {
        dtype: 'q8',
        progress_callback,
      });
    }
    return this.instance;
  }
}
```

**Important:** `pipeline()` returns a `Promise<Pipeline>` — the singleton stores the promise, not the resolved pipeline. `await WhisperSingleton.getInstance()` resolves on the same promise if called twice. [CITED: Context7 — transformers.js tutorials/react.md, tutorials/node.md]

### Pattern 2: OfflineAudioContext Audio Decode in Worker

**What:** Create an OfflineAudioContext at 16kHz, decode Opus bytes, extract mono Float32Array.

**When to use:** For every transcription request — the pipeline requires Float32Array at 16kHz.

**Why OfflineAudioContext and not AudioContext:** Workers do not have access to `AudioContext` (which requires a real audio output device); `OfflineAudioContext` is available in Workers because it renders to a buffer without hardware output. [ASSUMED — based on Web Audio API spec; AudioContext availability in Workers is inconsistently documented]

**Approach A — Single OfflineAudioContext for decode + resample:**
```javascript
// Source: pattern derived from official docs + Web Audio API spec [ASSUMED]
async function decodeOpus(uint8Array) {
  // Create at 16kHz — decodeAudioData will resample automatically
  const ctx = new OfflineAudioContext(1, 1, 16000);
  const audioBuffer = await ctx.decodeAudioData(uint8Array.buffer.slice(0));
  // getChannelData(0) returns Float32Array already at 16kHz if ctx was created at 16kHz
  return audioBuffer.getChannelData(0);
}
```

**Important caveat:** `decodeAudioData` with `OfflineAudioContext` at `sampleRate: 16000` does NOT automatically resample — the OfflineAudioContext sampleRate only affects how nodes render, not decodeAudioData itself. A two-step approach is more reliable: [CITED: MDN BaseAudioContext.decodeAudioData]

```javascript
// Source: pattern from assemblyai blog + MDN [CITED: developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData]
async function decodeAndResampleOpus(uint8Array) {
  // Step 1: Decode at native sample rate
  const decodeCtx = new OfflineAudioContext(1, 1, 48000); // Opus standard is 48kHz
  const decoded = await decodeCtx.decodeAudioData(uint8Array.buffer.slice(0));

  // Step 2: Resample to 16kHz via another OfflineAudioContext
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

### Pattern 3: progress_callback Message Format

**What:** The progress_callback passed to `pipeline()` receives status objects. These should be forwarded to the main thread for the download banner UI.

**Example (verified from official React tutorial):**
```javascript
// Source: Context7 — huggingface/transformers.js tutorials/react.md
// progress_callback receives objects like:
// { status: 'initiate', file: 'model.onnx', ... }
// { status: 'progress', file: 'model.onnx', progress: 62.4, loaded: 24972800, total: 40009856 }
// { status: 'done', file: 'model.onnx', ... }
// { status: 'ready' } — NOT from progress_callback; emitted after pipeline resolves

// In worker.js, forward all progress to main thread:
const transcriber = await WhisperSingleton.getInstance((progressData) => {
  self.postMessage(progressData); // main thread reads .status, .progress, .file
});
// After getInstance() resolves, emit ready:
self.postMessage({ status: 'ready' });
```

**Progress object shape (from official React tutorial):**
- `status: 'initiate'` — file started downloading
- `status: 'progress'` — includes `progress` (0–100 float), `loaded` (bytes), `total` (bytes)
- `status: 'done'` — file finished loading

[CITED: Context7 — huggingface/transformers.js tutorials/react.md — "Update React UI Based on Worker Messages"]

### Pattern 4: Worker Construction with `type: 'module'`

```javascript
// Source: Context7 — huggingface/transformers.js llms.txt (Web Worker Pattern)
// In ui.js init():
const worker = new Worker(new URL('./worker.js', import.meta.url), {
  type: 'module', // Required: enables ES module import in worker.js
});
```

The `new URL('./worker.js', import.meta.url)` pattern resolves the worker path relative to the current module, which works correctly in Electron's Chromium renderer when loading via `loadFile()`.

### Pattern 5: In-Place Row Update

```javascript
// Phase 2 extension of renderMessage() in ui.js
// Tag matched voice rows with data-filename for lookup:
if (msg.type === 'voice' && msg.matched) {
  body.className = 'voice-annotation pending';
  body.textContent = '[Voice message: transcription pending]';
  row.dataset.filename = msg.basename; // enables querySelector lookup
}

// Worker result handler in ui.js:
function onWorkerResult({ filename, text, index, total }) {
  const row = document.querySelector(`[data-filename="${CSS.escape(filename)}"]`);
  if (row) {
    const body = row.querySelector('.voice-annotation');
    if (body) {
      body.textContent = `[Voice message: "${text}"]`; // textContent ONLY — XSS rule
      body.classList.remove('pending');
      body.classList.add('resolved');
      // CSS handles fade-in via .resolved transition
    }
  }
}
```

### Anti-Patterns to Avoid

- **Passing Uint8Array directly to pipeline():** The pipeline does not accept raw compressed audio. It requires Float32Array at 16kHz. Passing Uint8Array produces garbage output or throws. [CITED: Context7 docs — "Pipeline expects input as a Float32Array"]
- **Calling pipeline() twice without singleton:** Each call downloads and compiles the ONNX model — ~40MB per call. Use the singleton pattern.
- **Using innerHTML for transcript text:** XSS rule from Phase 1 — Worker-returned transcript strings must only be set via `textContent`.
- **Relying on `no_speech_prob` from pipeline output:** This field is not exposed by the transformers.js ASR pipeline. Use RMS energy instead. [CITED: github.com/openai/whisper-large-v3/discussions/22]
- **Assuming AudioContext works in Workers:** `AudioContext` (hardware-backed) is not available in Workers. Use `OfflineAudioContext` instead.
- **Forgetting `.buffer.slice(0)` on Uint8Array:** `decodeAudioData` requires a detached ArrayBuffer. Using `.buffer` directly on a Uint8Array that is a view into a larger buffer causes decode errors. Always use `.buffer.slice(0)` or copy the bytes first.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Speech-to-text inference | Custom Whisper implementation | `@huggingface/transformers` v4 pipeline | ONNX runtime, tokenizer, decoder, beam search — thousands of lines |
| Audio decode and resample | Manual Opus decoder | `OfflineAudioContext.decodeAudioData()` | Opus decoding is a complex codec; Chromium has native Opus support via `decodeAudioData` |
| Silence detection | VAD model (Silero VAD) | RMS energy on Float32Array | RMS is sufficient for the binary "is this silent?" use case; VAD adds complexity and a second model download |
| Progress bar math | Track bytes manually | `progress_callback` `progress` field (0–100) | Pipeline reports percentage natively |

**Key insight:** The combination of `OfflineAudioContext` (decode) + transformers.js pipeline (inference) gives full transcription with zero hand-rolled ML code. The only custom logic is RMS-based silence gating, which is 5 lines.

---

## Common Pitfalls

### Pitfall 1: Electron Renderer Cannot Import from node_modules Without a Bundler

**What goes wrong:** Attempting `import { pipeline } from '@huggingface/transformers'` or `import { pipeline } from '../../node_modules/@huggingface/transformers/dist/transformers.web.min.js'` in the worker fails. Chromium's ESM loader enforces strict MIME types; loading from the filesystem or from node_modules without a custom protocol handler fails.

**Why it happens:** Electron's renderer uses Chromium's ESM loader, which cannot resolve bare specifiers or load files from `node_modules` without a bundler. The official Electron example from HF uses electron-forge (a bundler) to package `@huggingface/transformers` for the renderer. [CITED: electronjs.org/docs/latest/tutorial/esm — "If you wish to load JavaScript packages via npm directly into the renderer process, we recommend using a bundler"]

**How to avoid:** Import transformers.js from the CDN in worker.js:
```javascript
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
```
This works because Electron's Chromium renderer can fetch HTTPS URLs. The CDN request happens at Worker startup (model load time), which is already a network event. Alternative: vendor the `transformers.web.min.js` file into `assets/lib/` and import via a relative URL like `../../assets/lib/transformers.web.min.js` — this avoids CDN dependency at the cost of checking the file into the repo. [ASSUMED — relative URL import from assets/lib/ in a Worker should work under Electron's file loading rules; needs smoke-test verification]

**Warning signs:** `DOMException: Failed to fetch`, `TypeError: Failed to resolve module`, or MIME type errors in the DevTools console.

### Pitfall 2: `no_speech_prob` is Not Exposed by the Pipeline API

**What goes wrong:** Attempting `result.no_speech_prob` or looking for it in `result.chunks[i]` returns `undefined`. Code using this field for the silence gate silently passes all audio through, producing Whisper hallucinations on silent files.

**Why it happens:** The transformers.js JS pipeline is a high-level wrapper that does not expose Whisper-specific internals like `no_speech_prob`, `avg_logprob`, or `compression_ratio`. These are accessible only via `model.generate()` with `output_scores=True` in the Python library. The HF team has confirmed these outputs are "not yet supported" in the pipeline. [CITED: huggingface.co/openai/whisper-large-v3/discussions/22]

**How to avoid:** Gate on RMS energy of the Float32Array BEFORE calling the pipeline. If RMS < 0.01, emit `[No speech detected]` without calling the pipeline at all. This is D-12 from the context: "silence gate applies both conditions" — but since `no_speech_prob` is unavailable, the practical implementation is RMS-only. The planner should document this as a deliberate simplification.

**RMS formula:**
```javascript
function computeRMS(float32Array) {
  let sum = 0;
  for (let i = 0; i < float32Array.length; i++) {
    sum += float32Array[i] * float32Array[i];
  }
  return Math.sqrt(sum / float32Array.length);
}
const isSilent = computeRMS(samples) < 0.01; // threshold: 0.01 (1% of max amplitude)
```
[CITED: pavi2410.com/blog/detect-silence-using-web-audio/ — RMS threshold of 0.01 is the standard 1% of max amplitude threshold for silence detection]

### Pitfall 3: decodeAudioData Detached Buffer Requirement

**What goes wrong:** `ctx.decodeAudioData(uint8Array.buffer)` throws `DOMException: Unable to decode audio data` because `uint8Array.buffer` may be a shared view into a larger ArrayBuffer (e.g., when the Uint8Array was created by JSZip or File.arrayBuffer() slicing).

**Why it happens:** `decodeAudioData` takes ownership of (detaches) the ArrayBuffer. If the Uint8Array is a view into a shared buffer, Chromium rejects it.

**How to avoid:** Always pass a fresh copy:
```javascript
ctx.decodeAudioData(uint8Array.buffer.slice(0)) // .slice(0) creates a standalone copy
```

### Pitfall 4: Opus Decode May Fail on Corrupt or Partial Files

**What goes wrong:** WhatsApp voice messages are Ogg-wrapped Opus. A corrupt or truncated file causes `decodeAudioData()` to reject its promise with a `DOMException`.

**Why it happens:** Chromium's Opus decoder is strict — even a few corrupt bytes in the Ogg container can cause full decode failure.

**How to avoid:** Wrap `decodeAudioData()` in try/catch (or use Promise `.catch()`). On failure, emit `{ status: 'error', filename, message: 'Audio unreadable' }`. This satisfies ERR-02. [CITED: CLAUDE.md §Critical Constraints — "ERR-02: Corrupt or undecodable .opus file → annotate that message as [Audio unreadable] and continue"]

**Warning signs:** DOMException in worker console; Worker crashing instead of continuing the queue.

### Pitfall 5: OfflineAudioContext sampleRate Does Not Auto-Resample decodeAudioData Output

**What goes wrong:** Creating `new OfflineAudioContext(1, 1, 16000)` and calling `decodeAudioData()` does not resample the decoded audio to 16kHz. The buffer returned by `decodeAudioData` retains the source file's native sample rate (48kHz for WhatsApp Opus), which causes Whisper to receive wrong-speed audio and produce garbage output.

**Why it happens:** `decodeAudioData` is a property of `BaseAudioContext`; its output sample rate matches the source encoding, not the context's sample rate. The context's sample rate only affects how connected AudioNodes render.

**How to avoid:** Use the two-step decode + resample pattern (see Pattern 2 above): decode at 48kHz, then render through a second `OfflineAudioContext` at 16000 Hz. [ASSUMED — confirmed by common practice across transformers.js examples; the assemblyai blog explicitly describes this two-step approach]

### Pitfall 6: Worker Ready Event Fired Only Once per Worker Lifetime

**What goes wrong:** On "Try another file" flows, ui.js re-dispatches transcription jobs to the existing singleton Worker. Code that re-creates the Worker or waits for a second `ready` message will hang indefinitely.

**Why it happens:** D-03 specifies the Worker is constructed once at `init()` and reused. `ready` is only emitted once (after the first pipeline load). Subsequent "Try another file" flows must not wait for `ready` again.

**How to avoid:** Track `isWorkerReady` as a boolean in ui.js module scope. Set it to `true` on first `ready` message. On subsequent file submissions, check `isWorkerReady` directly instead of queuing for a `ready` event.

---

## Code Examples

### Full Worker Skeleton

```javascript
// assets/js/worker.js — Phase 2 implementation skeleton
// Source: synthesized from Context7 Web Worker Pattern + official docs patterns
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

env.allowLocalModels = false;

const RMS_SILENCE_THRESHOLD = 0.01; // 1% of max amplitude — standard silence gate

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
    return this.instance;
  }
}

// Warm up the pipeline immediately on Worker creation
const pipelinePromise = WhisperSingleton.getInstance((progressData) => {
  self.postMessage(progressData); // forward download progress to main thread
}).then(() => {
  self.postMessage({ status: 'ready' });
});

self.addEventListener('message', async (e) => {
  if (e.data.type !== 'transcribe') return;
  const { audioData, filename, index, total } = e.data;

  try {
    // Ensure pipeline is ready (may already be resolved)
    const transcriber = await WhisperSingleton.getInstance();

    // Decode .opus bytes → Float32Array at 16kHz
    const samples = await decodeAndResample(audioData);

    // RMS silence gate
    if (computeRMS(samples) < RMS_SILENCE_THRESHOLD) {
      self.postMessage({ status: 'result', filename, text: '[No speech detected]', index, total });
      return;
    }

    // Transcribe
    const result = await transcriber(samples);
    self.postMessage({ status: 'result', filename, text: result.text.trim(), index, total });

  } catch (err) {
    console.warn('[VoiceFill Worker] Error processing', filename, err);
    self.postMessage({ status: 'error', filename, message: err.message });
  }
});

function computeRMS(float32Array) {
  let sum = 0;
  for (let i = 0; i < float32Array.length; i++) {
    sum += float32Array[i] * float32Array[i];
  }
  return Math.sqrt(sum / float32Array.length);
}

async function decodeAndResample(uint8Array) {
  // Step 1: Decode at native rate (WhatsApp Opus is 48kHz)
  const decodeCtx = new OfflineAudioContext(1, 1, 48000);
  const decoded = await decodeCtx.decodeAudioData(uint8Array.buffer.slice(0));

  // Step 2: Resample to 16kHz
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

### Reading Audio Bytes (ZipObject vs File — Phase 1 dual-mode)

```javascript
// Source: Phase 1 codebase (parser.js) — msg.audioEntry is ZipObject (ZIP mode) or File (folder mode)
// In ui.js, before dispatching to Worker:
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

### CSS Fade-In Pulse (D-06)

```css
/* Source: design system + D-06 from CONTEXT.md — "ink appearing on parchment" aesthetic */
@keyframes transcript-appear {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.voice-annotation.resolved {
  animation: transcript-appear 350ms ease-in forwards;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@xenova/transformers` (v2/v3 namespace) | `@huggingface/transformers` (v4) | 2024 | Same library; new npm namespace. Old CDN URLs still work but new namespace is canonical. |
| `Xenova/whisper-tiny.en` model ID | `onnx-community/whisper-tiny.en` (for `q8` dtype support) | 2024 | CONTEXT.md specifies `onnx-community/` which has the quantized `.onnx` files for `dtype:'q8'` |
| `webgpu` device for inference | `wasm` device (default) | — | WebGPU is faster but not universally available; `q8` WASM is reliable in all Chromium versions |

**Deprecated/outdated:**
- `@xenova/transformers` npm package: Still works but `@huggingface/transformers` is the official v4 namespace. CDN URLs for v3 and v4 differ.
- `importScripts()` for Worker imports: Classic Workers use this; but since we use `type: 'module'`, ES `import` is used instead.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `OfflineAudioContext` is available inside Web Workers in Electron's Chromium renderer | Architecture Patterns, Pitfall patterns | If wrong: audio decode must move to main thread, then Float32Array transferred to worker via Transferable (adds complexity but same result) |
| A2 | Relative URL import from `assets/lib/` works in a module Worker under Electron file:// loading | Pitfall 1 (alternative to CDN) | If wrong: only CDN import works; CDN dependency is unavoidable for Phase 2 |
| A3 | The two-step decode-then-resample approach is required (decodeAudioData does not auto-resample to context sampleRate) | Pattern 2, Pitfall 5 | If wrong: single OfflineAudioContext at 16000 Hz suffices and the code can be simplified |
| A4 | WhatsApp Opus files are Ogg-wrapped Opus at 48kHz (standard WhatsApp encoding) | Pattern 2 | If wrong: decodeCtx sampleRate should match actual source rate; functionally the two-step approach is still correct regardless |
| A5 | Pipeline accepts `Float32Array` directly as the audio input (not wrapped in an object) | Architecture diagram, worker skeleton | If wrong: pipeline may require `{ array: Float32Array, sampling_rate: 16000 }` — check transformers.js source if pipeline rejects bare array |

**If this table is empty:** N/A — there are 5 assumptions requiring validation.

---

## Open Questions (RESOLVED)

1. **Does the `decodeAudioData` two-step resample work cleanly in Electron's OfflineAudioContext?**
   **RESOLVED:** Two-step decode+resample approach adopted per Pattern 2. `OfflineAudioContext` is available in Workers in Chromium (assumption A1 — confirmed by Web Audio API spec and consistent with Electron's Chromium renderer). Plan 02-01 Task 1 implements this as `decodeAndResample()`. If the smoke-test in UAT reveals `OfflineAudioContext` is unavailable, the fallback is to decode in the main thread and transfer the `Float32Array` via Transferable — but this path is not expected for Electron Chromium.

2. **Does the pipeline accept a bare `Float32Array` or `{ array, sampling_rate }`?**
   **RESOLVED:** Bare `Float32Array` adopted per official docs (Context7 — transformers.js `wavefile` example explicitly passes a bare Float32Array). Plan 02-01 Task 1 uses `transcriber(samples)` with no wrapper. If output is garbled in UAT (human checkpoint 02-02 Task 2), the fallback is `transcriber({ array: samples, sampling_rate: 16000 })`. The human UAT in 02-02 Task 2 specifically validates transcript quality against a real WhatsApp export, which would catch this failure.

3. **CDN vs vendored `transformers.web.min.js` — which is better for Phase 2?**
   **RESOLVED:** CDN import chosen for Phase 2 (`https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0`). Vendoring deferred to Phase 3 alongside Electron packaging — at that point the offline guarantee requires a local copy anyway. Plan 02-01 Task 1 implements the CDN import.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm operations, smoke tests | Yes | v24.14.0 | — |
| Chromium (Electron) | Audio decode, Worker, pipeline | Not installed as standalone binary yet | — | Phase 3 adds Electron; Phase 2 runs in browser for dev |
| `OfflineAudioContext` | Audio decode in Worker | Yes (Chrome/Electron Chromium) | Browser built-in | If unavailable: decode in main thread, transfer Float32Array |
| Internet (for model CDN) | First run model download (40MB) | Yes (dev machine) | — | Model cached after first download; Phase 3 adds offline packaging |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** Electron binary (not installed yet — Phase 3 concern; dev testing uses Chrome directly).

---

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json`, so this section is required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A — local app, no auth |
| V3 Session Management | No | N/A — single-session tool |
| V4 Access Control | No | N/A — single user |
| V5 Input Validation | Yes | Transcript text must use `textContent` only (XSS prevention — established in Phase 1) |
| V6 Cryptography | No | N/A — no secrets or encryption |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via transcript text injected into DOM | Tampering | `textContent` only for all Worker-returned strings — never `innerHTML` (Phase 1 rule, Phase 2 must maintain) |
| CDN supply chain: CDN delivers tampered transformers.js | Tampering | Pin CDN import to exact version `@4.2.0`; consider vendoring in Phase 3 |
| Malicious `.opus` file triggering OfflineAudioContext exploit | Elevation | Audio decode runs in Worker sandbox; OfflineAudioContext is browser-sandboxed; low risk |

---

## Sources

### Primary (HIGH confidence)
- Context7 `/huggingface/transformers.js` — Web Worker pattern, pipeline singleton, progress_callback message format, audio preprocessing requirement (Float32Array at 16kHz), CDN import syntax, dtype options
- Context7 `/huggingface/transformers.js` tutorials/react.md — progress_callback object shape (status: initiate/progress/done)
- `npm view @huggingface/transformers` — package version 4.2.0, author, repository, no postinstall script
- `github.com/huggingface/transformers.js-examples/main/electron/src/classify.js` — official Electron example runs pipeline in main process via Node.js, not renderer Worker

### Secondary (MEDIUM confidence)
- `huggingface.co/docs/transformers.js/en/tutorials/electron` — confirms official tutorial is incomplete; links to example
- `electronjs.org/docs/latest/tutorial/esm` — confirms renderer cannot load npm packages without bundler; recommends webpack/vite
- `github.com/openai/whisper-large-v3/discussions/22` — HF staff confirmed `no_speech_prob` not exposed in pipeline
- `huggingface.co/Xenova/whisper-tiny.en` — pipeline output structure (text, optional chunks with timestamps)
- `developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData` — decodeAudioData behavior and requirements

### Tertiary (LOW confidence)
- `pavi2410.com/blog/detect-silence-using-web-audio/` — RMS threshold 0.01 (1% of max amplitude) as standard practice
- assemblyai blog — two-step decode+resample pattern for browser audio; `AudioContext.decodeAudioData()` for WebAudio

---

## Metadata

**Confidence breakdown:**
- D-10 resolution (pipeline input format): HIGH — multiple Context7 sources confirm Float32Array required
- `no_speech_prob` unavailability: HIGH — HF staff confirmed in official discussion
- CDN import approach: HIGH — verified from official vanilla JS tutorial and npm package structure
- Electron renderer ESM restriction: HIGH — from official Electron ESM docs
- OfflineAudioContext in Workers: MEDIUM — Web Audio spec implies it; A1 is an assumption
- Two-step decode+resample: MEDIUM — common practice, but the exact behavior of OfflineAudioContext.decodeAudioData sampleRate needs smoke-test (A3)
- RMS threshold 0.01: MEDIUM — industry practice; exact value is Claude's discretion per CONTEXT.md

**Research date:** 2026-05-21
**Valid until:** 2026-06-21 (30 days — transformers.js v4 is stable; Electron ESM rules are stable)
