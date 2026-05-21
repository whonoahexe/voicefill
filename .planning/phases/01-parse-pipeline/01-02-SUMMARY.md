---
phase: 01-parse-pipeline
plan: 02
subsystem: frontend
tags: [parser, voice-detection, bom-stripping, folder-input, txt-input, without-media, error-annotations]
dependency_graph:
  requires:
    - 01-01 (walking skeleton — app shell, parseZip stub, screen state machine)
  provides:
    - assets/js/parser.js full parse pipeline (parseChatText, matchVoiceToAudio, assemblePlainText, parseFolder, parseTxt)
    - assets/js/ui.js folder and txt input modes wired; without-media routing
    - index.html folder-input and txt-input elements; without-media screen content already present
    - assets/css/style.css voice-annotation styles
  affects:
    - 01-03 (results screen styled render — replaces renderSkeletonResults with full styled view)
tech_stack:
  added: []
  patterns:
    - parseChatText: LINE_START regex + indexOf-based sender split (Pitfall 3 guard)
    - BOM + RTL mark stripping before any regex matching (PARSE-04)
    - matchVoiceToAudio: basename Map lookup, mutates messages in-place
    - detectExportMode: triple-condition guard (hasOmitted AND size=0 AND voiceMatched=0) — Pitfall 5
    - assemblePlainText: D-09/D-10 annotation strings, system messages skipped
    - parseFolder: FileList from webkitdirectory, File.text() for chat read
    - parseTxt: empty audioFiles Map, always returns with-media per Pitfall 5
    - 300ms minimum processing screen enforced in all three processX handlers
    - textContent-exclusive DOM rendering maintained throughout (XSS prevention)
key_files:
  created: []
  modified:
    - assets/js/parser.js
    - assets/js/ui.js
    - index.html
    - assets/css/style.css
decisions:
  - detectExportMode triple-condition guards Pitfall 5 (parse-only .txt never routed to without-media)
  - parseFolder stores File objects in audioFiles Map (not ZipObjects) — compatible for Phase 1 since bytes are not read; Phase 2 adapts
  - ERR-02 (corrupt .opus annotation) deferred to Phase 2 — Phase 1 cannot detect corruption without decoding audio bytes
  - rawLines preserved in parseZip return for backward compat — Plan 01-03 removes it
metrics:
  duration: "~12m"
  completed: "2026-05-21"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 4
---

# Phase 01 Plan 02: Full Parser Pipeline Summary

**One-liner:** Full WhatsApp chat parse pipeline with BOM/RTL stripping, Android+iOS voice detection, basename matching, error annotations, and all four input modes wired to the UI.

## What Was Built

The parser is now functionally complete. `assets/js/parser.js` gained five new exported functions covering the entire parse pipeline: `parseChatText` strips BOM and Unicode directional marks then splits every `_chat.txt` line using a LINE_START regex with indexOf-based sender extraction; `matchVoiceToAudio` walks the message array and maps each voice line to an audio entry by basename (or annotates it `[Audio file missing]`); `detectExportMode` applies the three-condition guard that catches "without media" exports without misidentifying parse-only .txt mode; `assemblePlainText` assembles the plain text output with D-09/D-10 annotation strings; `parseFolder` and `parseTxt` add the two remaining entry points.

`assets/js/ui.js` gained `processFolder` and `processTxt` async functions parallel to `processFile`, all three now routing `result.mode === 'without-media'` to the error screen. Event bindings for the folder picker (`btn-browse-folder`, `folder-input`) and txt picker (`btn-browse-txt`, `txt-input`) were added inside `init()`. `renderSkeletonResults` was updated to display the voice message summary line from `result.stats`.

`index.html` received the hidden `folder-input` (webkitdirectory) and `txt-input` elements plus their trigger buttons. The without-media screen content was already written by Plan 01-01.

`assets/css/style.css` gained `.voice-annotation` (italic, opacity 0.6) and `.voice-annotation.error` styles, plus the two new button IDs in the secondary button selectors.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Complete parser.js — BOM stripping, full _chat.txt parser, voice matching, mode detection, output assembly, folder/txt entry points | 23adb12 | assets/js/parser.js |
| 2 | Complete ui.js input wiring (folder, txt) + without-media screen; update index.html with new inputs; style annotations in style.css | 67ba157 | assets/js/ui.js, index.html, assets/css/style.css |

## Decisions Made

1. **detectExportMode triple-condition guard** — only triggers on `hasOmitted && audioFiles.size === 0 && voiceMatched === 0`. A parse-only .txt file with "with media"-format voice lines (referencing .opus filenames) has `hasOmitted=false` so it routes to results, not the error screen (Pitfall 5).

2. **parseFolder uses File objects in audioFiles Map** — In folder mode, audio entries are `File` objects rather than JSZip `ZipObject` instances. Both are stored as references; neither is read in Phase 1. Phase 2 adapts the decode step to handle both types.

3. **ERR-02 deferred to Phase 2** — `[Audio unreadable]` cannot be emitted at parse time because corrupt .opus detection requires actually decoding audio bytes (`AudioContext.decodeAudioData`), which happens in Phase 2. A comment in parser.js marks the injection point.

4. **rawLines backward compat in parseZip** — `rawLines` is still returned by `parseZip` so the walking skeleton thin render in `renderSkeletonResults` continues to work until Plan 01-03 replaces it with the full styled render.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `renderSkeletonResults` displays rawLines | assets/js/ui.js | Intentional — Plan 01-03 replaces this with styled per-message render using the `messages` array |
| `[Voice message: transcription pending]` | assets/js/parser.js (assemblePlainText) | D-09: Phase 1 placeholder; Phase 2 replaces with live transcript text |

These stubs do not prevent the plan's goal. The pipeline is functionally complete and all four input modes route correctly.

## Threat Flags

No new security-relevant surface beyond the plan's threat model. All T-02-01 through T-02-05 mitigations verified:

- T-02-01 (XSS via sender/body): zero innerHTML assignments for user data in parser.js or ui.js; all DOM writes use textContent
- T-02-02 (Unicode directional marks): parseChatText strips U+200E, U+200F, U+202A-U+202E immediately before any regex matching
- T-02-03 (without-media mis-detection): detectExportMode triple-condition guard implemented
- T-02-04 (large _chat.txt DoS): accepted per plan; no mitigation in Phase 1
- T-02-05 (stack traces in UI): error handlers surface only err.message

## Self-Check: PASSED

### Files verified:
- assets/js/parser.js: FOUND — 5 new exports confirmed (parseChatText, matchVoiceToAudio, assemblePlainText, parseFolder, parseTxt)
- assets/js/ui.js: FOUND — processFolder, processTxt, without-media routing present
- index.html: FOUND — folder-input (webkitdirectory), txt-input, btn-browse-folder, btn-browse-txt present
- assets/css/style.css: FOUND — .voice-annotation with font-style: italic and opacity: 0.6 present

### Commits verified:
- 23adb12: FOUND (Task 1 — parser.js)
- 67ba157: FOUND (Task 2 — ui.js, index.html, style.css)

### Acceptance criteria verified:
- parseChatText exported: PASS
- matchVoiceToAudio exported: PASS
- assemblePlainText exported: PASS
- parseFolder exported: PASS
- parseTxt exported: PASS
- BOM stripping (U+FEFF literal in regex): PASS
- Directional mark stripping (U+200E, U+200F, U+202A-U+202E in text): PASS
- indexOf(': ') used for sender split: PASS
- '[Audio file missing]' annotation for unmatched voice: PASS
- '[Voice message: transcription pending]' for matched voice: PASS
- '[Audio not available]' for voice-omitted: PASS
- detectExportMode triple-condition guard: PASS
- parseZip returns { mode, messages, plainText, stats }: PASS
- parseFolder and parseTxt return same shape: PASS
- index.html without-media heading: PASS
- index.html 'Include Media' instruction: PASS
- index.html fine print 'Without Media option exports text only': PASS
- index.html webkitdirectory input: PASS
- index.html txt-input: PASS
- ui.js imports parseFolder and parseTxt: PASS
- ui.js processFolder and processTxt functions: PASS
- ui.js without-media routing: PASS
- css .voice-annotation italic + opacity: PASS
- Zero innerHTML for user data (non-comment lines): PASS
