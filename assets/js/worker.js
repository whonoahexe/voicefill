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

self.addEventListener('message', (e) => {
  if (e.data.type === 'transcribe') {
    // Phase 1 stub: echo back a placeholder result immediately
    self.postMessage({
      status: 'result',
      filename: e.data.filename,
      text: 'transcription pending',
      index: e.data.index,
      total: e.data.total,
    });
  }
});
