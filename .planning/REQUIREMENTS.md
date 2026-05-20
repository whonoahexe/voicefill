# Requirements — VoiceFill

_Defined: 2026-05-21_

## v1 Requirements

### File Input & Export Parsing

- [ ] **INPUT-01**: User can drop a WhatsApp export ZIP onto the upload area (drag-and-drop)
- [ ] **INPUT-02**: User can select a WhatsApp export ZIP via a file picker button (click-to-browse fallback)
- [ ] **INPUT-03**: User can select a folder of extracted files (for users who already unzipped manually)
- [ ] **INPUT-04**: User can paste or load a raw `.txt` chat log without audio (parse-only mode, voice lines annotated as [Audio not available])
- [ ] **PARSE-01**: Tool detects WhatsApp "with media" exports and extracts `_chat.txt` + `.opus` audio files from the ZIP
- [ ] **PARSE-02**: Tool detects WhatsApp "without media" exports (`<Media omitted>` placeholders) and shows a clear error explaining the re-export step — does not proceed silently
- [ ] **PARSE-03**: Tool parses voice message lines in both WhatsApp filename formats (Android `PTT-*.opus` and iOS `00000023-AUDIO-*.opus`) and matches them to audio files by basename, ignoring ZIP subfolder paths
- [ ] **PARSE-04**: Tool handles WhatsApp `_chat.txt` format variations: strips BOM and Unicode directional marks, detects US-locale date format (M/D/YY) as v1 baseline
- [ ] **PARSE-05**: Instagram JSON export is parsed and voice messages extracted (secondary — behind WhatsApp in priority; may be incomplete in v1 if format verification is blocked)

### Transcription

- [ ] **TRANS-01**: Voice messages are transcribed using Whisper running entirely in-browser via `@huggingface/transformers` v4 — no API key, no server, no data leaves the device
- [ ] **TRANS-02**: Model used is `onnx-community/whisper-tiny.en` at `dtype: 'q8'` (~40MB); inference runs in a Web Worker to keep the UI responsive
- [ ] **TRANS-03**: On first use, a progress bar shows model download progress with an explicit size warning ("~40MB — downloads once, then cached")
- [ ] **TRANS-04**: During transcription, a per-message progress indicator shows current position ("Transcribing 4 of 9 voice messages...")
- [ ] **TRANS-05**: Messages that are silence or near-silence are detected via RMS energy check and `no_speech_prob` gate and skipped rather than producing hallucinated text — annotated as [No speech detected] in output

### Error Handling

- [ ] **ERR-01**: "Without media" export detected → show friendly explanation with re-export instructions before failing
- [ ] **ERR-02**: Corrupt or undecodable `.opus` file → annotate that message as `[Audio unreadable]` and continue with the rest of the queue
- [ ] **ERR-03**: Voice message line in chat log has no matching audio file in ZIP → annotate as `[Audio file missing]` in output
- [ ] **ERR-04**: Audio file in ZIP has no matching voice line in chat log → silently ignored (orphan files don't affect output)

### Output

- [ ] **OUT-01**: Reconstructed chat log is displayed with voice message placeholders replaced by `[Voice message: "...transcript..."]` inline — format optimized for pasting into Claude
- [ ] **OUT-02**: A summary header shows the transcript count: "X of Y voice messages transcribed"
- [ ] **OUT-03**: User can copy the full reconstructed chat to clipboard with one click
- [ ] **OUT-04**: User can download the reconstructed chat as a `.txt` file

### Design & UI

- [ ] **UI-01**: Visual aesthetic is warm parchment — background `#f5f0e8`, text `#2c2016`, accent `#8b5e3c`, subtle CSS noise/grain texture — evoking physical correspondence
- [ ] **UI-02**: Typography is typewriter/monospace throughout (Courier Prime or similar) — reinforces the physical correspondence metaphor
- [ ] **UI-03**: The UI is clean and focused — one primary action at a time, no clutter, whitespace used deliberately
- [ ] **UI-04**: Progress states are visually calm and deliberate (not flashy spinners) — consistent with the tool's emotional register

### Distribution (Electron)

- [ ] **DIST-01**: Tool is packaged as an Electron desktop app — eliminates HTTP serving requirement and `file://` limitations
- [ ] **DIST-02**: App runs fully offline after initial Whisper model download — no ongoing network dependency

## v2 Requirements (Deferred)

- Multi-locale WhatsApp date format support (EU D/M/YY, 24-hour clock, etc.)
- Instagram support (if not completed in v1)
- Whisper model selection (tiny vs base) with accuracy/speed tradeoff explanation
- Language selection or auto-detect (non-English voice messages)
- Dark mode variant of the parchment aesthetic

## Out of Scope

- **Server-side processing** — core principle, never in scope
- **Account system or persistence** — one-shot tool, no saved history
- **Mobile layout** — Electron desktop app, desktop-only in v1
- **"Without media" transcription** — there are no audio files to transcribe; this is a user re-export problem
- **Batch processing multiple chats** — one chat per session in v1

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| INPUT-01 | Phase 1 | Pending |
| INPUT-02 | Phase 1 | Pending |
| INPUT-03 | Phase 1 | Pending |
| INPUT-04 | Phase 1 | Pending |
| PARSE-01 | Phase 1 | Pending |
| PARSE-02 | Phase 1 | Pending |
| PARSE-03 | Phase 1 | Pending |
| PARSE-04 | Phase 1 | Pending |
| ERR-01 | Phase 1 | Pending |
| ERR-02 | Phase 1 | Pending |
| ERR-03 | Phase 1 | Pending |
| ERR-04 | Phase 1 | Pending |
| OUT-01 | Phase 1 | Pending |
| OUT-02 | Phase 1 | Pending |
| OUT-03 | Phase 1 | Pending |
| OUT-04 | Phase 1 | Pending |
| UI-01 | Phase 1 | Pending |
| UI-02 | Phase 1 | Pending |
| UI-03 | Phase 1 | Pending |
| UI-04 | Phase 1 | Pending |
| TRANS-01 | Phase 2 | Pending |
| TRANS-02 | Phase 2 | Pending |
| TRANS-03 | Phase 2 | Pending |
| TRANS-04 | Phase 2 | Pending |
| TRANS-05 | Phase 2 | Pending |
| DIST-01 | Phase 3 | Pending |
| DIST-02 | Phase 3 | Pending |
| PARSE-05 | Phase 3 | Pending |
