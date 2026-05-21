---
phase: 02-whisper-worker
plan: 01
subsystem: whisper-worker
tags: [whisper, worker, audio-decode, transcription, progressive-ui]
dependency_graph:
  requires: [01-03]
  provides: [whisper-pipeline, worker-lifecycle, in-place-results]
  affects: [assets/js/worker.js, assets/js/ui.js, index.html]
tech_stack:
  added:
    - "@huggingface/transformers@4.2.0 (CDN import in worker.js)"
    - "OfflineAudioContext (Web API, built-in)"
  patterns:
    - "Pipeline singleton storing Promise (not resolved value) for single-download guarantee"
    - "Two-step OfflineAudioContext decode+resample (48kHz→16kHz)"
    - "Transferable ArrayBuffer for zero-copy Worker postMessage"
    - "isWorkerReady boolean + pendingQueue for ready-gate buffering"
    - "CSS.escape for safe data-filename querySelector lookup"
key_files:
  created: []
  modified:
    - assets/js/worker.js
    - assets/js/ui.js
    - index.html
decisions:
  - "CDN import chosen over vendoring for Phase 2; vendoring deferred to Phase 3 Electron packaging"
  - "RMS-only silence gate (no_speech_prob not exposed by transformers.js pipeline API)"
  - "Bare Float32Array passed to pipeline() with no wrapper object"
  - "btnCopy/btnDownload promoted to module scope to allow disableCopyDownload/enableCopyDownload access"
metrics:
  duration: "~12m"
  completed: "2026-05-21"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 2 Plan 1: Whisper Worker Pipeline Summary

**One-liner:** Complete Whisper ASR pipeline via @huggingface/transformers@4.2.0 CDN import in a module Worker, with two-step OfflineAudioContext decode+resample, RMS silence gate, and progressive in-place DOM updates driven by a pending-queue / isWorkerReady lifecycle.

## What Was Built

### Task 1: worker.js — Complete Whisper Pipeline

Replaced the Phase 1 stub entirely. The new worker.js implements:

- **CDN import** of `@huggingface/transformers@4.2.0` via jsdelivr (required for Electron renderer without bundler)
- **WhisperSingleton** class storing the pipeline Promise — `getInstance()` called twice returns the same Promise, preventing duplicate 40MB model downloads
- **Eager warm-up** at Worker module load time — model download begins immediately when the app opens (D-01)
- **progress_callback forwarding** — `initiate`/`progress`/`done` messages forwarded to main thread for banner UI; `ready` emitted exactly once after pipeline resolves (Pitfall 6)
- **Two-step audio decode+resample** via `OfflineAudioContext`: Step 1 decodes at 48kHz (WhatsApp Opus native rate), Step 2 renders through a 16kHz context to produce the Float32Array Whisper expects (Pitfall 5)
- **`.buffer.slice(0)` guard** — prevents `decodeAudioData` from throwing on Uint8Arrays that are views into larger shared buffers (Pitfall 3)
- **RMS silence gate** with threshold `0.01` (1% of max amplitude) — applied before pipeline call since `no_speech_prob` is not exposed by the transformers.js API (Pitfall 2, TRANS-05)
- **Per-job try/catch** — Worker never crashes; decode/pipeline failures emit `{ status: 'error' }` and queue continues (ERR-02, D-11)

### Task 2: ui.js + index.html — Worker Lifecycle and Progressive UI

Extended `ui.js` with a complete Worker lifecycle and progressive result handler:

- **Module-level state** added: `worker`, `isWorkerReady`, `pendingQueue`, `transcribeTotal`, `transcribeDone`, `modelBanner`, `btnCopy`, `btnDownload`
- **Worker construction** in `init()` with `{ type: 'module' }` — mandatory for ES module import in worker.js
- **`renderMessage()`** extended to tag matched voice rows with `row.dataset.filename = msg.basename` and apply `'voice-annotation pending'` class
- **`onWorkerMessage()`** — routes: `ready`→drain queue+hide banner; `progress`→update banner; `result`/`error`→update row+summary+maybe enable buttons
- **`updateRowInPlace()`** — CSS.escape-safe querySelector; sets text via `textContent` only (T-02-01); applies `resolved`/`error` class for CSS fade-in (D-06)
- **`updateSummaryLine()`** — in-progress: "Transcribing N of M..."; final: "X of M voice messages transcribed — Y silent" (D-08, D-09)
- **`disableCopyDownload()`/`enableCopyDownload()`** — disable during transcription, enable when all complete (D-05)
- **`updateBanner()`/`hideBanner()`** — model download progress banner; format "Loading model... 62% (40MB, downloads once)" (D-07)
- **`dispatchTranscription()`** — async function called from `processFile` and `processFolder` (not `processTxt`); queues or posts jobs; uses Transferable for zero-copy audio transfer
- **`getAudioBytes()`** — handles both `File` (folder mode) and ZipObject (ZIP mode) audio entries
- **btnTryAnother** reset extended to clear `transcribeTotal`, `transcribeDone`, `pendingQueue` without touching `isWorkerReady` (Pitfall 6)
- **`index.html`**: added `<p id="model-banner"></p>` inside `#screen-upload` before `</main>` (D-07)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Verification Script Note

The plan's XSS guard verification check (`innerHTML` scan) produced a false positive because the filter `!l.trim().startsWith('//')` does not handle multi-line JSDoc comment lines starting with `*`. All matching lines are JSDoc or inline comments using "never innerHTML" phrasing — no actual `.innerHTML` assignment exists anywhere in the file (confirmed via `grep -n '\.innerHTML' assets/js/ui.js` → no matches).

## Known Stubs

None — all voice message rows will update from placeholder to real transcript text once the Worker processes them. The placeholder `[Voice message: transcription pending]` is the initial DOM state, not a stub — it updates in-place via `updateRowInPlace()` when Worker results arrive.

## Threat Flags

None — no new trust boundaries introduced beyond those in the plan's threat model.

## Self-Check

### Created files exist
- assets/js/worker.js — present (modified from stub)
- assets/js/ui.js — present (extended)
- index.html — present (extended)

### Commits exist
- `99e1054` — feat(02-01): replace worker.js stub with complete Whisper pipeline
- `3892c1d` — feat(02-01): wire Worker lifecycle, dispatch, and in-place result handling in ui.js

## Self-Check: PASSED
