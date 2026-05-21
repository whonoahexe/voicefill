# Phase 1: Parse Pipeline - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the complete end-to-end parse pipeline with placeholder transcripts. A user drops a WhatsApp export ZIP (or uses a file picker), the app parses `_chat.txt`, matches `.opus` audio files to voice message lines, and displays a reconstructed chat log with voice message positions identified. Error states are annotated inline. The user can copy the full log to clipboard or download it as `.txt`. No ML or transcription in this phase — voice message positions get placeholder annotations. Parchment aesthetic and monospace typography are fully implemented.

</domain>

<decisions>
## Implementation Decisions

### Code Structure
- **D-01:** Modular file organization — `index.html` as entry point + separate `assets/js/parser.js`, `assets/js/ui.js`, and a stub `assets/js/worker.js` (placeholder for Phase 2's real Whisper Worker). ES modules via `<script type="module">`.
- **D-02:** A local dev server is required for development (`npx serve .` or equivalent) — ES modules do not work over `file://`. Phase 3's Electron renderer replaces this.
- **D-03:** JSZip 3.x vendored to `assets/lib/jszip.min.js` — downloaded once, no CDN dependency at runtime. Referenced via a relative `<script>` tag before modules load.

### UI Interaction Flow
- **D-04:** Step-by-step screens — one primary state at a time. Three distinct screens:
  1. **Upload screen** — drag-and-drop zone + file picker button (the landing state)
  2. **Processing screen** — brief parsing indicator (no ML yet, so this is very fast)
  3. **Results screen** — reconstructed chat log + summary + copy/download actions
- **D-05:** "Without media" export detection replaces the upload screen with a dedicated error state — clear explanation + re-export instructions + "Try again" button to return to upload screen. No modal/overlay — the screen itself transforms.

### Output Presentation
- **D-06:** Styled chat replica — the results screen renders the reconstructed chat log as a visually formatted display: timestamps dimmed, sender names in accent color, voice message annotations (`[Voice message: transcription pending]`) visually distinct (e.g., italic or muted). Maintains the parchment aesthetic.
- **D-07:** Copy to clipboard captures the **plain text version** of the reconstructed log (not styled HTML). The styled display is for human readability; the clipboard content is what Claude receives. Format: raw `_chat.txt` structure with voice placeholders substituted inline.
- **D-08:** Download as `.txt` uses the same plain text as the clipboard — the raw reconstructed log.

### Placeholder Transcript Format
- **D-09:** During Phase 1, voice message positions are annotated as `[Voice message: transcription pending]`. This is visually distinct from Phase 2's live transcripts (`[Voice message: "...text..."]`) — allows Phase 2 to clearly replace them.

### Error Annotations (inline in output)
- **D-10:** Annotation labels follow the REQUIREMENTS.md spec:
  - `[Audio unreadable]` — corrupt/undecodable `.opus`
  - `[Audio file missing]` — voice line in chat has no matching audio file
  - `[Audio not available]` — parse-only mode (INPUT-04, `.txt` without audio)
  - `[Voice message: transcription pending]` — matched audio file, placeholder for Phase 2

### Claude's Discretion
- Processing screen visual: a calm, parchment-consistent loading state. No spinner — a subtle animated ellipsis or progress text consistent with UI-04's "visually calm and deliberate" requirement.
- File structure within `assets/`: organizer's choice — `js/`, `css/`, `lib/` subdirectories expected.
- Exact visual treatment of the "without media" error screen — fits the design system, no specific preference stated.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Scope
- `.planning/REQUIREMENTS.md` — Full v1 requirements with REQ-IDs. Phase 1 covers: INPUT-01–04, PARSE-01–04, ERR-01–04, OUT-01–04, UI-01–04
- `.planning/ROADMAP.md` §Phase 1 — Phase goal, success criteria, and plan breakdown (01-01 and 01-02)
- `.planning/PROJECT.md` — Core value, constraints, and Key Decisions table

### Design System
- `CLAUDE.md` §Design System — Color palette, typography, aesthetic spec (parchment, Courier Prime, noise/grain texture)

### No external specs — requirements fully captured in decisions above

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet — greenfield project. No existing components or utilities.

### Established Patterns
- None yet — this phase establishes the baseline patterns for Phases 2 and 3.

### Integration Points
- `assets/js/worker.js` stub created in this phase must export the same interface Phase 2's real Worker will implement — so Phase 2 can drop in the real Worker without touching `ui.js`.

</code_context>

<specifics>
## Specific Ideas

- The styled chat replica should feel like reading a physical letter being reconstructed — the aesthetic framing from PROJECT.md ("reconstructing a physical letter") should inform how chat entries are rendered.
- Voice message annotations should be visually identifiable at a glance in the styled view, since the primary use case is a human scanning the output before pasting into Claude.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Parse Pipeline*
*Context gathered: 2026-05-21*
