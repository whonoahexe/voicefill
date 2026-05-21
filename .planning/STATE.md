# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-21)

**Core value:** A voice-message-inclusive WhatsApp chat log, fully transcribed offline, that gives Claude the complete conversation context
**Current focus:** Phase 1 — Parse Pipeline

## Current Position

Phase: 1 of 3 (Parse Pipeline)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-05-21 — Plan 01-01 (Walking Skeleton) complete

Progress: [█░░░░░░░░░] 11%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 3m
- Total execution time: 3m

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1: Parse Pipeline | 1 | 3m | 3m |

**Recent Trend:**
- Last 5 plans: 01-01 (3m)
- Trend: baseline

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 1: Electron chosen as distribution target — eliminates `file://` and HTTP serving problems confirmed by research
- Phase 1: WhatsApp "with media" export required in v1; "without media" shows a friendly re-export explanation
- Phase 1: Parser must handle both Android (`PTT-*.opus`) and iOS (`00000023-AUDIO-*.opus`) filename patterns from day one
- Phase 2: Whisper Worker uses `onnx-community/whisper-tiny.en` at `dtype: 'q8'` (~40MB); sequential queue, not parallel
- 01-01: JSZip loaded as classic script before ES module entry point — UMD build registers window.JSZip; load order is critical
- 01-01: worker.js never constructed in Phase 1 — stub defines Phase 2 postMessage interface only
- 01-01: innerHTML banned for all user-supplied content — textContent enforced throughout parser.js and ui.js

### Pending Todos

None yet.

### Blockers/Concerns

- Research open question: Safari Ogg/Opus decoding is unresolved — v1 targets Chrome/Edge only; test in Phase 2
- Research open question: Verify `pipeline()` accepts `Float32Array` directly without intermediate Blob URL (Phase 2)
- Instagram format (PARSE-05) deferred to Phase 3; may be incomplete if live format verification is blocked

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2 | Multi-locale date parsing | Planned | Init |
| v2 | Whisper model selection (tiny vs base) | Planned | Init |
| v2 | Language auto-detect | Planned | Init |
| v2 | Dark mode | Planned | Init |

## Session Continuity

Last session: 2026-05-21
Stopped at: Plan 01-01 complete — Walking Skeleton delivered; ready to execute 01-02
Resume file: .planning/phases/01-parse-pipeline/01-02-PLAN.md
