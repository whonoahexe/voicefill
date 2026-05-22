// assets/js/worker.js — Phase 2: Whisper transcription pipeline
// Do NOT modify the message protocol — ui.js depends on it.
//
// ── Message protocol (main thread → worker) ──────────────────────────────────
//   { type: 'transcribe', pcmData: Float32Array, filename: string, index: number, total: number }
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
        // ORT WASM in @4.2.0 runs TransposeDQWeightsForMatMulNBits on ALL quantized models (q8/int8/q4)
        // regardless of origin — fp32 is the only dtype that bypasses that pass entirely.
        // whisper-tiny.en fp32 ~150MB vs whisper-base.en fp32 ~290MB — still ~2x smaller and faster.
      );
    }
    return this.instance;
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
// Receives Float32Array at 16kHz decoded on the main thread (OfflineAudioContext
// is unavailable in Workers). Passes { raw, sampling_rate } directly to the
// pipeline — no URL fetch, no AudioContext needed in the Worker.
self.addEventListener('message', async (e) => {
  if (e.data.type !== 'transcribe') return;
  const { pcmData, filename, index, total } = e.data;

  try {
    const transcriber = await WhisperSingleton.getInstance();

    const result = await transcriber(pcmData, {
      sampling_rate: 16000,
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    });

    // Silence gate: TRANS-05 — reject silence and common Whisper hallucinations
    const chunks = result.chunks || [];
    const maxNoSpeech = chunks.length > 0
      ? Math.max(...chunks.map(c => c.no_speech_prob ?? 0))
      : 0;
    const HALLUCINATIONS = /^\[BLANK_AUDIO\]$|^\[Audio unreadable\]$|^♪\s*$|^you\.?$|^Thank you\.?$/i;
    const text = result.text.trim();
    const isSilent = maxNoSpeech > 0.6 || text === '' || HALLUCINATIONS.test(text);
    const output = isSilent ? '[No speech detected]' : text;

    self.postMessage({ status: 'result', filename, text: output, index, total });

  } catch (err) {
    // ERR-02: emit error and continue queue — no re-throw, Worker never crashes
    console.warn('[VoiceFill Worker] Error processing', filename, err);
    self.postMessage({ status: 'error', filename, message: err.message });
  }
});
