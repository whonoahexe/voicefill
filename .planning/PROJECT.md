# VoiceFill

## What This Is

A local, privacy-first browser tool that reconstructs exported chat logs by replacing voice message placeholders with AI-generated transcripts — producing a complete, readable conversation ready to be pasted into Claude for analysis. No servers, no uploads, no accounts. The Whisper model runs entirely in the browser via transformers.js.

## Core Value

A voice-message-inclusive chat log, fully transcribed offline, that accurately represents the complete conversation — so analysis in Claude isn't missing key context.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can upload a WhatsApp export (.zip or .txt + audio files) and get a complete transcript-annotated chat log
- [ ] WhatsApp voice message placeholders (`<Media omitted>` and filename references like `*.opus (file attached)`) are detected and matched to audio files
- [ ] Voice messages are transcribed using Whisper running in-browser (transformers.js) — English, no API key required
- [ ] Transcripts are inserted inline in the chat log in a format optimized for Claude analysis
- [ ] The final output can be copied to clipboard with one click
- [ ] Nothing leaves the device — all processing is client-side
- [ ] Instagram JSON exports are parsed and voice messages transcribed (secondary, nice-to-have)

### Out of Scope

- Multi-language support — English only in v1; Whisper auto-detect is a future enhancement
- Backend/server — core principle, never in scope
- Account system or persistence — one-shot tool, no saved state needed
- Mobile-optimized layout — personal use tool, desktop browser is fine for v1

## Context

- WhatsApp exports two modes: "without media" (voice messages become `<Media omitted>`) and "with media" (voice message lines reference the filename, e.g., `00000023-AUDIO-2024-01-15.opus (file attached)`)
- Instagram voice messages are secondary — format needs investigation during build but won't block v1
- Primary audience is personal use; the tool needs to work, not be polished for strangers
- transformers.js (Xenova/whisper-tiny or whisper-base) is the leading candidate for in-browser Whisper — runs via ONNX runtime, models cached after first load
- Output format should be readable as a plain text conversation — voice turns labeled clearly so Claude can interpret them correctly

## Constraints

- **Tech stack**: Vanilla HTML/CSS/JS or minimal framework — no build pipeline; tool should open as a file or be served statically
- **Privacy**: Zero network requests after initial model cache — no analytics, no CDN calls during use
- **Model size**: Whisper tiny/base preferred — balance between accuracy and download size (~40-150MB cached)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| In-browser Whisper via transformers.js | Privacy-first constraint + free forever; alternatives (API) violate core principles | — Pending |
| WhatsApp as primary platform | Clearest export format with actual audio files; Instagram export format TBD | — Pending |
| English-only for v1 | Simplifies model choice and UX; auto-detect adds latency per message | — Pending |

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
*Last updated: 2026-05-21 after initialization*
