# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-21)

**Core value:** A voice-message-inclusive WhatsApp chat log, fully transcribed offline, that gives Claude the complete conversation context
**Current focus:** Phase 1 — Parse Pipeline

## Current Position

Phase: 1 of 3 (Parse Pipeline)
Plan: 0 of 3 in current phase
Status: Ready to execute
Last activity: 2026-05-21 — Phase 1 planned (3 plans, 3 waves)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 1: Electron chosen as distribution target — eliminates `file://` and HTTP serving problems confirmed by research
- Phase 1: WhatsApp "with media" export required in v1; "without media" shows a friendly re-export explanation
- Phase 1: Parser must handle both Android (`PTT-*.opus`) and iOS (`00000023-AUDIO-*.opus`) filename patterns from day one
- Phase 2: Whisper Worker uses `onnx-community/whisper-tiny.en` at `dtype: 'q8'` (~40MB); sequential queue, not parallel

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
Stopped at: Phase 1 planned — ready to execute
Resume file: .planning/phases/01-parse-pipeline/01-01-PLAN.md
