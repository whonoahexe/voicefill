# Phase 2: Whisper Worker - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 2-Whisper Worker
**Areas discussed:** Worker startup timing, Transcription UI flow, Audio decode inside Worker, Model load + transcription progress UI

---

## Worker Startup Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Eager — on page load | Worker starts immediately; model downloads while user selects a file | ✓ |
| Lazy — on file submit | Worker starts when user submits; parse and download overlap | |
| You decide | Claude picks based on usage pattern | |

**User's choice:** Eager — on page load

**Follow-up: if model not ready when file submitted?**

| Option | Description | Selected |
|--------|-------------|----------|
| Wait for model, then transcribe | Show "Model loading..." until ready, then transcribe | ✓ |
| Queue the job, show download progress | Show download progress, auto-start transcription | |
| You decide | Claude picks simpler approach | |

**User's choice:** Wait for model, then transcribe

**Follow-up: cached model visibility?**

| Option | Description | Selected |
|--------|-------------|----------|
| Skip it silently if cached | No loading state shown on subsequent runs | ✓ |
| Brief status either way | Always show "Model ready" even if fast | |

**User's choice:** Skip it silently if cached

---

## Transcription UI Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Sequential — separate transcription screen | Parse → transcription screen → results | |
| Progressive — results render live | Navigate to results immediately; placeholders update in-place | ✓ |
| You decide | Claude picks least invasive approach | |

**User's choice:** Progressive — results render live

**Follow-up: copy/download availability during transcription?**

| Option | Description | Selected |
|--------|-------------|----------|
| Enabled immediately (partial content) | Buttons available from first result; may include pending placeholders | |
| Disabled until fully done | Buttons disabled until all messages processed | ✓ |

**User's choice:** Disabled until fully done

**Follow-up: visual treatment of live update?**

| Option | Description | Selected |
|--------|-------------|----------|
| Instant swap — placeholder replaced silently | textContent update, no animation | |
| Brief visual pulse | CSS fade-in transition on the updated row | ✓ |

**User's choice:** Brief visual pulse

---

## Audio Decode Inside Worker

| Option | Description | Selected |
|--------|-------------|----------|
| Trust pipeline() to handle it | Pass Uint8Array directly; simpler but untested | |
| Explicit OfflineAudioContext decode | Worker decodes .opus → Float32Array → pipeline; reliable | |
| Let researcher figure it out | Open research question — researcher verifies transformers.js v4 docs | ✓ |

**User's choice:** Let researcher figure it out

**Notes:** This was the open question flagged in Phase 1 research. The researcher must verify via transformers.js v4 documentation whether the pipeline handles raw audio bytes or requires explicit PCM decode.

**Follow-up: error logging on decode failure?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — console.warn in Worker | Worker logs filename + error message for debugging | ✓ |
| No — silent error handling | Worker only sends error status | |

**User's choice:** Yes — console.warn in Worker

---

## Model Load + Transcription Progress UI

**Model download progress location:**

| Option | Description | Selected |
|--------|-------------|----------|
| Quiet banner on upload screen | Small non-blocking status at bottom of upload zone | ✓ |
| Overlay or modal on upload screen | Prominent indicator; blocks file selection | |
| You decide | Claude picks least intrusive approach | |

**User's choice:** Quiet banner on upload screen

**Transcription counter placement:**

| Option | Description | Selected |
|--------|-------------|----------|
| Replace the summary line during transcription | Summary line shows "Transcribing 3 of 9..." in-progress, final count after | ✓ |
| Separate progress area above the chat log | Dedicated progress bar/counter above chat log | |

**User's choice:** Replace the summary line during transcription

**Final summary line format:**

| Option | Description | Selected |
|--------|-------------|----------|
| Simple count: 'X of Y voice messages transcribed' | Same pattern as Phase 1 OUT-02 | |
| Detail with silence count: 'X of Y transcribed — N silent' | Surfaces silence gate result inline | ✓ |

**User's choice:** More detail: include silence count

---

## Claude's Discretion

- Exact CSS transition/keyframe for the visual pulse (subtle fade-in, consistent with parchment aesthetic)
- Specific RMS threshold value for silence gate (researcher to surface standard from transformers.js examples)
- Banner markup and exact styling for model download progress (small, bottom of upload screen)

## Deferred Ideas

None — discussion stayed within phase scope.
