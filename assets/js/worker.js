// assets/js/worker.js — STUB for Phase 1
// Phase 2 replaces this body with the real Whisper pipeline.
// Do NOT modify the message protocol — ui.js depends on it.
//
// ── Message protocol (main thread → worker) ──────────────────────────────────
//   { type: 'transcribe', audioData: Uint8Array, filename: string, index: number, total: number }
//
// ── Message protocol (worker → main thread) ──────────────────────────────────
//   { status: 'result', filename: string, text: string, index: number, total: number }
//   { status: 'error',  filename: string, message: string }
//   { status: 'ready' }
//
// Phase 1: worker is never constructed by the main parse flow.
// The stub exists to validate the Worker construction path and give Phase 2
// a clear interface to fill in without touching ui.js.

// ── Part 1: CDN import and env config ────────────────────────────────────────
// Must use CDN URL — Electron renderer cannot load from node_modules without a bundler (Pitfall 1)
// type: module is required in the Worker constructor in ui.js for this import to work
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

env.allowLocalModels = false;

// ── Part 2: Silence threshold ─────────────────────────────────────────────────
// 1% of max amplitude — standard silence gate (no_speech_prob not exposed by transformers.js pipeline API)
const RMS_SILENCE_THRESHOLD = 0.01;

// ── Part 3: WhisperSingleton ──────────────────────────────────────────────────
// Stores the pipeline Promise (not the resolved value) — awaiting the same Promise twice is safe
// and returns the same resolved pipeline, preventing duplicate model downloads.
class WhisperSingleton {
  static instance = null;

  static async getInstance(progress_callback) {
    if (this.instance === null) {
      this.instance = pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-tiny.en',
        { progress_callback }
        // dtype omitted — defaults to fp32; Xenova/whisper-tiny.en's q8 files
        // are not consistently available across CDN cache states
      );
    }
    return this.instance; // returns the Promise — callers await it
  }
}

// ── Part 4: Eager warm-up (D-01) ─────────────────────────────────────────────
// Model download begins at Worker creation, before user submits a file.
// The 'ready' message fires exactly once per Worker lifetime — do not emit it anywhere else (Pitfall 6).
WhisperSingleton.getInstance((progressData) => {
  self.postMessage(progressData); // forward {status, file, progress, loaded, total} to main thread
}).then(() => {
  self.postMessage({ status: 'ready' }); // emitted exactly once per Worker lifetime
}).catch((err) => {
  console.error('[VoiceFill Worker] Pipeline init failed:', err);
  self.postMessage({ status: 'error', filename: null, message: 'Model failed to load: ' + err.message });
});

// ── Part 5: Message handler ───────────────────────────────────────────────────
self.addEventListener('message', async (e) => {
  if (e.data.type !== 'transcribe') return;
  const { audioData, filename, index, total } = e.data;

  try {
    // a. Resolve pipeline (resolves immediately from cached Promise after warm-up)
    const transcriber = await WhisperSingleton.getInstance();

    // b. Decode .opus bytes → Float32Array at 16kHz
    const samples = await decodeAndResample(audioData);

    // c. RMS silence gate — applied BEFORE calling pipeline (no_speech_prob unavailable, Pitfall 2)
    if (computeRMS(samples) < RMS_SILENCE_THRESHOLD) {
      self.postMessage({ status: 'result', filename, text: '[No speech detected]', index, total });
      return;
    }

    // d. Transcribe — bare Float32Array, no wrapper object
    const result = await transcriber(samples);

    // e. Return result
    self.postMessage({ status: 'result', filename, text: result.text.trim(), index, total });

  } catch (err) {
    // ERR-02: catch decode failure, pipeline failure — emit error and continue queue (no re-throw)
    console.warn('[VoiceFill Worker] Error processing', filename, err);
    self.postMessage({ status: 'error', filename, message: err.message });
  }
});

// ── Part 6: computeRMS ───────────────────────────────────────────────────────
function computeRMS(float32Array) {
  if (float32Array.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < float32Array.length; i++) {
    sum += float32Array[i] * float32Array[i];
  }
  return Math.sqrt(sum / float32Array.length);
}

// ── Part 7: decodeAndResample ────────────────────────────────────────────────
// Two-step decode + resample. OfflineAudioContext.decodeAudioData does NOT auto-resample
// to the context's sampleRate — two contexts are required (Pitfall 5).
// .buffer.slice(0) is mandatory — decodeAudioData detaches the ArrayBuffer (Pitfall 3).
async function decodeAndResample(uint8Array) {
  // Step 1: Decode at native sample rate (WhatsApp Opus is 48kHz)
  const decodeCtx = new OfflineAudioContext(1, 1, 48000);
  const decoded = await decodeCtx.decodeAudioData(uint8Array.buffer.slice(0));

  // Step 2: Resample to 16kHz (required by Whisper pipeline)
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
