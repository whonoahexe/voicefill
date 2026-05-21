---
phase: 01-parse-pipeline
reviewed: 2026-05-21T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - assets/css/style.css
  - assets/js/main.js
  - assets/js/parser.js
  - assets/js/ui.js
  - assets/js/worker.js
  - index.html
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-05-21T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Six files covering the complete Phase 1 parse pipeline were reviewed: the upload/results HTML shell, the CSS design system, the ES module entry point, the ZIP/folder/txt parser, the UI state machine, and the Phase 1 worker stub. The XSS posture is sound — all user-supplied content is set via `textContent` throughout. The ZIP path-traversal guard is correct. The most serious defect is a dead-function call in `processTxt` that will crash at runtime. A second critical issue is that `assemblePlainText` is missing a null guard on `msg.sender`, which causes a runtime exception for system messages that somehow reach the code path. Four warnings cover an untriggered `dragend` class leak, the `JSZip` global dependency being implicit and untested, a `.txt` fallback that silently accepts non-chat text files, and the `detectExportMode` logic being reachable in a state where it returns `'with-media'` incorrectly for parse-only `.txt` files containing only `<Media omitted>` lines. Three info items cover a TODO in the CSS, a redundant Google Fonts double-load, and a leftover `rawLines` field in the `parseZip` return value.

---

## Critical Issues

### CR-01: `processTxt` calls undefined `renderSkeletonResults` — runtime crash

**File:** `assets/js/ui.js:275`
**Issue:** `processTxt` calls `renderSkeletonResults(result)` at line 275. That function was the Phase 01-01 skeleton helper and was replaced by `renderChatLog`. The function is not defined anywhere in `ui.js` or imported from any module. Every `.txt` file load will throw `ReferenceError: renderSkeletonResults is not defined`, silently swallowing the error inside the `try/catch` at the call site — which is *outside* this code path, so the error propagates uncaught and the UI freezes on the processing screen.

**Fix:**
```js
// assets/js/ui.js line 275 — replace:
renderSkeletonResults(result);

// with:
renderChatLog(result);
```

---

### CR-02: `assemblePlainText` dereferences `msg.sender` without guard — crash on system messages that pass the `if` filter

**File:** `assets/js/parser.js:187`
**Issue:** `assemblePlainText` skips `type === 'system'` at line 171 with `continue`. All other branches build a line with `${msg.sender}`. However, `msg.sender` is `undefined` for system messages (the object has no `sender` key). The `continue` guard is correct *today*, but the template literal at line 187 executes for every non-system type (`voice`, `voice-omitted`, `text`). For `voice-omitted` messages, `sender` is populated correctly. The real risk is that a future code path (or a continuation-line edge case) could produce a non-system message without a `sender`, producing `"undefined"` injected literally into the plain-text output. Additionally, in `renderMessage` in `ui.js` (line 67), `msg.sender` is guarded with `(msg.sender || '')` for the DOM, but `assemblePlainText` has no such guard for the text output. These two parallel code paths are inconsistent — the DOM is safe, the plain-text output is not.

**Fix:**
```js
// assets/js/parser.js line 187 — replace:
lines.push(`${msg.timestamp} - ${msg.sender}: ${body}`);

// with:
lines.push(`${msg.timestamp} - ${msg.sender ?? ''}: ${body}`);
```

---

## Warnings

### WR-01: `dragleave` removes `drag-over` class but `dragend` does not — class can get stuck on abort

**File:** `assets/js/ui.js:315`
**Issue:** The drop zone handles `dragenter`, `dragover`, `dragleave`, and `drop`. If the user begins a drag but releases outside the browser window (or presses Escape), the browser fires `dragend` on the drag source — not `dragleave` on the target. The `drag-over` styling class will remain on the drop zone permanently until the next successful drag interaction. No `dragend` listener is registered on `dropZone`.

**Fix:**
```js
// Add after the existing dragleave listener:
dropZone.addEventListener('dragend', () => {
  dropZone.classList.remove('drag-over');
});
```

---

### WR-02: `JSZip` consumed as an implicit global — no existence check, opaque failure if script load fails

**File:** `assets/js/parser.js:217`
**Issue:** `parseZip` calls `JSZip.loadAsync(file)` where `JSZip` is expected to exist as `window.JSZip` injected by the classic `<script src="assets/lib/jszip.min.js">` tag in `index.html`. If the script tag fails to load (file missing, CSP violation, Electron preload interference) the error produced is `ReferenceError: JSZip is not defined`, which is caught by the generic `catch` block and re-thrown as `'Invalid or corrupt ZIP file'` — a misleading error message that will confuse the user and make the failure invisible during debugging.

**Fix:**
```js
// At the top of parseZip, before loadAsync:
if (typeof JSZip === 'undefined') {
  throw new Error('ZIP library failed to load — please reload the application');
}
```

---

### WR-03: `.txt` fallback in ZIP and folder parsers accepts any `.txt` file, not just `_chat.txt`

**File:** `assets/js/parser.js:235` and `assets/js/parser.js:281`
**Issue:** Both `parseZip` and `parseFolder` include a fallback: if `_chat.txt` is not found, the first `.txt` file encountered is used as the chat log. WhatsApp ZIPs often contain other `.txt` files (e.g., `STK-*.txt` sticker metadata or readme files). If a ZIP has one of these before `_chat.txt` in iteration order, the wrong file is parsed silently — producing zero messages and no error. The `chatEntry === null` guard on the fallback does not help if the wrong `.txt` is found first, because iteration order is not deterministic across JSZip versions.

**Fix:**
```js
// In zip.forEach callback, remove the txt fallback entirely or make it explicit:
if (basename === '_chat.txt') {
  chatEntry = zipEntry;
}
// Do not set chatEntry for other .txt files in Phase 1.
// If no _chat.txt is found, throw the existing 'No _chat.txt found in ZIP' error.
```

---

### WR-04: `detectExportMode` returns `'with-media'` for a `.txt`-only export containing only `<Media omitted>` lines if at least one voice-omitted message exists without audio files

**File:** `assets/js/parser.js:151-156`
**Issue:** `detectExportMode` returns `'without-media'` only when `hasOmitted && audioFiles.size === 0 && voiceMatched === 0`. This works correctly for `parseZip`. However, for `parseTxt` (parse-only mode), `audioFiles` is always an empty `Map` and `voiceMatched` is always 0. If the `.txt` file is a "without-media" export (all voice lines are `<Media omitted>`), `hasOmitted` will be `true`, `audioFiles.size` will be `0`, and `voiceMatched` will be `0` — so `detectExportMode` returns `'without-media'` and the user is routed to the error screen with instructions to re-export. But `parseTxt` is the mode for users who only have the text file. The function comment at line 308 claims "Mode is always 'with-media'" for this path, which is incorrect when the `.txt` file is itself a without-media export.

There is no functional guard in `processTxt` to override the mode — it relies on the comment being true. This is a silent routing error.

**Fix:**
```js
// In parseTxt, override mode after detectExportMode:
// Always treat parse-only .txt as 'with-media' so the results screen is shown.
// Voice-omitted messages are displayed as '[Audio not available]'.
const mode = 'with-media'; // intentional override — no audio available regardless of export type
```

---

## Info

### IN-01: CSS double-loads Google Fonts — HTTP request duplicated

**File:** `assets/css/style.css:2` and `index.html:9`
**Issue:** `style.css` line 2 has `@import url('https://fonts.googleapis.com/...')`. `index.html` lines 7-9 also includes `<link rel="preconnect">` and a separate `<link href="https://fonts.googleapis.com/...">` tag for the same family and weights. In a browser both load simultaneously, resulting in two requests for the same font CSS. The `<link>` in HTML is the correct/faster approach (avoids FOUC); the `@import` in CSS is redundant.

**Fix:** Remove the `@import` from `assets/css/style.css` lines 1-2. Keep the `<link>` tags in `index.html`.

---

### IN-02: `rawLines` in `parseZip` return value is a stale backward-compat artifact

**File:** `assets/js/parser.js:257-259`
**Issue:** The `parseZip` return value includes `rawLines` (line 259): an array of non-blank raw lines kept "for backward compat (Plan 01-01 skeleton used it; Plan 01-03 removes it)". The comment acknowledges it should be removed. No call site in `ui.js` reads `rawLines`. Leaving it in means the raw chat text lines are kept in memory unnecessarily for the lifetime of the result object.

**Fix:** Remove lines 257-259 from `parseZip` and remove `rawLines` from the return value destructuring comment.

---

### IN-03: CSS `TODO` for font bundling left in production source

**File:** `assets/css/style.css:3`
**Issue:** `/* TODO: bundle font for Phase 3 (Electron offline) */` is a tracked task left as a comment in a shipped source file. It is not actionable by the CSS engine and will appear in any built artifact.

**Fix:** Track this as a Phase 3 backlog item in `.planning/` rather than a source comment. Remove the comment from `style.css`.

---

_Reviewed: 2026-05-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
