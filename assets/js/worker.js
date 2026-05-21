// assets/js/worker.js — Phase 2: Whisper transcription pipeline
// Do NOT modify the message protocol — ui.js depends on it.
//
// ── Message protocol (main thread → worker) ──────────────────────────────────
//   { type: 'transcribe', audioData: Uint8Array, filename: string, index: number, total: number }
//
// ── Message protocol (worker → main thread) ──────────────────────────────────
//   { status: 'result', filename: string, text: string, index: number, total: number }
//   { status: 'error',  filename: string, message: string }
//   { status: 'ready' }
//   { status: 'initiate'|'progress'|'done', file: string, progress: number, loaded: number, total: number }
//     (progress_callback forwarded messages — progress field is 0-100 float)

// ── Part 1: CDN import and env config ────────────────────────────────────────
// Must use CDN URL — Electron renderer cannot load from node_modules without a bundler (Pitfall 1)
// type: module is required in the Worker constructor in ui.js for this import to work
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

env.allowLocalModels = false;

// ── Part 2: WhisperSingleton ──────────────────────────────────────────────────
// Stores the pipeline Promise (not the resolved value) — awaiting the same Promise twice is safe
// and returns the same resolved pipeline, preventing duplicate model downloads.
class WhisperSingleton {
  static instance = null;

  static async getInstance(progress_callback) {
    if (this.instance === null) {
      this.instance = pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-tiny.en',
        { dtype: 'fp32', progress_callback }
        // fp32: avoids MatMulNBits operator in quantized files, incompatible
        // with ORT WASM in @4.2.0 (latest). ~160MB vs ~40MB but reliable.
      );
    }
    return this.instance; // returns the Promise — callers await it
  }
}

// ── Part 3: Eager warm-up (D-01) ─────────────────────────────────────────────
// Model download begins at Worker creation, before user submits a file.
// The 'ready' message fires exactly once per Worker lifetime — do not emit it elsewhere (Pitfall 6).
WhisperSingleton.getInstance((progressData) => {
  self.postMessage(progressData); // forward {status, file, progress, loaded, total} to main thread
}).then(() => {
  self.postMessage({ status: 'ready' }); // emitted exactly once per Worker lifetime
}).catch((err) => {
  console.error('[VoiceFill Worker] Pipeline init failed:', err);
  self.postMessage({ status: 'error', filename: null, message: 'Model failed to load: ' + err.message });
});

// ── Part 4: Message handler ───────────────────────────────────────────────────
// Audio decoding: OfflineAudioContext is not available in Dedicated Web Workers.
// Instead, wrap audioData in a Blob URL so transformers.js can fetch and decode
// it internally via WebCodecs (available in Workers, Chrome 94+).
self.addEventListener('message', async (e) => {
  if (e.data.type !== 'transcribe') return;
  const { audioData, filename, index, total } = e.data;

  let blobUrl = null;
  try {
    // a. Resolve pipeline (resolves immediately from cached Promise after warm-up)
    const transcriber = await WhisperSingleton.getInstance();

    // b. Wrap raw Opus bytes in a Blob URL — transformers.js fetches and decodes internally
    const blob = new Blob([audioData], { type: 'audio/ogg' });
    blobUrl = URL.createObjectURL(blob);

    // c. Transcribe — pipeline handles decode, resample, and inference
    const result = await transcriber(blobUrl);

    // d. Text-based silence gate: empty Whisper output = no speech detected (TRANS-05)
    const text = result.text.trim();
    const output = text === '' ? '[No speech detected]' : text;

    self.postMessage({ status: 'result', filename, text: output, index, total });

  } catch (err) {
    // ERR-02: emit error and continue queue — no re-throw, Worker never crashes
    console.warn('[VoiceFill Worker] Error processing', filename, err);
    self.postMessage({ status: 'error', filename, message: err.message });
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
});
