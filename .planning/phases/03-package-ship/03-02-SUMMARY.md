---
phase: "03-package-ship"
plan: "02"
subsystem: "instagram-parser"
status: "complete"
tags: ["instagram", "parser", "encoding", "zip", "m4a"]
dependency_graph:
  requires: ["03-01"]
  provides: ["instagram-zip-parse", "instagram-json-parse"]
  affects: ["assets/js/parser.js", "assets/js/ui.js"]
tech_stack:
  added: []
  patterns: ["parseInstagram()", "fixInstagramEncoding()", "processZipFile()", "isInstagramJSON()"]
key_files:
  created: []
  modified:
    - assets/js/parser.js
    - assets/js/ui.js
decisions:
  - "fixInstagramEncoding() replicated inline in processInstagramJson() since parser.js helper is not exported — avoids exporting an internal helper"
  - "Instagram filename heuristic (includes('instagram')) used to route ZIP files — avoids double JSZip load for WhatsApp files"
  - "processZipFile() replaces direct processFile() calls for both drop and fileInput handlers — WhatsApp path via parseZip fallback preserved"
  - "processInstagramJson() does not call dispatchTranscription — text-only JSON mode has no audio files"
  - "Pitfall 6 guard: sort oldest-first applied to raw messages before mapping, not after — timestamp_ms is available on raw objects"
metrics:
  duration: "8m"
  completed_date: "2026-05-22"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 2
---

# Phase 3 Plan 2: Instagram Parser Summary

**One-liner:** Instagram ZIP and JSON export parsing via parseInstagram() in parser.js with oldest-first sort, Latin-1 encoding fix, m4a audio matching, and Instagram routing in ui.js via processZipFile() and processInstagramJson().

## Status: Complete

All 2 tasks completed.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add parseInstagram() to parser.js | a7b7bb5 | assets/js/parser.js |
| 2 | Wire Instagram route in ui.js | e976d61 | assets/js/ui.js |

## What Was Built

### Task 1: parseInstagram() — parser.js (a7b7bb5)

Three new non-exported helpers added before the export:

- `fixInstagramEncoding(str)`: Fixes Latin-1 garbled characters in Instagram JSON fields using `decodeURIComponent(escape(str))` (Pitfall 4 guard). Applied to `sender_name`, `content`, and `title` fields before storage.
- `isVoiceMessage(msg)`: Returns true if `audio_files` array is non-empty OR `voice_media` string is non-empty.
- `getInstagramAudioBasename(msg)`: Extracts `uri.split('/').pop()` for the first audio file entry (Pitfall 5 guard — uri is a full path, not a basename).

`export async function parseInstagram(file)` implementation:
1. Validates `.zip` extension — throws `'Instagram export must be a .zip file'`
2. 500MB size guard mirrors `parseZip()` (T-03-07)
3. JSZip guard for library load failure
4. Iterates ZIP entries: `.m4a` files go into `audioFiles` Map (basename → ZipObject); `message_N.json` files collected in `messageEntries`
5. Throws `'No Instagram message file found in ZIP'` if no JSON found
6. Parses all message JSON files, validates `participants` + `messages` arrays (throws `'Unrecognized format -- not an Instagram message export'` on invalid)
7. Merges all messages arrays and sorts ascending by `timestamp_ms` (Pitfall 6 guard)
8. Maps to MessageObject shape: text messages get `type:'text'`; voice messages with matched basename get `type:'voice', matched:true, audioEntry`; voice with missing file get `matched:false, annotation:'[Audio file missing]'`; `voice_media` CDN URL produces `matched:false, annotation:'[Instagram voice: media expired — download the export again]'` (T-03-08)
9. Returns `{ mode:'with-media', exportMode:'instagram', messages, audioFiles, plainText, stats }`

### Task 2: Instagram routing — ui.js (e976d61)

`parseInstagram` added to import line from `./parser.js`.

New functions:

- `isInstagramJSON(parsed)`: Checks `Array.isArray(parsed.participants) && Array.isArray(parsed.messages) && typeof parsed.thread_path === 'string'` (D-07 detection heuristic)
- `async function processZipFile(file)`: Routes ZIP files — if filename includes `'instagram'`, tries `parseInstagram(file)` first; falls back to `parseZip(file)` only if error message starts with `'Unrecognized format'` (non-Instagram ZIP with instagram in name). All other filenames go straight to `parseZip(file)`. Enforces 300ms minimum processing display, routes to results or without-media screen identically to the existing `processFile()` pattern.
- `async function processInstagramJson(file)`: Handles drop-only standalone `.json` files. Loads file text, parses JSON, checks `isInstagramJSON()`. If valid: sorts `parsed.messages` by `timestamp_ms` ascending, maps to text-only MessageObject shape (with inline `fixEncoding()` helper), calls `renderChatLog()` + `showScreen('results')`. Does NOT call `dispatchTranscription()` — no audio in text-only mode. If invalid: shows parse error.

Updated event handlers:
- Drop handler: now routes `.zip` → `processZipFile(file)`, `.json` → `processInstagramJson(file)`, other extensions silently ignored (unchanged behavior)
- `fileInput` change handler: now calls `processZipFile(file)` instead of `processFile(file)`

Unchanged handlers: `folderInput` (calls `processFolder`), `txtInput` (calls `processTxt`), all navigation handlers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cleaned up redundant intermediate sort in processInstagramJson**
- **Found during:** Task 2 implementation
- **Issue:** Initial draft of `processInstagramJson()` created an unused `messages` array with a no-op sort before re-creating `sortedMessages` via correct sort — dead code that could confuse future readers
- **Fix:** Removed the intermediate array; kept only `sortedRaw` → `messages` pipeline with correct `timestamp_ms` sort
- **Files modified:** assets/js/ui.js (during same task, no separate commit)

## Threat Surface Scan

All threat model items from the plan are mitigated:

| Threat | Mitigation Applied |
|--------|-------------------|
| T-03-05: Instagram sender_name/content → DOM | textContent enforced — renderMessage() unchanged; processInstagramJson uses textContent via renderChatLog() |
| T-03-06: audio_files[].uri path traversal | Only basename extracted via split('/').pop(); Map lookup only, never filesystem resolution |
| T-03-07: Instagram ZIP bomb | 500MB size guard present in parseInstagram() |
| T-03-08: voice_media https:// URL injection | URL produces static annotation string via textContent; URL never fetched or rendered as HTML |

## Known Stubs

None — all Instagram parsing paths produce real data or documented fallback annotations. No hardcoded empty values flow to UI rendering.

## Self-Check

### Files Modified

- [x] `assets/js/parser.js` — parseInstagram export confirmed by grep
- [x] `assets/js/ui.js` — processZipFile, isInstagramJSON, processInstagramJson confirmed by grep

### Commits

- [x] a7b7bb5 — `feat(03-02): add parseInstagram() to parser.js — PARSE-05`
- [x] e976d61 — `feat(03-02): wire Instagram route in ui.js — PARSE-05`

## Self-Check: PASSED
