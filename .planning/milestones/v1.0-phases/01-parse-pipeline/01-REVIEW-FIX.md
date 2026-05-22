---
phase: 01-parse-pipeline
fixed_at: 2026-05-21T00:00:00Z
review_path: .planning/phases/01-parse-pipeline/01-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-05-21T00:00:00Z
**Source review:** .planning/phases/01-parse-pipeline/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: `processTxt` calls undefined `renderSkeletonResults` — runtime crash

**Files modified:** `assets/js/ui.js`
**Commit:** 127cc98
**Applied fix:** Replaced the stale `renderSkeletonResults(result)` call at line 275 with `renderChatLog(result)`, which is the correct function defined in the same file and used by all other parse paths.

---

### CR-02: `assemblePlainText` dereferences `msg.sender` without guard — crash on system messages

**Files modified:** `assets/js/parser.js`
**Commit:** 224e19b
**Applied fix:** Changed the template literal in `assemblePlainText` from `${msg.sender}` to `${msg.sender ?? ''}`, making it consistent with the DOM-safe guard already present in `renderMessage` in `ui.js`.

---

### WR-01: `dragend` does not remove `drag-over` class — class can get stuck on abort

**Files modified:** `assets/js/ui.js`
**Commit:** 129bee7
**Applied fix:** Added a `dragend` event listener on `dropZone` immediately after the `dragleave` listener. Both now call `dropZone.classList.remove('drag-over')`, covering both the normal leave path and the abort-outside-window path.

---

### WR-02: `JSZip` consumed as an implicit global — opaque failure if script load fails

**Files modified:** `assets/js/parser.js`
**Commit:** 76784e9
**Applied fix:** Added an explicit `typeof JSZip === 'undefined'` guard at the top of `parseZip`, before `JSZip.loadAsync`. Throws `'ZIP library failed to load — please reload the application'` instead of letting the `ReferenceError` be caught and re-reported as `'Invalid or corrupt ZIP file'`.

---

### WR-03: `.txt` fallback in ZIP and folder parsers accepts any `.txt` file silently

**Files modified:** `assets/js/parser.js`
**Commit:** f10dc21
**Applied fix:** Removed the `else if (basename.endsWith('.txt') && chatEntry === null)` fallback branch from both `parseZip` and `parseFolder`. Both now require an exact `_chat.txt` match; the existing `'No _chat.txt found in ZIP'` / `'No _chat.txt found in selected folder'` errors surface naturally for non-WhatsApp ZIPs and folders.

---

### WR-04: `detectExportMode` incorrectly routes `.txt`-only exports to the without-media error screen

**Files modified:** `assets/js/parser.js`
**Commit:** 689fc1e
**Applied fix:** Replaced the `detectExportMode(...)` call in `parseTxt` with `const mode = 'with-media'`. The `hasOmitted` destructuring was also removed since it is no longer used. Voice-omitted messages in a `.txt`-only load display as `'[Audio not available]'` on the results screen as intended.

---

## Skipped Issues

None — all 6 in-scope findings were fixed.

---

_Fixed: 2026-05-21T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
