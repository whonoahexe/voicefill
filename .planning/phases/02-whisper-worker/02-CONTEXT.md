# Phase 2: Whisper Worker - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace every `[Voice message: transcription pending]` placeholder with a real Whisper transcript produced entirely inside a Web Worker. The Worker uses `onnx-community/whisper-tiny.en` at `dtype: 'q8'` (~40MB) via `@huggingface/transformers` v4. The model is pre-warmed on page load (eager). Results render progressively — the results screen appears immediately after parse, and each voice message row updates live as the Worker finishes it. A silence gate (`no_speech_prob > 0.6` + RMS energy check) skips near-silent audio and annotates it as `[No speech detected]` instead of producing hallucinated text. Nothing leaves the device.

</domain>

<decisions>
## Implementation Decisions

### Worker Lifecycle & Startup
- **D-01:** Worker is constructed **eagerly on page load** — model download begins immediately when the app opens, before the user selects a file. By the time the user submits a file, the model is likely cached or downloading in the background.
- **D-02:** If the model is not yet ready when the user submits a file, the app waits for the Worker to emit `{ status: 'ready' }` before starting transcription. During the wait, the progress area shows "Loading model..." (then transitions to per-message progress once ready).
- **D-03:** If the model is **already cached** (subsequent runs), the "Loading model..." state is skipped entirely — the Worker emits `ready` quickly and the app moves straight to transcription with no visible loading phase.

### Transcription UI Flow
- **D-04:** **Progressive results rendering** — the app navigates to the results screen immediately after parse finishes. Voice message rows start with the placeholder annotation and update in-place as each Worker result arrives. The parse step and transcription step are visually continuous — no separate "transcription" screen.
- **D-05:** **Copy and Download buttons are disabled** while transcription is in progress. They are only enabled once all voice messages have been processed (transcribed, silenced, or errored). This ensures the clipboard/download content is always complete.
- **D-06:** When a voice message row updates from placeholder to real transcript, it receives a **brief visual pulse** (CSS fade-in transition on the text) to draw the user's eye to the newly arrived content. Should be subtle and consistent with the parchment aesthetic (no flashy animation).

### Transcription Progress Indicators
- **D-07:** **Model download progress** appears as a **quiet banner at the bottom of the upload screen** — small, non-blocking, does not prevent file selection. Format: "Loading model... 62% (40MB, downloads once)" or equivalent. Banner disappears when the Worker emits `ready`.
- **D-08:** **Per-message transcription progress** replaces the summary line on the results screen while in-progress. Format: "Transcribing 3 of 9 voice messages..." — matches TRANS-04 wording. Updates as each message completes.
- **D-09:** **Final summary line** (after all transcription done) includes silence count for transparency. Format: "7 of 9 voice messages transcribed — 2 silent" (or "— 0 silent" / "— 1 silent"). The silence count is derived from `[No speech detected]` annotations.

### Audio Decode
- **D-10:** **Decoder approach is an open research question** — the researcher must verify via transformers.js v4 docs whether `pipeline()` accepts raw `Uint8Array` (or Blob URL) directly, or whether the Worker must explicitly decode `.opus` bytes via `OfflineAudioContext` → `Float32Array` at 16kHz before passing to the pipeline. The planner locks this in based on research findings.
- **D-11:** On decode failure (corrupt `.opus` → ERR-02), the Worker emits `{ status: 'error', filename, message }` and also emits `console.warn` with the filename and error detail for debugging. The main thread annotates the row as `[Audio unreadable]` and continues the queue.

### Silence Gate
- **D-12:** Silence gate applies **both** conditions: RMS energy below threshold **AND** `no_speech_prob > 0.6`. Specific RMS threshold value is Claude's discretion (researcher may find a standard value in the transformers.js pipeline output). Messages that pass the silence gate are annotated `[No speech detected]`.

### Output Format
- **D-13:** Phase 2 replaces the Phase 1 placeholder annotation format. Live transcript format: `[Voice message: "...text..."]` (quoted, per REQUIREMENTS.md OUT-01). Silence: `[No speech detected]`. Decode error: `[Audio unreadable]`. All via `textContent` — never `innerHTML` (XSS rule from Phase 1).

### Claude's Discretion
- Exact CSS transition/keyframe for the visual pulse on transcript arrival (subtle fade-in consistent with parchment aesthetic; no bouncing, scaling, or color flash).
- Specific RMS threshold value for the silence gate (researcher to surface standard value from transformers.js docs/examples).
- Banner markup and exact styling for model download progress (small, bottom of upload screen, dismisses on `ready`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Scope
- `.planning/REQUIREMENTS.md` — Phase 2 covers: TRANS-01, TRANS-02, TRANS-03, TRANS-04, TRANS-05, ERR-02
- `.planning/ROADMAP.md` §Phase 2 — Phase goal, success criteria, and plan breakdown (02-01, 02-02)
- `.planning/PROJECT.md` — Core value, constraints, and privacy constraint (nothing leaves the device)

### Existing Code (Integration Points)
- `assets/js/worker.js` — Phase 1 stub; defines the message protocol this phase implements. The protocol is FIXED — do not change it.
- `assets/js/ui.js` — Screen state machine; `renderMessage()` and `renderChatLog()` are the entry points Phase 2 modifies to enable live updates. The `// ERR-02` comment in `renderMessage()` marks the exact line to replace.
- `assets/js/parser.js` — Parser that feeds `audioFiles` Map to the transcription queue; Phase 2 reads from this map to build the Worker job queue.

### Design System
- `CLAUDE.md` §Design System — Color palette, typography, aesthetic spec. All progress UI must match: parchment background, sepia accent, Courier Prime, no flashy animation.

### No external specs
No additional ADRs or external docs referenced during discussion. Researcher should verify transformers.js v4 pipeline API via documentation lookup.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `assets/js/ui.js → renderMessage()`: renders a single chat row with `textContent`-only DOM construction. Phase 2 needs to make voice rows updateable in-place — extend `renderMessage()` to tag voice rows with a `data-filename` attribute so the Worker result handler can `querySelector` them for live update.
- `assets/js/ui.js → showScreen()`: existing screen state machine; Phase 2 does NOT add a new screen — it uses the existing `results` screen and modifies its in-progress state.
- `assets/js/ui.js → processFile() / processFolder()`: both functions call `renderChatLog(result)` then `showScreen('results')`. Phase 2 needs to insert the Worker dispatch between the parse result and the first render.

### Established Patterns
- **textContent only** — XSS prevention rule from Phase 1 applies unconditionally to all transcript text. Worker-returned transcript strings are user-adjacent content (parsed from audio) and must never be set via `innerHTML`.
- **300ms processing screen minimum** — existing Pitfall 6 guard. Phase 2 keeps this on the parse step; the transcription phase uses live DOM updates on the results screen (no minimum delay needed there).
- **Singleton Worker** — Worker is constructed once at `init()` time and reused for all files in the session (including "Try another file" flows). The Worker's `{ status: 'ready' }` message is only expected once per session.

### Integration Points
- `worker.js` stub exports the same message interface Phase 2 will implement — Phase 2 fills in the body without touching `ui.js`'s `postMessage` calls.
- The `audioFiles` Map (produced by `parseZip`/`parseFolder`) contains `File` objects (folder mode) and ZipObject references (ZIP mode) keyed by basename. Phase 2 decode step must handle both types — this was flagged in Phase 1 decision 01-02.

</code_context>

<specifics>
## Specific Ideas

- The visual pulse on transcript arrival should feel like ink appearing on parchment — a gentle fade-in, not a pop or flash. A 300–500ms CSS opacity transition from 0 to 1 would match the "warm correspondence" aesthetic.
- The model download banner should feel like a footnote, not a status bar — small type, placed unobtrusively at the bottom of the upload zone so it doesn't compete with the primary call to action.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-Whisper Worker*
*Context gathered: 2026-05-21*
