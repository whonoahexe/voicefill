# Roadmap: VoiceFill

## Overview

Three phases, each delivering a working vertical slice. Phase 1 builds the complete parse-to-output pipeline using placeholder transcripts — proving the tool end-to-end without any ML dependency. Phase 2 drops in the real Whisper worker, replacing placeholders with live transcripts. Phase 3 packages the finished app as an Electron binary and adds Instagram as a secondary input format.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Parse Pipeline** - End-to-end chat reconstruction with placeholder transcripts (no ML) — completed 2026-05-21
- [ ] **Phase 2: Whisper Worker** - Real in-browser transcription via transformers.js Web Worker
- [ ] **Phase 3: Package & Ship** - Electron packaging, offline guarantee, and Instagram support

## Phase Details

### Phase 1: Parse Pipeline
**Goal**: A user can drop a WhatsApp export ZIP and receive a fully reconstructed chat log with voice message positions identified, errors annotated, and output ready to copy — using placeholder transcripts
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: INPUT-01, INPUT-02, INPUT-03, INPUT-04, PARSE-01, PARSE-02, PARSE-03, PARSE-04, ERR-01, ERR-02, ERR-03, ERR-04, OUT-01, OUT-02, OUT-03, OUT-04, UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. User can drag-and-drop or browse to a WhatsApp export ZIP and the app accepts it without error
  2. Voice message lines in `_chat.txt` are detected and matched to `.opus` files for both Android (`PTT-*.opus`) and iOS (`00000023-AUDIO-*.opus`) filename patterns
  3. "Without media" exports show a clear re-export explanation instead of silently failing
  4. Reconstructed chat log is displayed inline with `[Voice message: placeholder]`, `[Audio unreadable]`, `[Audio file missing]`, and `[Audio not available]` annotations in the correct positions
  5. User can copy the full reconstructed log to clipboard and download it as a `.txt` file; the parchment aesthetic and monospace typography are present throughout
**Plans**: 3 plans

Plans:
**Wave 1:**
- [x] 01-01-PLAN.md — Walking Skeleton: project scaffold, JSZip vendor, drag-drop + file picker, ZIP extraction, thin DOM render (INPUT-01, INPUT-02, PARSE-01, PARSE-04, UI-01–04) — completed 2026-05-21

**Wave 2 *(blocked on Wave 1 completion)*:**
- [x] 01-02-PLAN.md — Complete parser: full _chat.txt parse, voice detection, audio matching, error annotations, all input modes, without-media screen (INPUT-03, INPUT-04, PARSE-02, PARSE-03, ERR-01–04) — completed 2026-05-21

**Wave 3 *(blocked on Wave 2 completion)*:**
- [x] 01-03-PLAN.md — Results screen: styled chat log, copy to clipboard, download .txt, sticky header, Try another file (OUT-01–04, UI-01–04, ERR-02) — completed 2026-05-21

**Cross-cutting constraints:**
- XSS prevention: all chat content via `textContent`, never `innerHTML` (all plans)
- ZIP path normalization: `zip.forEach` basename map, never `zip.files[path]` directly (01-01, 01-02)
**UI hint**: yes

### Phase 2: Whisper Worker
**Goal**: Voice message placeholders are replaced with real transcripts produced by Whisper running entirely inside a Web Worker — no API key, no server, nothing leaves the device
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: TRANS-01, TRANS-02, TRANS-03, TRANS-04, TRANS-05, ERR-02
**Success Criteria** (what must be TRUE):
  1. On first run, a progress bar shows model download progress with the explicit "~40MB — downloads once, then cached" warning
  2. During transcription, the UI shows "Transcribing X of Y voice messages..." updating per message without freezing
  3. Voice messages produce accurate English transcripts inserted as `[Voice message: "..."]` in the output
  4. Silent or near-silent audio is skipped and annotated as `[No speech detected]` rather than producing hallucinated text
**Plans**: 2 plans

Plans:
**Wave 1:**
- [ ] 02-01-PLAN.md — Worker pipeline, audio decode+resample, RMS silence gate, dispatch queue, in-place row updates, summary line, model banner, button enable/disable (TRANS-01, TRANS-02, TRANS-03, TRANS-04, TRANS-05, ERR-02)

**Wave 2 *(blocked on Wave 1 completion)*:**
- [ ] 02-02-PLAN.md — CSS: transcript fade-in keyframe, pending/resolved voice annotation states, model banner styles, disabled button states; end-to-end browser UAT checkpoint (TRANS-03, TRANS-04, TRANS-05)

**Cross-cutting constraints:**
- XSS prevention: all Worker-returned transcript text via `textContent` only — never `innerHTML` (all plans)
- CDN import: `@huggingface/transformers` imported via jsdelivr CDN URL in worker.js — bare specifier and node_modules paths fail in Electron renderer without a bundler
- Two-step audio decode: OfflineAudioContext at 48kHz to decode, second at 16kHz to resample — single-context approach does not auto-resample (Pitfall 5)

### Phase 3: Package & Ship
**Goal**: The finished app runs as a self-contained Electron desktop binary, eliminating HTTP serving requirements, and Instagram exports are accepted as a secondary input format
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: DIST-01, DIST-02, PARSE-05
**Success Criteria** (what must be TRUE):
  1. User can launch VoiceFill by double-clicking the Electron app — no terminal, no HTTP server required
  2. After the initial Whisper model download, the app operates with zero network requests
  3. User can drop an Instagram JSON export and receive a reconstructed chat log with voice messages transcribed (or a clear "format not supported yet" message if Instagram format verification is blocked)
**Plans**: TBD

Plans:
- [ ] 03-01: Electron shell, main/renderer process wiring, and offline verification (DIST-01,02)
- [ ] 03-02: Instagram JSON parser and voice message extraction (PARSE-05)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Parse Pipeline | 3/3 | Complete | 2026-05-21 |
| 2. Whisper Worker | 0/2 | Not started | - |
| 3. Package & Ship | 0/2 | Not started | - |
