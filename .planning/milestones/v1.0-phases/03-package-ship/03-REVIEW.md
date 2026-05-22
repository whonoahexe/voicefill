---
phase: 03-package-ship
reviewed: 2026-05-22T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - electron/main.js
  - index.html
  - assets/js/parser.js
  - assets/js/ui.js
findings:
  critical: 3
  warning: 4
  info: 2
  total: 9
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-05-22
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Four files were reviewed: the Electron main process entry point, the HTML shell, the ZIP/chat parser, and the UI state machine. The Electron main process and HTML are largely clean. The bugs are concentrated in `ui.js` and `worker.js` (read as a dependency). Three blockers were found: an undeclared variable that throws `ReferenceError` at runtime, a missing try/catch in `parseInstagram` that surfaces raw JSZip errors to users, and a worker init-error message that corrupts transcription progress counters. Four additional warnings cover race conditions, duplicate logic, and format edge cases.

---

## Critical Issues

### CR-01: `modelLoadMaxPct` is undeclared — `ReferenceError` on "Try another file"

**File:** `assets/js/ui.js:783`
**Issue:** The "Try another file" button click handler references `modelLoadMaxPct` which is never declared anywhere in `ui.js` or any imported module. Every time the user clicks "Try another file" after completing a transcription run, the handler throws `ReferenceError: modelLoadMaxPct is not defined`, which also prevents `showScreen('upload')` from executing — the user is stuck on the results screen with no way to process another file.

**Fix:** Either remove the assignment (the variable is never read after being set) or declare and maintain it at module scope alongside the other worker state variables. Since no other code reads this variable, the correct fix is simply to delete line 783:

```js
// In the btnTryAnother click handler — remove this line entirely:
// modelLoadMaxPct = 0;   ← DELETE

transcribeTotal = 0;
transcribeDone = 0;
pendingQueue = [];
showScreen('upload');
```

---

### CR-02: `parseInstagram` does not catch `JSZip.loadAsync` failures — raw exception leaks to caller

**File:** `assets/js/parser.js:413`
**Issue:** `parseZip` wraps `JSZip.loadAsync` in a try/catch and throws `'Invalid or corrupt ZIP file'`. `parseInstagram` calls `JSZip.loadAsync(file)` at line 413 with no try/catch. A corrupt or truncated ZIP will propagate a raw JSZip error (`Error: Corrupted zip or bug : unexpected signature`) directly to `processZipFile`, which catches it and displays `err.message` verbatim — a confusing internal error message shown to the user instead of a clean diagnostic.

**Fix:**

```js
// In parseInstagram(), replace the bare loadAsync call:
let zip;
try {
  zip = await JSZip.loadAsync(file);
} catch (_err) {
  throw new Error('Invalid or corrupt ZIP file');
}
```

---

### CR-03: Worker pipeline init-failure message corrupts transcription counter

**File:** `assets/js/worker.js:62-63` / `assets/js/ui.js:373-380`
**Issue:** When the Whisper pipeline fails to initialise (e.g., CDN unavailable, WebGPU crash), the worker emits `{ status: 'error', filename: null, message: '...' }`. In `onWorkerMessage` (ui.js line 373), any `status === 'error'` message unconditionally increments `transcribeDone`. If this fires before any user file is processed (i.e., `transcribeTotal` is still 0), the increment is harmless but leaves `transcribeDone = 1` before the next session. If it fires mid-session, `transcribeDone` advances past a real job's slot, potentially triggering `enableCopyDownload()` one step early and leaving one row permanently "pending".

Additionally, `updateRowInPlace({ status: 'error', filename: null })` calls `CSS.escape(null)` — which coerces to the string `"null"` and queries for a non-existent row — silently eating the error with no user feedback that the model failed to load.

**Fix:** In `onWorkerMessage`, distinguish init-failure (filename is null) from per-file errors:

```js
if (data.status === 'result' || data.status === 'error') {
  if (data.filename === null) {
    // Pipeline init failure — show banner error, do not touch counters
    if (modelBanner) {
      modelBanner.textContent = 'Model failed to load — please reload the app.';
      modelBanner.style.display = 'block';
    }
    return;
  }
  transcribeDone++;
  updateRowInPlace(data);
  updateSummaryLine(transcribeDone, transcribeTotal);
  if (transcribeDone === transcribeTotal) {
    enableCopyDownload();
  }
}
```

---

## Warnings

### WR-01: Race condition — concurrent decode errors can double-increment `transcribeDone`

**File:** `assets/js/ui.js:405-430`
**Issue:** `dispatchTranscription` uses `Promise.all` to decode all audio concurrently. If a decode throws, the error handler at line 410 increments `transcribeDone` and calls `enableCopyDownload()` when `transcribeDone === transcribeTotal`. But the worker message handler (`onWorkerMessage`) also increments `transcribeDone` for each `result` or `error` message it receives. If two decodes fail concurrently, both branches race to increment the same module-level counter without coordination. This can cause `enableCopyDownload()` to fire before all worker results are back, or the counter to exceed `transcribeTotal` (making `transcribeDone === transcribeTotal` permanently false for subsequent files in the same session).

**Fix:** Use a single authoritative counter path. Move decode errors through the same worker-response path, or guard the counter check with `Math.min`:

```js
// In the decode-error branch:
transcribeDone = Math.min(transcribeDone + 1, transcribeTotal);
updateRowInPlace({ status: 'error', filename: msg.basename });
updateSummaryLine(transcribeDone, transcribeTotal);
if (transcribeDone >= transcribeTotal) enableCopyDownload();
```

Apply the same `>=` guard in `onWorkerMessage` for symmetry.

---

### WR-02: `parseInstagram` does not guard against `allRawMessages` containing non-objects

**File:** `assets/js/parser.js:462-511`
**Issue:** `allRawMessages.map(msg => ...)` accesses `msg.sender_name`, `msg.content`, `msg.timestamp_ms`, `msg.audio_files`, and `msg.voice_media` without checking that `msg` is an object. Instagram JSON exports from older app versions occasionally contain `null` entries in the messages array (e.g., deleted messages). `null.sender_name` will throw `TypeError: Cannot read properties of null`, crashing the entire parse.

**Fix:**

```js
const messages = allRawMessages
  .filter(msg => msg !== null && typeof msg === 'object')
  .map(msg => { /* existing logic */ });
```

---

### WR-03: First `.txt` file in ZIP wins non-deterministically when `_chat.txt` is absent

**File:** `assets/js/parser.js:244-245`
**Issue:** The fallback logic `basename.endsWith('.txt') && chatEntry === null` picks the first `.txt` entry encountered during `zip.forEach`. JSZip does not guarantee iteration order, so ZIPs that contain both a legitimate chat file (named after the conversation) and incidental `.txt` files (e.g., `README.txt`, `links.txt`) may select the wrong file non-deterministically across platforms or JSZip versions. The same pattern exists in `parseFolder` at line 289.

**Fix:** Prefer files whose names match known WhatsApp chat filename patterns before falling back to any `.txt`:

```js
const WA_CHAT_PATTERN = /^WhatsApp Chat with .+\.txt$/i;

// During iteration:
if (basename === '_chat.txt') {
  chatEntry = zipEntry;
} else if (WA_CHAT_PATTERN.test(basename) && chatEntry === null) {
  chatEntry = zipEntry; // strong fallback
} else if (basename.endsWith('.txt') && chatEntry === null) {
  chatEntry = zipEntry; // weak fallback
}
```

---

### WR-04: `processInstagramJson` constructs `plainText` with raw template literals — multi-line message content produces malformed output

**File:** `assets/js/ui.js:641`
**Issue:** `plainText` is built as:
```js
messages.map(m => `${m.timestamp} - ${m.sender}: ${m.content}`).join('\n')
```
Instagram messages can contain embedded newlines in `m.content` (e.g., multi-paragraph messages). These embedded newlines are preserved verbatim, producing output where a single message's body spans multiple lines indistinguishable from separate message lines. The `.txt` download and clipboard copy will contain malformed data. The `assemblePlainText` function in `parser.js` has the same pattern (line 191) but only `processInstagramJson` is in scope for this review.

**Fix:** Either escape embedded newlines in content:
```js
const sanitized = m.content.replace(/\n/g, ' ');
```
or accept the format as intentional and document it — but this should be an explicit choice, not an accidental one.

---

## Info

### IN-01: `fixInstagramEncoding` is duplicated between `parser.js` and `ui.js`

**File:** `assets/js/ui.js:622-625` / `assets/js/parser.js:345-348`
**Issue:** An identical encoding-fix function is implemented twice: once as `fixInstagramEncoding` in `parser.js` (unexported) and again as the inline `fixEncoding` closure in `processInstagramJson`. The comment at ui.js line 621 acknowledges the duplication ("avoids importing a non-exported helper") but this is a maintenance hazard — if the `decodeURIComponent(escape(str))` pattern needs updating, both copies must change in sync.

**Fix:** Export `fixInstagramEncoding` from `parser.js` and import it in `ui.js`:
```js
// parser.js
export function fixInstagramEncoding(str) { ... }

// ui.js
import { ..., fixInstagramEncoding } from './parser.js';
```

---

### IN-02: Worker CDN import pins an exact version with no fallback or integrity check

**File:** `assets/js/worker.js:17`
**Issue:** `import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0'` pins to an exact CDN version. This is good for reproducibility, but there is no `integrity` attribute (Subresource Integrity) to guard against CDN compromise or content substitution. Since the worker runs in a privileged Electron renderer context with access to the file system via drag-and-drop operations, a compromised CDN response (however unlikely) could execute arbitrary code with renderer-process privileges.

**Fix:** Add SRI hash verification. Generate the hash after confirming the CDN content and add it to the CSP or use a dynamic import with integrity checking. At minimum, document that this CDN dependency is intentional and accepted as a known risk in the project's threat model.

---

_Reviewed: 2026-05-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
