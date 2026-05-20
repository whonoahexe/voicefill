# Research Summary — VoiceFill

_Synthesized: 2026-05-21_

## Recommended Stack

| Layer | Choice | Version / Notes |
|-------|--------|----------------|
| Speech-to-text | `@huggingface/transformers` | 4.0.1 via CDN (jsdelivr) |
| Whisper model | `onnx-community/whisper-tiny.en` | `dtype: 'q8'` (~40MB); upgrade to `whisper-base.en` if accuracy is poor |
| ZIP parsing | JSZip | 3.x via CDN |
| Audio decoding | Web Audio API (`AudioContext`) | Built-in; `sampleRate: 16000` forces correct PCM output |
| Concurrency | Web Workers API | `type: 'module'` worker; requires Chrome 80+, Firefox 114+ |
| UI | Vanilla HTML/CSS/JS | No framework, no build step |
| Serving | Any static HTTP server | `python -m http.server` or `npx serve` — `file://` explicitly unsupported |

**Model quantization note:** Whisper encoder is sensitive to aggressive quantization. If `q4` produces poor results, use per-module dtype: `encoder_model: 'q8'`, `decoder_model_merged: 'q4'`. Use `onnx-community/` model IDs, not the legacy `Xenova/` naming.

## Table Stakes Features

Must be in v1:

- ZIP upload (drag-and-drop + file picker) — exports are always ZIPs
- Parse `_chat.txt` in both export modes ("with media" and "without media")
- Detect voice message lines and match to `.opus` files by filename
- Transcribe matched audio via in-browser Whisper
- Insert transcripts inline with Claude-friendly formatting: `[Voice message: ...]`
- Graceful handling of "without media" exports: clear error, not silent failure
- Copy-to-clipboard output
- Per-message progress indicator (transcription takes 2–20s each; silent waiting is unacceptable)
- Voice message count shown before transcription starts
- Model download progress bar with first-run size warning (~40MB)

Defer to v2: Instagram support, model selection toggle, locale-aware date parsing beyond US English.

## Key Architecture Decisions

1. **Multi-file static site, not single-file HTML.** Module Workers (`type: 'module'`) cannot be reliably constructed from Blob URLs in all browsers. Ship `index.html` + `worker.js` + vendor JS.

2. **Singleton Whisper pipeline in a dedicated Web Worker.** Load once, reuse per message. Main thread posts `{ audioData, filename, index, total }`, worker responds `{ status, filename, text }`.

3. **Sequential transcription queue, not parallel.** Whisper is CPU-bound via WASM — parallel gives identical throughput with double the memory. Sequential also gives clean progress semantics.

4. **Parse pipeline is independent of Whisper.** Phase 1 (ZIP + parse + output render) is fully testable without any ML dependency. Build and validate the parser first.

5. **Two-phase progress UI.** Phase A: model download (per-file from `progress_callback`). Phase B: queue counter ("Transcribing 3 of 7 voice messages..."). Visually distinct states.

6. **Single mutable state object + explicit `render()`.** Linear, irreversible flow — no reactive framework needed.

7. **Output format optimized for Claude.** Plain text, no markdown. Inline `[Voice message: ...]` annotations. Unmatched `<Media omitted>` annotated explicitly.

## Watch Out For

**1. `file://` is completely broken — mandate HTTP serving (CRITICAL)**
SharedArrayBuffer and CORS on WASM/Worker loading both fail on `file://`. The tool will not load at all when double-clicked. Add a startup `file://` detector and bundle a `start.bat`/`start.sh` that runs `npx serve .`.

**2. WhatsApp format has more variation than it looks (CRITICAL)**
Date format varies by locale (M/D/YY vs D/M/YYYY vs D.M.YY), OS (Android vs iOS structure and encoding), and voice filename patterns (Android: `PTT-*.opus`, iOS: `00000023-AUDIO-*.opus`). Some locales use `audio omitted` instead of `<Media omitted>`.
Strip BOM and directional marks at parse time. Match voice lines on `.opus (file attached)` extension pattern, not full filename. Build a `Map<basename, ZipEntry>` at load time.

**3. Whisper hallucinates on silence and noise (SIGNIFICANT)**
Silent or near-silent audio produces plausible fabricated text that silently corrupts the chat log. Apply RMS energy check + duration gate (skip < 0.5s) + `no_speech_prob > 0.6` gate before accepting any transcript.

**4. ZIP path normalization (SIGNIFICANT)**
WhatsApp ZIPs wrap everything in a folder named after the chat. Always build a `Map<basename, ZipEntry>` by stripping folder prefixes.

**5. Memory: never decompress all audio at once (SIGNIFICANT)**
Decompress lazily one file at a time. Nullify buffers after each transcription. Warn if > 100 voice messages detected.

## Resolved Conflicts

**`file://` vs HTTP** — Both STACK.md and PITFALLS.md are partially correct. Single-threaded WASM fallback works without SharedArrayBuffer on HTTP servers without COOP/COEP. But `file://` still fails for Worker loading and WASM binary fetching regardless. **`file://` is unsupported, full stop.**

**Safari Ogg/Opus decoding** — ARCHITECTURE.md says Safari 16.1+ supports Opus; PITFALLS.md says Safari cannot decode `.opus`. Resolution: Safari 16.1+ added Opus in WebM containers; WhatsApp uses Ogg containers. This is genuinely unresolved — **requires live testing.** Chrome/Edge are the v1 supported targets.

## Open Questions for Build Phase

1. **Safari Ogg/Opus** — Test `AudioContext.decodeAudioData()` with a real WhatsApp `.opus` file in Safari 16.1+ before designing fallback strategy.
2. **Single-threaded WASM inference speed** — Measure whisper-tiny on real WhatsApp audio in Phase 2 before deciding tiny vs base as default.
3. **`pipeline()` accepts `Float32Array` directly** — Verify `transcriber(float32Array, { sampling_rate: 16000 })` works without intermediate Blob URL.
4. **Actual cached model size** — Verify exact download size in DevTools for first-run UX message.
5. **Android PTT filename format** — `PTT-20240115-WA0023.opus` pattern needs confirmation from a real Android export.
6. **`<Media omitted>` is ALL media types** — No way to filter voice-only without audio files. v1 must require "with media" exports and explain the re-export step clearly.
