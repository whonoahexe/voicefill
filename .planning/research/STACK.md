# Stack Research — VoiceFill

**Researched:** 2026-05-21
**Overall confidence:** HIGH (core choices verified against official transformers.js v4 docs)

---

## Recommended Stack

| Layer | Library | Version | Import |
|-------|---------|---------|--------|
| Speech-to-text | @huggingface/transformers | 4.0.1 | `https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1` |
| Whisper model | onnx-community/whisper-tiny.en | — | loaded by pipeline() |
| ZIP parsing | JSZip | 3.x | `https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js` |
| Audio decoding | Web Audio API (built-in) | — | `new AudioContext()` |
| Concurrency | Web Workers API (built-in) | — | `new Worker('./worker.js', { type: 'module' })` |
| UI | Vanilla HTML/CSS/JS | — | no build pipeline |

**Decision summary:** transformers.js v4 + WASM backend is the only viable all-browser, zero-server, zero-build-pipeline path. Everything else (whisper.cpp/WASM, sherpa-onnx) requires a build step, a local binary, or lacks the Hugging Face ecosystem's model caching and pipeline abstraction that makes this tractable in a single HTML file.

---

## In-Browser Whisper Options

### Option 1: @huggingface/transformers (ONNX Runtime Web) — RECOMMENDED

**Confidence:** HIGH — verified against official docs

- **How it works:** Converts OpenAI Whisper to ONNX format, runs via ONNX Runtime Web in the browser. Two backends available: WASM (universal CPU) and WebGPU (GPU-accelerated, ~70% browser support as of late 2024).
- **Pipeline API:**
  ```js
  import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1';

  // WASM / CPU (universal, no COOP/COEP headers needed)
  const transcriber = await pipeline(
    'automatic-speech-recognition',
    'onnx-community/whisper-tiny.en'
  );

  // WebGPU (faster on supported browsers)
  const transcriber = await pipeline(
    'automatic-speech-recognition',
    'onnx-community/whisper-tiny.en',
    { device: 'webgpu' }
  );
  ```
- **Model caching:** Uses browser Cache API after first download. Subsequent loads are instant. `env.useBrowserCache` defaults to `true`.
- **Quantization:** `dtype` option supports `fp32`, `fp16`, `q8`, `q4`. Whisper encoder is noted in official docs as "extremely sensitive to quantization" — use per-module dtypes for best accuracy/size balance (see Model Size section).
- **Maturity for Whisper specifically:** ASR task is marked fully supported. Official docs demonstrate Whisper in multiple examples including WebGPU. The `onnx-community/whisper-tiny.en` model is the featured example in WebGPU guides. Highly mature.
- **No-build-pipeline compatibility:** YES. CDN ES module import works directly in `<script type="module">`.
- **Vanilla JS Web Worker pattern:** YES, officially recommended and documented. Pipeline singleton in worker, `postMessage` to/from main thread.

### Option 2: whisper.cpp compiled to WASM — NOT RECOMMENDED for this project

**Confidence:** MEDIUM (training data + ecosystem knowledge; not verified against live whisper.cpp WASM docs)

- **How it works:** whisper.cpp is a C++ implementation of Whisper. It can be compiled to WASM via Emscripten. Hugging Face hosts a browser demo at whisper.cpp.
- **Why impractical here:**
  - Requires a build step (Emscripten toolchain, CMake) — violates the no-build-pipeline constraint.
  - No off-the-shelf CDN import; you compile your own WASM binary.
  - Significantly more setup: manual audio resampling to 16kHz PCM float32 before passing to the model.
  - Multi-threaded mode requires SharedArrayBuffer + COOP/COEP headers, which block `file://` protocol usage.
  - The transformers.js abstraction handles all preprocessing (resampling, mel spectrogram) automatically; whisper.cpp in WASM does not.
- **When it would make sense:** Embedding in an Electron app where you control headers, or targeting peak single-model performance with no pipeline overhead.

### Option 3: sherpa-onnx-wasm — NOT RECOMMENDED

**Confidence:** LOW (training data only; not verified against current official docs)

- **What it is:** k2-fsa/sherpa-onnx compiled to WASM, with a different model ecosystem (Kaldi-style models, not OpenAI Whisper).
- **Why not for this project:**
  - Different model format — not the Whisper weights the project targets.
  - Lower community adoption for browser use cases compared to transformers.js.
  - Less documentation and fewer examples for vanilla JS no-build usage.
  - The ONNX Runtime Web backend used by transformers.js already provides the same underlying runtime.

### Option 4: Web Speech API (browser built-in) — NOT RECOMMENDED

**Confidence:** HIGH — well-known limitation

- **What it is:** `SpeechRecognition` API built into Chrome/Edge.
- **Why not:** Sends audio to Google's servers — directly violates the privacy-first constraint. No Safari support. No offline capability. Not controllable.

---

## Model Size Tradeoffs

All sizes below are approximate ONNX quantized weights. Whisper is an encoder-decoder model; both parts are downloaded.

| Model | Approx. download (q8 default) | WER on English | Recommendation |
|-------|-------------------------------|----------------|----------------|
| whisper-tiny.en | ~39 MB | Higher error rate | Start here: fast, fits constraint |
| whisper-base.en | ~74 MB | Noticeably better | Good balance if accuracy matters |
| whisper-small.en | ~244 MB | Strong accuracy | Too large for first-load UX |

**Recommendation:** Start with `onnx-community/whisper-tiny.en` at default `q8` dtype. The `.en` suffix means English-only weights — smaller and faster than multilingual variants. If transcription quality is poor on real WhatsApp voice messages, upgrade to `whisper-base.en`. The project has explicitly ruled out multi-language support in v1, making `.en` variants correct.

**Per-module dtype for Whisper (verified from official docs):** The encoder is sensitive to quantization. If accuracy is poor at `q4`, use:
```js
// Per-module: keep encoder at q8, compress decoder at q4
const transcriber = await pipeline(
  'automatic-speech-recognition',
  'onnx-community/whisper-tiny.en',
  {
    dtype: {
      encoder_model: 'q8',
      decoder_model_merged: 'q4',
    }
  }
);
```

---

## Supporting Libraries

### ZIP Parsing: JSZip

**Confidence:** HIGH (JSZip is the de facto standard for browser ZIP parsing)

- Import: `https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js` (or `jszip.min.js` from unpkg)
- No build pipeline required; ships a UMD build usable as a plain `<script>` or ES module.
- API pattern for WhatsApp export:
  ```js
  const zip = await JSZip.loadAsync(file); // file = File from <input type="file">
  const chatTxt = await zip.file('_chat.txt').async('string');
  const audioFile = await zip.file('00000001-AUDIO-2024-01-15.opus').async('arraybuffer');
  ```
- Handles large ZIPs (WhatsApp exports can be several hundred MB with many audio files) via streaming-capable async API.
- Alternative: The native `DecompressionStream` API (Chrome 80+, Firefox 113+) can decompress gzip/deflate but does NOT natively parse ZIP container format (only individual stream decompression). JSZip remains necessary.

### Audio Decoding: Web Audio API (AudioContext)

**Confidence:** HIGH — well-established web platform API

- **Opus decoding support:** Chrome, Firefox, and Edge all support `.opus` files via `AudioContext.decodeAudioData()`. Safari has supported Opus in WebM containers since Safari 16.4 (released March 2023). WhatsApp `.opus` files use the Ogg container.
- **Ogg/Opus specifically:** Chrome and Firefox decode Ogg/Opus natively. Safari's Opus support is in WebM container; Ogg/Opus support in Safari is less consistent — this is a known gap. Confirmed workaround: use an Opus-to-PCM decoder library (e.g., `libopus.wasm` or `ogg-opus-decoder`) as fallback for Safari.
- **Usage pattern:**
  ```js
  const audioCtx = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await audioCtx.decodeAudioData(opusArrayBuffer);
  const float32 = audioBuffer.getChannelData(0); // mono, 16kHz float32
  // Pass float32 directly to transcriber()
  ```
- transformers.js `pipeline('automatic-speech-recognition')` accepts `Float32Array` directly — no further resampling needed if you set `sampleRate: 16000` in AudioContext.

### Web Workers: Built-in Browser API

**Confidence:** HIGH

- Required to keep the UI responsive during model download (~39 MB for tiny) and inference (several seconds per audio clip on CPU/WASM).
- transformers.js works inside Web Workers without modification. The singleton pattern (lazy pipeline initialization) is the official recommendation.
- Pattern:
  ```js
  // worker.js
  import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1';

  let transcriber = null;

  self.addEventListener('message', async (e) => {
    if (!transcriber) {
      transcriber = await pipeline(
        'automatic-speech-recognition',
        'onnx-community/whisper-tiny.en',
        { progress_callback: (p) => self.postMessage({ type: 'progress', data: p }) }
      );
    }
    const result = await transcriber(e.data.audio);
    self.postMessage({ type: 'result', text: result.text });
  });
  ```
- `type: 'module'` is required in the Worker constructor to use ES module imports from the CDN:
  ```js
  const worker = new Worker('./worker.js', { type: 'module' });
  ```

---

## Browser Compatibility

### WASM (CPU backend) — Universal

| Feature | Chrome | Firefox | Safari |
|---------|--------|---------|--------|
| WASM execution | Full | Full | Full |
| SharedArrayBuffer (multi-threaded WASM) | Requires COOP+COEP headers | Requires COOP+COEP headers | Requires COOP+COEP headers |
| Single-threaded WASM (no SAB) | Works | Works | Works |
| ES module Workers | 80+ | 114+ | 15+ |

**Critical:** SharedArrayBuffer requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` HTTP headers. These headers cannot be set when serving via `file://` protocol. **However**, ONNX Runtime Web's WASM backend runs single-threaded without SharedArrayBuffer — it just falls back to the non-threaded WASM binary. transformers.js handles this fallback automatically. Single-threaded WASM is slower but works on `file://` and any static server without special headers.

**Implication for VoiceFill:** The tool works opened directly as `file://index.html` in Chrome or Firefox. Model inference will be single-threaded WASM on CPU. For a personal tool transcribing short voice messages (typically 10–60 seconds), this is acceptable.

### WebGPU (GPU backend) — Optional enhancement

| Browser | Status |
|---------|--------|
| Chrome 113+ | Stable |
| Edge 113+ | Stable |
| Firefox | Behind flag (`dom.webgpu.enabled`) |
| Safari | Behind flag (Technology Preview) |

WebGPU provides 2–5x faster inference but is not universally available. Treat as an optional upgrade path, not a baseline requirement.

### Opus decoding

| Browser | Ogg/Opus support |
|---------|-----------------|
| Chrome | Full |
| Firefox | Full |
| Safari 16.4+ | Partial (WebM/Opus confirmed; Ogg/Opus container uncertain) |

For v1 targeting personal use on desktop Chrome/Firefox, Ogg/Opus decoding via AudioContext is reliable.

---

## What NOT to Use and Why

### No build pipeline (Webpack, Vite, Rollup, esbuild)

The project constraint is explicit: static HTML/JS/CSS, no build step. CDN imports via `<script type="module">` satisfy this. Build tools would add mandatory Node.js toolchain setup and negate the "open as a file" deployment model.

### No Whisper API (OpenAI, Groq, AssemblyAI, Deepgram)

Violates the core privacy constraint. Audio leaves the device. Also requires an API key, payment, and network dependency.

### No whisper.cpp WASM compiled manually

Build step required (Emscripten). No CDN distribution. Manual audio preprocessing pipeline. The transformers.js abstraction eliminates all of this at no meaningful accuracy cost.

### No React/Vue/Svelte framework

This is a single-page personal tool. Adding a framework adds CDN weight, potential hydration complexity, and build step dependencies. Vanilla JS DOM manipulation is sufficient and aligns with the no-build constraint.

### No IndexedDB for model storage

transformers.js already uses the browser Cache API for model file caching — this is built-in and requires no additional code. Do not re-implement caching on top of it.

### Do not use Xenova/whisper-* model IDs (v2 naming)

The v3/v4 convention uses `onnx-community/whisper-*` IDs. The official WebGPU examples in current docs reference `onnx-community/whisper-tiny.en`. The older `Xenova/whisper-tiny` IDs still work but represent the v2-era naming. Use `onnx-community/` for current ONNX files compatible with transformers.js v4's dtype and per-module quantization features.

---

## Open Questions

### 1. Opus decoding on Safari

WhatsApp exports `.opus` files in Ogg container. Safari's AudioContext support for Ogg/Opus (as opposed to WebM/Opus) needs live browser testing to confirm. If it fails, a fallback Opus WASM decoder (e.g., `ogg-opus-decoder` on npm/CDN) would be needed. This is low priority for v1 given the personal-use desktop target.

### 2. Exact download size of onnx-community/whisper-tiny.en at q8

The ONNX Community model page shows "8 quantized variants" but does not list file sizes inline. The encoder + decoder together at q8 default is estimated ~39 MB based on original model parameters (39M weights). Live testing will reveal actual cached size via browser DevTools Network tab. Need to validate this is within acceptable first-load tolerance.

### 3. Single-threaded WASM inference speed on whisper-tiny for typical WhatsApp voice messages

WhatsApp voice messages typically run 10–90 seconds. Single-threaded WASM inference for whisper-tiny is estimated 1–3x real-time on modern laptop CPUs (i.e., a 30-second clip could take 30–90 seconds). This is acceptable for a batch-processing personal tool but should be measured with real audio before committing to tiny vs. base.

### 4. transformers.js v4 pipeline accepts raw Float32Array from AudioContext

The pipeline documentation shows URL inputs and mentions Float32Array support, but the exact API for passing in-memory audio (from `audioCtx.decodeAudioData`) versus URL-based audio needs a quick code test. If Float32Array is not directly accepted, an intermediate Blob URL (`URL.createObjectURL`) step can bridge the gap.

### 5. WhatsApp "without media" export mode

WhatsApp exports in two modes: "with media" (audio files included) and "without media" (`<Media omitted>` placeholder). The research question for the build phase: is there a way to match `<Media omitted>` lines to actual audio files if the user provides them separately? Or does v1 require the "with media" export mode exclusively? This is a feature scoping question, not a stack question.

---

## Sources

- transformers.js official docs: https://huggingface.co/docs/transformers.js/index
- Pipeline API reference: https://huggingface.co/docs/transformers.js/pipelines#tasks
- Quantization/dtypes guide: https://huggingface.co/docs/transformers.js/guides/dtypes
- WebGPU guide: https://huggingface.co/docs/transformers.js/guides/webgpu
- Custom usage / env settings: https://huggingface.co/docs/transformers.js/custom_usage
- Vanilla JS tutorial: https://huggingface.co/docs/transformers.js/tutorials/vanilla-js
- Installation / CDN import: https://huggingface.co/docs/transformers.js/installation
- onnx-community/whisper-tiny.en model page: https://huggingface.co/onnx-community/whisper-tiny.en
- SharedArrayBuffer security requirements: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements
- AudioContext MDN: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext
