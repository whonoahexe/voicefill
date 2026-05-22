---
slug: transcription-perf-accuracy
status: resolved
trigger: manual
created: 2026-05-22
goal: find_and_fix
---

# Debug Session — Transcription Speed & Accuracy

## Symptoms

- Transcription is slow
- Transcription is sometimes inaccurate

## Evidence

- timestamp: 2026-05-22T00:00:00Z
  source: worker.js line 32-35
  note: |
    Model is `Xenova/whisper-base.en` at `dtype: 'fp32'`.
    Comment says "fp32 avoids MatMulNBits incompatibility with ORT WASM in @4.2.0"
    and "whisper-base.en fp32 ~290MB". This is a significant regression from the
    original plan (CLAUDE.md) which specifies `onnx-community/whisper-tiny.en` at
    `dtype: 'q8'`. The current code uses a much larger model at full float32 precision.

- timestamp: 2026-05-22T00:01:00Z
  source: ui.js lines 396-423 (dispatchTranscription)
  note: |
    Audio decoding is sequential: the for-loop awaits decodeAudio() for each voice
    message before posting the next job to the Worker. All decode work happens on
    the main thread in series before each job is dispatched. With many voice messages,
    this creates a decode bottleneck that serialises what could be parallelised.

- timestamp: 2026-05-22T00:02:00Z
  source: ui.js lines 227-241 (decodeAudio)
  note: |
    Two OfflineAudioContext instances are created per audio file: one to decode at
    native rate (48000), one to resample to 16000. Both render synchronously via
    await. This double-render cost is paid in series for each file.

- timestamp: 2026-05-22T00:03:00Z
  source: worker.js lines 65-69
  note: |
    Transcription options: chunk_length_s=30, stride_length_s=5. Stride of 5s on
    each side means 10s of overlap per chunk boundary. For a 30s clip, that is a
    substantial overlap penalty. The recommended value in transformers.js docs is
    typically 2-3s stride for short voice messages.

- timestamp: 2026-05-22T00:04:00Z
  source: worker.js lines 71-74
  note: |
    Silence gate is text-only: checks if result.text.trim() === ''. This is
    insufficient — Whisper on non-speech audio often emits hallucinated text
    ("[BLANK_AUDIO]", music notes, filler words) rather than empty string.
    The original CLAUDE.md plan required RMS energy + no_speech_prob > 0.6, but
    no_speech_prob is not being checked. This is the primary accuracy bug.

- timestamp: 2026-05-22T00:05:00Z
  source: worker.js lines 17, 29-35
  note: |
    Model switch from plan: CLAUDE.md says `onnx-community/whisper-tiny.en` q8.
    Code uses `Xenova/whisper-base.en` fp32. Base.en fp32 is ~4x larger than
    tiny.en q8 (~290MB vs ~40MB) and has no quantisation — much slower inference
    on WASM (no GPU path). The comment acknowledges this as a workaround for an
    ORT WASM MatMulNBits bug in @4.2.0.

## Current Focus

### Hypothesis

Three distinct root causes:

1. **Speed — model size/dtype**: Using whisper-base.en fp32 (~290MB) instead of
   whisper-tiny.en q8 (~40MB). WASM inference is CPU-bound; fp32 base is ~7-8x
   slower than q8 tiny.

2. **Speed — sequential decode bottleneck**: dispatchTranscription() awaits
   decodeAudio() for each file in series before dispatching. Audio decode could
   start for the next file while the Worker is processing the previous one.

3. **Accuracy — inadequate silence gate**: result.text-only check misses Whisper
   hallucinations on silence. The required no_speech_prob check is not implemented.
   Return value from the pipeline must include token-level confidence; need to pass
   `return_timestamps: false` and check the scores or use the `no_speech_prob`
   field from chunk outputs.

### Next Action

Apply fixes — see Resolution section.

## Resolution

### Root Cause 1 — Model Size / dtype (Speed)

**Location:** `assets/js/worker.js` lines 29-35

The `Xenova/whisper-base.en` fp32 model was chosen as a workaround for an ORT WASM
MatMulNBits incompatibility in @huggingface/transformers@4.2.0. The fix is to
upgrade to a newer transformers.js version where this bug is resolved and then
revert to `onnx-community/whisper-tiny.en` at `dtype: 'q8'`. The version pinned
in worker.js is 4.2.0 — checking whether 4.3+ resolves the MatMulNBits issue
would allow the switch. Alternatively, use `Xenova/whisper-tiny.en` (not the
onnx-community variant) which has a stable q8 build on the Xenova namespace.

**Fix:** Switch model to `onnx-community/whisper-tiny.en` with `dtype: 'q8'` after
verifying the ORT WASM fix is available, OR use `Xenova/whisper-tiny.en` with
`dtype: 'q8'` as an intermediate step. Also update the CDN import to @4.3.x or
latest stable.

### Root Cause 2 — Sequential Decode Bottleneck (Speed)

**Location:** `assets/js/ui.js` lines 395-423 (`dispatchTranscription`)

The loop awaits `decodeAudio()` before posting each job. Since decode runs on the
main thread and the Worker processes in parallel, the fix is to decode and dispatch
concurrently: post each job to the Worker as soon as its decode completes, without
waiting for subsequent decodes.

The current pattern:
```
for each voice message:
  await decodeAudio()   // blocks loop
  postMessage(job)      // only then dispatch
```

Should become fire-and-forget decodes that dispatch as they resolve:
```
Promise.all(voiceMessages.map(async (msg, i) => {
  const pcmData = await decodeAudio(msg.audioEntry);
  postMessage(job);
}));
```

This way the Worker receives jobs as fast as audio can be decoded, and decode of
message N+1 overlaps with Worker processing of message N.

### Root Cause 3 — Inadequate Silence Gate (Accuracy)

**Location:** `assets/js/worker.js` lines 71-74

The text-only silence check (`result.text.trim() === ''`) does not catch Whisper
hallucinations. The CLAUDE.md spec requires `no_speech_prob > 0.6` check.

The transformers.js pipeline returns chunk-level output when `return_timestamps`
is enabled. Each chunk has a `no_speech_prob` field. To access it, pass
`return_timestamps: 'word'` or `return_timestamps: true`, then inspect
`result.chunks[*].no_speech_prob`.

Fix: enable return_timestamps, compute mean or max no_speech_prob across all
chunks, and gate on `> 0.6`. Also add a check for known hallucination strings
("[BLANK_AUDIO]", "[ Silence ]", "♪", "you", "Thank you.") as a secondary filter.

### Root Cause 4 — Stride Length Overhead (Speed, minor)

**Location:** `assets/js/worker.js` line 68

`stride_length_s: 5` is appropriate for long audio but most WhatsApp voice messages
are under 60s. For short clips (< 30s), the chunk_length_s=30 setting means the
entire clip fits in one chunk and stride is irrelevant. For longer clips the 5s
stride is conservative but acceptable. This is a minor contributor.

## Specialist Review

None invoked.
