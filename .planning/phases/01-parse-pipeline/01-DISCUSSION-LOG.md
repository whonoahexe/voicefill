# Phase 1: Parse Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 1-Parse Pipeline
**Areas discussed:** Code structure, UI flow, Output presentation

---

## Code Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Modular — separate files | index.html + parser.js + ui.js + worker.js stub. ES modules. Needs dev server. | ✓ |
| Single HTML file | All HTML/CSS/JS inline. No dev server needed but unwieldy for Phase 2 Worker. | |

**User's choice:** Modular — separate files

| Option | Description | Selected |
|--------|-------------|----------|
| Vendored in assets/lib/ | Download jszip.min.js once, reference locally. Offline-safe. | ✓ |
| CDN at load time | Load from jsDelivr/unpkg. Breaks offline, adds a Phase 3 caching task. | |

**User's choice:** Vendored in assets/lib/

**Notes:** No additional questions needed — user moved to next area.

---

## UI Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Step-by-step screens | Upload → Processing → Results. One action at a time. | ✓ |
| All-on-one-page | Upload zone stays; results appear below. Upload zone becomes dead space. | |

**User's choice:** Step-by-step screens

| Option | Description | Selected |
|--------|-------------|----------|
| Replace upload screen with error state | Upload zone transforms to error + re-export instructions + Try again. | ✓ |
| Inline warning below drop zone | Upload zone stays; error expands below. Breaks step-by-step flow. | |

**User's choice:** Replace upload screen with dedicated error state

**Notes:** No additional questions needed — user moved to next area.

---

## Output Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Raw textarea — monospace, scrollable | Exact text that gets pasted. Simple, WYSIWYG copy. | |
| Styled chat replica | Sender names, timestamps, voice entries visually distinct. More engaging. | ✓ |

**User's choice:** Styled chat replica

| Option | Description | Selected |
|--------|-------------|----------|
| Plain text version (copy) | Clipboard captures raw reconstructed text — what Claude actually receives. | ✓ |
| Styled HTML (copy) | Copies HTML. Pastes as rich text or garbage depending on target. | |

**User's choice:** Plain text version for clipboard

**Notes:** Styled display is for human readability; the clipboard content is the plain text reconstruction.

---

## Claude's Discretion

- Processing screen visual treatment (calm, parchment-consistent — no spinner)
- File structure within `assets/` subdirectories
- Exact visual treatment of the "without media" error screen
- Placeholder format chosen as `[Voice message: transcription pending]` to clearly distinguish from Phase 2's live transcripts

## Deferred Ideas

None — discussion stayed within phase scope.
