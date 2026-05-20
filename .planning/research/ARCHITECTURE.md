# Architecture Research — VoiceFill

**Researched:** 2026-05-21
**Confidence:** HIGH for transformers.js Worker patterns (official docs verified); MEDIUM for ZIP/opus decoding (well-established browser APIs, confirmed indirectly); MEDIUM for vanilla JS state patterns (established practice, no single official source)

---

## Component Boundaries

Five distinct components. Each has a single owner and communicates through well-defined interfaces.

```
┌─────────────────────────────────────────────────────────────┐
│  Main Thread                                                │
│                                                             │
│  ┌────────────┐   ┌───────────────┐   ┌─────────────────┐  │
│  │  UI Shell  │   │  Parse Engine │   │  Output Renderer│  │
│  │            │   │               │   │                 │  │
│  │ Drop zone  │   │ ZIP → entries │   │ Chat log DOM    │  │
│  │ Progress   │   │ .txt parse    │   │ Copy to clip.   │  │
│  │ Error UI   │   │ Queue builder │   │ Plain text gen  │  │
│  └────────────┘   └───────────────┘   └─────────────────┘  │
│         │                │                                  │
│         └────────────────┴──── postMessage ──────┐          │
│                                                  ▼          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Transcription Worker (worker.js)                      │ │
│  │                                                        │ │
│  │  Singleton pipeline (loaded once, reused per message)  │ │
│  │  Audio decode (AudioContext inside worker)             │ │
│  │  Whisper ASR pipeline                                  │ │
│  │  Progress reporting → postMessage back                 │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Owns | Does Not Own |
|-----------|------|--------------|
| UI Shell | File input, drag-drop, status text, progress bars, error display | Any parsing or inference logic |
| Parse Engine | ZIP extraction, .txt parsing, voice-message detection, queue assembly | Audio decoding, transcription |
| Transcription Worker | Model loading, audio decoding, Whisper inference, per-file progress | DOM, ZIP, chat reconstruction |
| Output Renderer | Chat log display, transcript insertion, copy-to-clipboard | Data acquisition |
| State Store | Single JS object on main thread holding app state | UI rendering (reactive pattern) |

---

## Data Flow

Full pipeline from user input to copyable output:

```
1. USER INPUT
   User drops .zip file (or selects via file input)
   → FileReader / File object available in main thread

2. ZIP EXTRACTION (Parse Engine, main thread)
   JSZip.loadAsync(file) → ZipObject
   Iterate entries → separate:
     - _chat.txt / WhatsApp Chat with *.txt   (the chat log)
     - *.opus files                            (audio files, keyed by filename)
   Result: { chatText: string, audioFiles: Map<filename, Uint8Array> }

3. CHAT PARSING (Parse Engine, main thread)
   Line-by-line parse of chatText
   Detect voice message lines:
     - "[date, time] Author: <Media omitted>"   → no audio match possible
     - "[date, time] Author: 00000023-AUDIO-*.opus (file attached)"  → match by filename
   Build ordered message array:
     [{ type: 'text'|'voice', author, timestamp, content, audioKey? }]
   Build transcription queue: messages where type === 'voice' AND audioKey exists in audioFiles
   Result: { messages: Message[], queue: VoiceMessage[] }

4. WORKER INITIALIZATION (one-time, on first transcription run)
   Main thread: new Worker('worker.js', { type: 'module' })
   Worker: load transformers.js pipeline (singleton pattern)
     → pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
         dtype: 'q8',                     // ~40MB cached
         progress_callback: (x) => self.postMessage(x)
       })
   Worker posts: { status: 'initiate' | 'progress' | 'done' | 'ready' }
   Main thread renders model-loading progress bars per file chunk

5. SEQUENTIAL TRANSCRIPTION (one file at a time)
   Main thread posts to worker:
     { type: 'transcribe', audioData: Uint8Array, filename: string, index: 1, total: 7 }
   
   Worker per message:
     a. Decode audio: AudioContext.decodeAudioData(audioData.buffer)
        → AudioBuffer → getChannelData(0) → Float32Array (PCM, 16kHz resampled)
     b. Run pipeline: transcriber(float32Array, { sampling_rate: 16000 })
        → { text: "hello world" }
     c. Post result: { status: 'result', filename, text, index, total }
   
   Main thread updates State.transcripts[filename] = text
   Main thread updates progress: "Transcribing 3 of 7 voice messages..."

6. REASSEMBLY (main thread, after all transcriptions complete)
   Walk messages array in order
   For each voice message: substitute transcript inline
   Format: "[10/01/2024, 14:23] Alice: [Voice message: hello world]"
   For unmatched <Media omitted> lines: "[Voice message: audio not included in export]"

7. OUTPUT RENDERING (Output Renderer, main thread)
   Render final chat as scrollable pre-formatted text block
   "Copy to clipboard" button → navigator.clipboard.writeText(plainText)
```

---

## Suggested Build Order

Dependencies flow from bottom to top. Build in this order:

### Phase 1: ZIP + Parse (no inference, immediate feedback)
**Goal:** Given a .zip, parse and display the chat log structure without transcribing anything.

1. `zipExtractor.js` — loadAsync, separate chat file from audio files
2. `chatParser.js` — parse WhatsApp .txt format, identify voice lines, build message array
3. `UI Shell` — file drop zone, basic layout, display raw parsed messages with placeholders
4. `outputRenderer.js` — render message list, copy-to-clipboard of partial output

This phase is independently testable. No ML dependency. Validates the WhatsApp format assumptions.

### Phase 2: Worker + Model Loading (inference without queue)
**Goal:** Worker loads Whisper model successfully and reports progress.

5. `worker.js` — singleton pipeline pattern, message listener, progress reporting
6. Model loading UX — per-chunk progress bars, "Model ready" state transition
7. Single-file transcription — send one audio blob, get one result back

This phase validates that opus decoding and Whisper inference work before wiring the queue.

### Phase 3: Queue + Full Pipeline
**Goal:** Process all voice messages in sequence, update chat log as results arrive.

8. Queue manager in main thread — sequential dispatch (not parallel; see Key Decisions)
9. Progress display — "Transcribing N of M voice messages..."
10. Live transcript insertion — update rendered chat as each result arrives

### Phase 4: Error Handling + Polish
**Goal:** Graceful degradation for real-world edge cases.

11. Corrupt audio handling
12. Missing audio file handling (export without media)
13. Output formatting for Claude paste optimization

---

## Key Architectural Decisions

### Decision 1: Single HTML File vs Multi-File Static Site

**Recommendation: Multi-file static site (index.html + worker.js + vendor JS)**

Rationale:

- Workers cannot be created with `new Worker(blob:...)` from inline scripts in all browsers. Chrome blocks it for module workers. Firefox has partial support. The restriction is that `type: 'module'` workers (required by transformers.js ESM imports) cannot reliably be constructed from blob URLs derived from inline script content.
- transformers.js itself must be imported as ESM. A single-file app would need to either (a) bundle transformers.js inline (extremely large, defeats simplicity) or (b) import from CDN, which breaks the "no network after first load" constraint.
- Practical distribution: a zip of 3 files (index.html, worker.js, vendor/transformers.min.js) is nearly as frictionless as a single file. Drag the folder to a local server (VS Code Live Server, python -m http.server). Users doing this level of export/analysis can handle a folder.

**If single-file is truly required later:** Use a Blob URL for the worker with classic (non-module) scripts and bundle transformers.js with a build step. This is achievable but adds complexity that contradicts the no-build-pipeline constraint.

**Decision: Ship as a 3-file static site. Document that `file://` won't work (CORS on WASM); users need a local server or GitHub Pages.**

---

### Decision 2: Web Worker Architecture for Whisper

**Pattern: Singleton pipeline in dedicated worker, main-thread postMessage queue**

The official transformers.js React tutorial (and the vanilla JS tutorial) both demonstrate this exact pattern. It is the canonical approach:

```javascript
// worker.js
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers';

class WhisperPipeline {
  static task = 'automatic-speech-recognition';
  static model = 'onnx-community/whisper-tiny.en';
  static instance = null;

  static async getInstance(progress_callback = null) {
    // Lazy init — only created once
    this.instance ??= pipeline(this.task, this.model, {
      dtype: 'q8',
      progress_callback
    });
    return this.instance;
  }
}

self.addEventListener('message', async (event) => {
  const transcriber = await WhisperPipeline.getInstance((x) => {
    self.postMessage(x); // status: 'initiate' | 'progress' | 'done' | 'ready'
  });

  const { audioData, filename, index, total } = event.data;
  
  // Decode opus → PCM inside worker
  const audioCtx = new AudioContext({ sampleRate: 16000 });
  const decoded = await audioCtx.decodeAudioData(audioData.buffer.slice(0));
  const float32 = decoded.getChannelData(0);

  const result = await transcriber(float32, { sampling_rate: 16000 });
  
  self.postMessage({
    status: 'result',
    filename,
    text: result.text,
    index,
    total
  });
});
```

**Message protocol (main → worker):**
```javascript
{ type: 'transcribe', audioData: Uint8Array, filename: string, index: number, total: number }
```

**Message protocol (worker → main):**
```javascript
// During model load:
{ status: 'initiate', file: string, name: string }
{ status: 'progress', file: string, progress: number }
{ status: 'done', file: string }
{ status: 'ready' }

// Per transcription:
{ status: 'result', filename: string, text: string, index: number, total: number }
{ status: 'error', filename: string, message: string }
```

---

### Decision 3: Sequential vs Parallel Transcription

**Recommendation: Sequential (one file at a time)**

Rationale:
- Whisper inference is CPU-bound via WASM. Running two inferences simultaneously on the same thread contends for the same CPU cores — net throughput is identical, but memory doubles (two model contexts loaded).
- Sequential gives clean progress semantics: "Transcribing 3 of 7" is accurate. Parallel requires tracking concurrent completions which complicates both UX and error recovery.
- The Worker only has one pipeline instance. Sending concurrent messages without a semaphore would cause race conditions on the singleton.
- Sequential dispatch from the main thread is the simplest correct implementation: send message, await `result`, send next.

**Implementation pattern:**
```javascript
// Main thread queue runner
async function runQueue(queue, worker) {
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    await sendAndWait(worker, {
      type: 'transcribe',
      audioData: item.data,
      filename: item.filename,
      index: i + 1,
      total: queue.length
    });
    updateProgress(i + 1, queue.length);
  }
}

function sendAndWait(worker, message) {
  return new Promise((resolve, reject) => {
    const handler = (e) => {
      if (e.data.status === 'result' && e.data.filename === message.filename) {
        worker.removeEventListener('message', handler);
        resolve(e.data);
      } else if (e.data.status === 'error' && e.data.filename === message.filename) {
        worker.removeEventListener('message', handler);
        reject(new Error(e.data.message));
      }
    };
    worker.addEventListener('message', handler);
    worker.postMessage(message);
  });
}
```

---

### Decision 4: Progress Reporting Pattern

**Two distinct progress phases with different UI:**

**Phase A — Model Loading (one-time)**
The transformers.js `progress_callback` fires with `{ status, file, progress }` for each model chunk file being downloaded. Whisper tiny has ~3-5 ONNX files. Show one progress bar per file, or a single aggregate bar.

```javascript
// Aggregate approach: track bytes loaded vs total
const modelFiles = {};
function onModelProgress({ status, file, progress, loaded, total }) {
  if (status === 'progress') {
    modelFiles[file] = { loaded, total };
    const overall = Object.values(modelFiles).reduce(
      (acc, f) => ({ loaded: acc.loaded + f.loaded, total: acc.total + f.total }),
      { loaded: 0, total: 0 }
    );
    updateModelBar(overall.loaded / overall.total * 100);
  }
  if (status === 'ready') showStatus('Model ready');
}
```

**Phase B — Transcription Queue**
Simple counter updated after each `result` message.

```
"Transcribing voice message 3 of 7..."
[███████░░░░░░░░] 43%
```

The status text should name the item type ("voice message") not "file" — the concept the user cares about.

---

### Decision 5: Opus Audio Decoding

**Use Web Audio API (AudioContext.decodeAudioData) inside the Worker**

Opus is natively supported in Chrome, Firefox, and Edge (all Chromium-based). Safari has supported Opus in WebM containers since Safari 16.1 (2022). For a personal-use desktop tool, browser support is not a concern.

Decoding process inside the worker:
```javascript
const audioCtx = new AudioContext({ sampleRate: 16000 });
// Note: slice(0) is required — decodeAudioData detaches the buffer
const decoded = await audioCtx.decodeAudioData(uint8Array.buffer.slice(0));
const float32 = decoded.getChannelData(0); // mono PCM
// If multi-channel, mix down: average channels
```

The `sampleRate: 16000` in AudioContext constructor causes the browser to resample on decode, delivering PCM at exactly the rate Whisper expects. No manual resampling needed.

**Fallback for decode failure:** Catch the `DOMException`, mark the voice message as `[Transcription failed: could not decode audio]`, continue the queue. Do not abort the entire run.

---

### Decision 6: ZIP Extraction Library

**Recommendation: JSZip (CDN, inlined as vendor file)**

JSZip is the most widely used and documented browser ZIP library. API:
```javascript
const zip = await JSZip.loadAsync(file); // accepts File, Blob, ArrayBuffer, Uint8Array
zip.forEach((relativePath, zipEntry) => { /* zipEntry.async('uint8array') */ });
```

**Alternative — fflate:** ~25KB vs JSZip's ~100KB, synchronous API available, better performance. Valid choice if bundle size matters. API is less familiar but well-documented. For a no-build-pipeline project, JSZip's documentation and CDN availability make it the safer starting point.

**Do not use:** The native `DecompressionStream` API — it handles individual gzip/deflate streams, not ZIP archives (ZIP is a different container format).

---

### Decision 7: State Management Without a Framework

**Pattern: Single mutable state object + explicit render calls**

This project has a linear, irreversible flow (input → parse → transcribe → output). It does not need reactive state or component trees. A simple state object with a `render()` function called after each mutation is appropriate and sufficient.

```javascript
const State = {
  phase: 'idle',           // 'idle' | 'parsing' | 'loading-model' | 'transcribing' | 'done' | 'error'
  messages: [],            // parsed message array (all messages, ordered)
  audioFiles: new Map(),   // filename → Uint8Array
  queue: [],               // VoiceMessage[] to transcribe
  transcripts: {},         // filename → transcribed text
  progress: { current: 0, total: 0 },
  modelProgress: {},       // file → { loaded, total }
  error: null
};

function setState(patch) {
  Object.assign(State, patch);
  render(State);
}
```

`render(state)` is a pure function that reads `State` and updates the DOM. Called after every `setState`. No diffing needed — the UI has few moving parts and full re-renders are cheap.

**Avoid:** Event-driven spaghetti where each component reaches into other components. All UI reads from State, all updates go through `setState`.

---

### Decision 8: Model Loading UX and Caching

**transformers.js uses the browser's Cache API automatically** — models are stored in the HTTP cache after first download. No manual IndexedDB management needed. The `pipeline()` call checks cache before downloading.

**First-time UX requirements:**
- Show estimated download size before starting: "Downloading Whisper model (~40MB). This only happens once."
- Show per-file progress (the library provides this via `progress_callback`)
- Make it clear that subsequent runs skip the download

**Cache location:** `transformers.js` stores models in the browser's Cache Storage under a key derived from the model ID and version. Users can clear it via DevTools → Application → Cache Storage. No special handling required.

**Model recommendation:** `onnx-community/whisper-tiny.en` with `dtype: 'q8'`
- Size: ~40MB cached
- English-only: appropriate for v1 scope
- Accuracy: adequate for voice messages (short, conversational speech)
- `dtype: 'q8'` (8-bit quantization): default for WASM, good balance of size/accuracy
- Avoid `dtype: 'q4'`: Whisper encoder is sensitive to aggressive quantization (per official docs on per-module dtypes)

**Per-module dtype for better quality if needed:**
```javascript
pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
  dtype: {
    encoder_model: 'fp32',       // encoder is accuracy-sensitive
    decoder_model_merged: 'q8'   // decoder tolerates quantization
  }
})
```
This adds ~10-20MB but improves transcription quality. Can be offered as an optional "high quality" mode.

---

### Decision 9: Output Format

**Plaintext format optimized for Claude paste:**

```
=== WhatsApp Chat: Alice & Bob ===
Transcribed 6 of 7 voice messages on 2026-05-21

[10/01/2024, 14:22] Alice: Hey are you coming tonight?
[10/01/2024, 14:23] Bob: [Voice message: yeah I'll be there around eight, maybe eight thirty]
[10/01/2024, 14:25] Alice: <Media omitted> [Voice message: audio not in export]
[10/01/2024, 14:26] Bob: Perfect see you then
```

Key formatting choices:
- Voice transcripts inline, bracketed: `[Voice message: ...]` — Claude reads these as part of the conversation flow
- Unmatched `<Media omitted>` lines: explicit annotation so Claude knows context is missing
- Header with count so Claude knows the completeness of the transcript
- No markdown formatting — plain text pastes cleanly into any Claude interface

**Output rendering:** `<pre>` element with overflow scroll, monospace font. The copy button uses `navigator.clipboard.writeText()` — supported in all modern browsers, requires HTTPS or localhost (not `file://`).

---

### Decision 10: Error Handling Strategy

Errors fall into three categories:

| Error Type | Example | Strategy |
|------------|---------|---------|
| Hard abort | ZIP file can't be parsed at all | Show error UI, reset to idle, let user retry |
| Per-item degradation | One .opus file is corrupt | Skip that message with inline annotation, continue queue |
| Soft warning | Export has `<Media omitted>` lines (no audio in zip) | Annotate those lines, note count in output header |

**Do not abort the entire run on per-file decode failure.** Users with 20 voice messages should not lose 19 good transcripts because one file is corrupt. Mark the failed item inline and continue.

**Per-item error annotation:**
```
[10/01/2024, 14:23] Bob: [Voice message: transcription failed — audio could not be decoded]
```

**Worker crash:** If the Worker itself terminates unexpectedly, main thread `worker.onerror` fires. Restart the worker, reload the pipeline (user pays the ~2-3s reinit cost but not the full model re-download), retry from the last failed item.

---

## WhatsApp Format Notes (Implementation Detail)

Two export modes produce different text patterns:

**Export "without media":**
```
[10/01/2024, 14:23] Bob: <Media omitted>
```
No audio file in the zip. These lines cannot be transcribed. Annotate them in output.

**Export "with media":**
```
[10/01/2024, 14:23] Bob: 00000023-AUDIO-2024-01-15-14-23-00.opus (file attached)
```
Audio file present in zip root with matching filename. Match by filename string.

The parser must handle both patterns. The chat .txt file is always named `_chat.txt` or `WhatsApp Chat with [Name].txt` at the zip root. Audio files are always at the zip root (not in subdirectories).

**Regex for voice message detection:**
```javascript
// With media
const AUDIO_LINE = /^(\[.+?\]) (.+?): (.+\.opus) \(file attached\)$/;
// Without media  
const MEDIA_OMITTED = /^(\[.+?\]) (.+?): <Media omitted>$/;
```

---

## Sources

- transformers.js pipeline API: https://huggingface.co/docs/transformers.js/en/pipelines (HIGH confidence — official docs)
- transformers.js Web Worker pattern: https://huggingface.co/docs/transformers.js/en/tutorials/react (HIGH confidence — official tutorial)
- transformers.js quantization/dtypes: https://huggingface.co/docs/transformers.js/en/guides/dtypes (HIGH confidence — official docs, includes Whisper encoder sensitivity note)
- AudioContext.decodeAudioData: MDN Web Docs (MEDIUM confidence — standard Web API, opus support confirmed as standard codec)
- WhatsApp export format patterns: derived from PROJECT.md descriptions and known format documentation (MEDIUM confidence — validate during Phase 1 build)
