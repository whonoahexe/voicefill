---
phase: 02-whisper-worker
plan: 02
subsystem: ui
tags: [css, animation, keyframe, whisper, voice-annotation, disabled-state]

requires:
  - phase: 02-01
    provides: "Worker lifecycle, updateRowInPlace() applying .resolved/.pending classes, #model-banner element, disableCopyDownload/enableCopyDownload"
provides:
  - "@keyframes transcript-appear — 350ms opacity fade-in for resolved voice rows"
  - ".voice-annotation.resolved — triggers transcript-appear animation with font-style: normal"
  - ".voice-annotation.pending — explicit italic 0.6 opacity pending state"
  - ".voice-annotation.error — italic with color-accent for unreadable audio rows"
  - "#model-banner — footnote-style model download indicator, display:none by default"
  - ".btn-primary:disabled / .btn-secondary:disabled — opacity 0.4, cursor not-allowed"
affects: [browser-uat, phase-3-electron-packaging]

tech-stack:
  added: []
  patterns:
    - "CSS class-driven animation: JS applies class, CSS defines keyframe — no JS animation code"
    - "Declarative :disabled fallback complements JS opacity control for cursor change"

key-files:
  created: []
  modified:
    - assets/css/style.css

key-decisions:
  - "350ms ease-in chosen for transcript-appear — within 300-500ms 'ink on parchment' range from CONTEXT.md"
  - ".voice-annotation.error updated to use color-accent to visually distinguish from pending/resolved states"
  - "#model-banner gets no border or background — must feel like a footnote, not a notification widget"
  - ":disabled CSS selectors added alongside JS opacity control — CSS provides cursor change, JS sets disabled attribute"

requirements-completed: [TRANS-03, TRANS-04, TRANS-05]

duration: ~5min
completed: 2026-05-21
---

# Phase 2 Plan 2: CSS Polish Summary

**Four Phase 2 CSS rule groups added to style.css: transcript-appear keyframe fade-in (350ms), voice-annotation pending/resolved/error states, footnote-style #model-banner, and :disabled button states with cursor:not-allowed**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-21T00:00:00Z
- **Completed:** 2026-05-21T00:05:00Z
- **Tasks:** 1 of 2 complete (Task 2 is a human-verify checkpoint)
- **Files modified:** 1

## Accomplishments

- Added `@keyframes transcript-appear` (opacity 0→1, 350ms ease-in forwards) — the "ink appearing on parchment" effect when a Whisper result arrives
- Added `.voice-annotation.resolved` — triggers the animation, sets font-style normal to visually distinguish from pending italic text
- Added `.voice-annotation.pending` — explicit italic 0.6 opacity state (matches base but now declarative)
- Updated `.voice-annotation.error` — italic with `color-accent` sepia tone for audio-unreadable rows
- Added `#model-banner` — 12px italic centered footnote, display:none by default, no border or background
- Added `.btn-primary:disabled` and `.btn-secondary:disabled` — opacity 0.4, cursor not-allowed

## Task Commits

1. **Task 1: Add Phase 2 CSS rules to style.css** - `7cd3ac4` (feat)

## Files Created/Modified

- `assets/css/style.css` — four new rule groups added; no existing rules removed or modified

## Decisions Made

- `350ms ease-in` for transcript-appear: within the 300-500ms "subtle ink" range specified in CONTEXT.md D-06
- `.voice-annotation.error` updated from the existing rule (was identical to base `opacity: 0.6`) to add `color: var(--color-accent)` — distinguishes unreadable audio rows from pending rows at a glance (Rule 2: missing critical visual distinction)
- `#model-banner` given no border, no background, no padding — consistent with D-07 "footnote, not a notification widget"
- `:disabled` CSS selectors cover both the `.btn-primary`/`.btn-secondary` class selectors and the specific `#btn-copy`/`#btn-download` ID selectors — ensures correct cursor regardless of which selector wins specificity

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated .voice-annotation.error to use color-accent**
- **Found during:** Task 1 (reviewing existing .voice-annotation.error rule)
- **Issue:** The existing `.voice-annotation.error` rule was identical to the base `.voice-annotation` rule (italic, opacity 0.6) — no visual distinction between pending and error states. Plan specified "add if no .error rule exists" but rule existed with no differentiation.
- **Fix:** Updated `.voice-annotation.error` to add `color: var(--color-accent)` and set opacity 0.7 — visually distinguishes unreadable-audio rows from pending-transcription rows
- **Files modified:** assets/css/style.css
- **Verification:** Static check passed; no existing rules removed
- **Committed in:** `7cd3ac4` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing visual distinction)
**Impact on plan:** Narrow fix improving .error state distinguishability. No scope creep.

## Issues Encountered

None — all static verification checks passed on first run.

## Known Stubs

None — all CSS rules are wired to class states applied by ui.js. No placeholder or hardcoded values flow to rendering.

## Threat Flags

None — CSS-only plan. No new trust boundaries. T-02-06 (textContent enforcement for .resolved) confirmed in 02-01 SUMMARY; CSS animation is class-driven, not content-driven.

## Next Phase Readiness

- All Phase 2 CSS dependencies are now in place for the human UAT checkpoint (Task 2)
- After checkpoint approval: Phase 2 is complete; Phase 3 (Electron packaging) may proceed
- Open: Safari Ogg/Opus decoding unresolved — v1 targets Chrome/Edge only (carried from Phase 1)

---
*Phase: 02-whisper-worker*
*Completed: 2026-05-21*
