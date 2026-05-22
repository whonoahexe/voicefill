# VoiceFill

## What This Is

A local, privacy-first Electron desktop app that reconstructs WhatsApp (and Instagram) chat exports by replacing voice message placeholders with Whisper transcripts — producing a complete, readable conversation ready to be pasted into Claude for analysis. Double-click to launch, drop an export ZIP, get a fully annotated chat log. No servers, no uploads, no accounts. The Whisper model (~40MB) runs entirely in a Web Worker via transformers.js.

## Core Value

A voice-message-inclusive chat log, fully transcribed offline, that accurately represents the complete conversation — so analysis in Claude isn't missing key context.

## Requirements

### Validated

- ✓ User can upload a WhatsApp export (.zip or folder or .txt) and get a complete transcript-annotated chat log — v1.0
- ✓ WhatsApp voice message placeholders detected and matched to audio files (Android PTT-*.opus and iOS 00000023-AUDIO-*.opus) — v1.0
- ✓ Voice messages transcribed using Whisper in-browser (transformers.js, onnx-community/whisper-tiny.en, dtype q8) — v1.0
- ✓ Transcripts inserted inline as [Voice message: "..."] — format optimized for Claude analysis — v1.0
- ✓ Final output copied to clipboard with one click, or downloaded as .txt — v1.0
- ✓ Nothing leaves the device — all processing is client-side — v1.0
- ✓ Instagram JSON exports parsed and voice messages transcribed — v1.0

### Active

- [ ] Multi-locale WhatsApp date format support (EU D/M/YY, 24-hour clock variants)
- [ ] Whisper model selection UI (tiny vs base) with accuracy/speed tradeoff explanation
- [ ] Language auto-detect or selection for non-English voice messages
- [ ] Dark mode variant of the parchment aesthetic

### Out of Scope

- Backend/server — core principle, never in scope
- Account system or persistence — one-shot tool, no saved state
- Mobile-optimized layout — Electron desktop app, desktop-only
- Batch processing multiple chats — one chat per session in v1
- "Without media" transcription — there are no audio files to transcribe; user re-export problem
- Server-side Whisper API — violates privacy-first constraint

## Context

- **v1.0 shipped 2026-05-22** — 3 phases, 7 plans, 67 commits across 2 days
- Codebase: ~2,600 LOC (index.html + assets/js/[main,parser,ui,worker].js + assets/css/style.css)
- Tech stack: Vanilla HTML/CSS/JS + Electron 42 + @huggingface/transformers@4.2.0 (CDN) + JSZip 3.10.1
- Distribution: electron-builder portable .exe (Windows)
- WhatsApp "with media" export required — "without media" shows friendly re-export instructions
- Primary audience: personal use; the tool works, not polished for strangers
- Safari Ogg/Opus decoding unresolved — v1 targets Chrome/Edge only
- Transformers.js pipeline API does not expose no_speech_prob; RMS silence gate used instead

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| In-browser Whisper via transformers.js | Privacy-first constraint + free forever; alternatives (API) violate core principles | ✓ Good — 40MB model, ~1-3s per message |
| WhatsApp as primary platform | Clearest export format with actual audio files | ✓ Good — Android+iOS both handled |
| English-only for v1 | Simplifies model choice and UX; auto-detect adds latency per message | ✓ Good — deferred cleanly |
| Electron distribution | Eliminates file:// and HTTP serving requirements confirmed by research | ✓ Good — double-click launch works |
| JSZip as classic script before ES module entry | UMD build registers window.JSZip; load order critical | ✓ Good — correct but fragile; bundle in v2 |
| innerHTML banned — textContent enforced throughout | XSS prevention; user-supplied chat content is untrusted | ✓ Good — consistent |
| detectExportMode triple-condition guard | Prevents parse-only .txt from routing to without-media screen (Pitfall 5) | ✓ Good |
| Two-step OfflineAudioContext (48kHz→16kHz) | Single-context approach does not auto-resample | ✓ Good — required |
| CDN import of transformers.js in worker.js | Bare specifier fails in Electron renderer without bundler | ✓ Good — works; CDN dependency at first-run |
| RMS silence gate only (no no_speech_prob) | transformers.js pipeline API does not expose no_speech_prob | ✓ Good — RMS adequate for silence |
| Instagram via processZipFile() routing | filename.includes('instagram') heuristic; falls back to WhatsApp parse on mismatch | ✓ Good — low false-positive risk |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-22 after v1.0 milestone*
