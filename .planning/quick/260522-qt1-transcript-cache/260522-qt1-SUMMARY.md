---
quick_id: 260522-qt1
slug: transcript-cache
status: complete
date: 2026-05-22
---

# Summary: 260522-qt1 — Transcript Cache

## What Was Done

Added localStorage-based transcript caching so voice messages are not re-transcribed on
subsequent uploads of the same or an updated chat export.

### Task 1 — `assets/js/cache.js` (new)
- `getCachedTranscript(basename)` — reads from `voicefill_transcripts_v1` localStorage key
- `setCachedTranscript(basename, text)` — writes to same key
- All errors swallowed silently; cache is best-effort

### Task 2 — `assets/js/ui.js` (modified)
- Import added: `getCachedTranscript`, `setCachedTranscript` from `./cache.js`
- `dispatchTranscription`: splits voice messages into cached/uncached; applies cached results
  immediately via `updateRowInPlace`; only sends uncached to worker
- `onWorkerMessage`: saves `result` status transcripts to cache (errors are not cached)

## Behavior

- **First upload**: all voice messages transcribed normally, results cached in localStorage
- **Re-upload same chat**: all previously-transcribed messages resolve instantly from cache
- **Re-upload updated chat (new messages added)**: old messages resolve from cache, new voice
  messages after the last cached one are transcribed normally
- **`[No speech detected]`** is cached (valid stable result)
- **`[Audio unreadable]`** is NOT cached (transient decode error, may succeed on re-export)

## Files Changed

- `assets/js/cache.js` — created
- `assets/js/ui.js` — modified (3 changes: import, onWorkerMessage, dispatchTranscription)
- `.planning/STATE.md` — quick task row added
