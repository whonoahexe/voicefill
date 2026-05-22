# Walking Skeleton — VoiceFill Phase 1

> The thinnest possible end-to-end slice that proves every integration seam works before adding full scope.

---

## What the Skeleton Delivers

A user can drop a WhatsApp export ZIP onto a parchment-styled browser page, the ZIP is extracted using JSZip, `_chat.txt` lines are iterated, and those lines are displayed as plain text in the browser — proving the complete data flow from file input to DOM render works end-to-end.

**Skeleton data flow:**
```
File drop (drag-and-drop)
  → JSZip.loadAsync(file)
    → zip.forEach() — find _chat.txt, build audioFiles Map
      → chatEntry.async('string')
        → split('\n') — raw lines array
          → DOM render (textContent per line, monospace display)
```

No full parser, no voice matching, no error handling — just the pipe, proven green.

---

## Architectural Decisions (locked for all phases)

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Entry point | `index.html` | Single-file app shell; loads JSZip then ES module main |
| JS organization | ES modules: `main.js`, `parser.js`, `ui.js`, `worker.js` | D-01: modular, importable, testable in Phase 2 |
| JSZip loading | Classic `<script src="assets/lib/jszip.min.js">` before module tag | UMD build registers `window.JSZip`; must precede module evaluation |
| ZIP path normalization | `zip.forEach` + basename Map, never full-path lookup | WhatsApp nests files in a chat-named subfolder; full-path lookup returns undefined |
| DOM rendering | `element.textContent` exclusively for user data | XSS prevention; chat content is arbitrary text |
| CSS grain texture | SVG noise `background-image` at 3–5% opacity on `body` | UI-01 parchment aesthetic |
| Screen management | `display: none` / `display: block` toggling by screen ID | D-04: no CSS transitions, instant swap |
| Dev server | `npx serve .` (or equivalent) on port 3000 | D-02: ES modules require HTTP context |
| Distribution | Electron (Phase 3) | Eliminates file:// restrictions; not wired until Phase 3 |

---

## Directory Layout (established by Plan 01-01)

```
voicefill/
├── index.html                  # Entry point — loads jszip.min.js then main.js
├── assets/
│   ├── css/
│   │   └── style.css           # All styles — parchment design system, screen states
│   ├── js/
│   │   ├── main.js             # Module entry — imports ui.js; wires events
│   │   ├── parser.js           # ZIP extraction + chat parsing + output assembly
│   │   ├── ui.js               # DOM manipulation; screen transitions; event binding
│   │   └── worker.js           # STUB — defines Phase 2 postMessage interface
│   └── lib/
│       └── jszip.min.js        # JSZip 3.10.1, vendored (source: cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js)
└── .planning/                  # GSD planning artifacts
```

---

## Integration Seams Proven by Skeleton

| Seam | Proven By | Failure Mode If Broken |
|------|-----------|------------------------|
| File drop → browser File object | dragover + drop events on `#drop-zone` | Files never reach JSZip |
| File object → JSZip load | `JSZip.loadAsync(file)` in parser.js | ReferenceError: JSZip is not defined (if load order wrong) |
| JSZip → `_chat.txt` extraction | `zip.forEach` + `chatEntry.async('string')` | "No _chat.txt found" error |
| Raw text → DOM lines | `split('\n')` + `textContent` per line | Blank results screen |
| CSS load | `<link rel="stylesheet" href="assets/css/style.css">` | Unstyled page |

---

## Phase 2 Compatibility Contract

`worker.js` stub defines the postMessage protocol Phase 2 will implement. Phase 2 replaces the stub body — `ui.js` is NOT touched.

**Main thread → Worker:**
```
{ type: 'transcribe', audioData: Uint8Array, filename: string, index: number, total: number }
```

**Worker → Main thread:**
```
{ status: 'result', filename: string, text: string, index: number, total: number }
{ status: 'error',  filename: string, message: string }
{ status: 'ready' }
```

---

## Phase 3 Compatibility Notes

- Google Fonts `@import` for Courier Prime is acceptable in Phase 1 (local dev server). `style.css` includes a `TODO: bundle font for Phase 3` comment — Electron offline font strategy is Phase 3 research.
- `index.html` and file paths use relative references throughout — no absolute paths — so Electron renderer can serve without remapping.

---

## What the Skeleton Does NOT Include

- Full `_chat.txt` parser (voice line detection, BOM stripping, sender extraction) — Plan 01-02
- Voice-to-audio matching and error annotations — Plan 01-02
- "Without media" error screen — Plan 01-02
- Styled chat log (timestamps dimmed, sender in accent, voice annotations italic) — Plan 01-03
- Copy to clipboard / Download .txt — Plan 01-03
- All four input modes fully wired (folder, .txt only) — Plan 01-02
