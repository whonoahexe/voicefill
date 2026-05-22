# Milestones — VoiceFill

## v1.0 MVP

**Shipped:** 2026-05-22
**Phases:** 1–3 | **Plans:** 7 | **Commits:** 67
**Timeline:** 2026-05-21 → 2026-05-22 (2 days)

### Delivered

A privacy-first Electron desktop app that transcribes WhatsApp (and Instagram) voice messages entirely offline using Whisper running in-browser via transformers.js. Double-click to launch, drop an export ZIP, and get a fully reconstructed chat log ready to paste into Claude.

### Key Accomplishments

1. Complete WhatsApp parse pipeline — drag-drop ZIP, BOM/RTL stripping, Android+iOS voice detection, basename matching, four input modes (ZIP, folder, txt, drag-drop)
2. In-browser Whisper transcription via Web Worker — zero server, two-step OfflineAudioContext decode+resample, RMS silence gate, progressive in-place DOM updates
3. Parchment aesthetic UI with per-message DOM render, clipboard copy (execCommand fallback), .txt download, and 350ms transcript-appear fade animation
4. Packaged as Electron desktop app — no HTTP server, no terminal, runs fully offline after model cache (~40MB)
5. Instagram export support — ZIP and JSON parsing, Latin-1 encoding fix, m4a audio matching, oldest-first sort

### Archives

- `.planning/milestones/v1.0-ROADMAP.md`
- `.planning/milestones/v1.0-REQUIREMENTS.md`

### Known Gaps at Close

- No milestone audit run (no v1.0-MILESTONE-AUDIT.md)
- Safari Ogg/Opus decoding unresolved — v1 targets Chrome/Edge only
- no_speech_prob gate not implemented — transformers.js does not expose it; RMS gate used

---
