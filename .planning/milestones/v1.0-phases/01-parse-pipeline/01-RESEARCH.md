# Phase 1: Parse Pipeline - Research

**Researched:** 2026-05-21
**Domain:** WhatsApp export parsing, ZIP extraction, vanilla JS UI, drag-and-drop file input
**Confidence:** HIGH

---

## Summary

Phase 1 delivers the complete end-to-end parse pipeline without any ML. A user drops or picks a WhatsApp export ZIP; the app extracts `_chat.txt` and matches `.opus` audio files to voice message lines; the reconstructed chat log is displayed with placeholder annotations and is copyable as plain text. No transcription occurs in this phase.

The stack is fully decided: vanilla HTML/CSS/JS with ES modules, JSZip 3.x vendored, no build pipeline. All architectural patterns are established (modular files, three-screen flow, state machine). The primary research value for this phase is the exact parsing logic for WhatsApp format variants, the correct JSZip API usage patterns to avoid the known ZIP path gotcha, the CSS-only animated ellipsis, and the Worker stub interface that Phase 2 must drop into.

The biggest risks in Phase 1 are (1) WhatsApp format variation - the parser must handle both Android and iOS filename patterns plus BOM/RTL marks from day one, and (2) ZIP subfolder path normalization - naive `zip.files[filename]` lookups fail on real WhatsApp exports because files live inside a named subfolder. Both are well-understood and have clear mitigations.

**Primary recommendation:** Build parser.js first (ZIP extraction + `_chat.txt` parsing + voice line detection + output assembly), then wire up ui.js (three-screen state machine), then style to the UI-SPEC. The worker.js stub is created last - it only needs to define the message protocol interface for Phase 2 compatibility.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Modular file organization - `index.html` as entry point + separate `assets/js/parser.js`, `assets/js/ui.js`, and a stub `assets/js/worker.js` (placeholder for Phase 2's real Whisper Worker). ES modules via `<script type="module">`.
- **D-02:** A local dev server is required for development (`npx serve .` or equivalent) - ES modules do not work over `file://`. Phase 3's Electron renderer replaces this.
- **D-03:** JSZip 3.x vendored to `assets/lib/jszip.min.js` - downloaded once, no CDN dependency at runtime. Referenced via a relative `<script>` tag before modules load.
- **D-04:** Step-by-step screens - one primary state at a time. Three distinct screens: (1) Upload, (2) Processing, (3) Results.
- **D-05:** "Without media" export detection replaces the upload screen with a dedicated error state - clear explanation + re-export instructions + "Try again" button. No modal/overlay.
- **D-06:** Styled chat replica in results - timestamps dimmed, sender names in accent color, voice annotations italic/muted.
- **D-07:** Copy to clipboard captures plain text version (not styled HTML).
- **D-08:** Download as `.txt` uses the same plain text as clipboard.
- **D-09:** Placeholder annotation: `[Voice message: transcription pending]`.
- **D-10:** Annotation labels: `[Audio unreadable]`, `[Audio file missing]`, `[Audio not available]`, `[Voice message: transcription pending]`.

### Claude's Discretion
- Processing screen visual: calm, parchment-consistent. No spinner - subtle animated ellipsis or progress text.
- File structure within `assets/`: `js/`, `css/`, `lib/` subdirectories.
- Exact visual treatment of the "without media" error screen.

### Deferred Ideas (OUT OF SCOPE)
- None - discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INPUT-01 | Drag-and-drop ZIP onto upload area | HTML5 drag-drop events; `dragenter`/`dragover`/`dragleave`/`drop` on drop zone `<div>` |
| INPUT-02 | File picker button (click-to-browse fallback) | `<input type="file" accept=".zip">` visually hidden; triggered by button `.click()` |
| INPUT-03 | Folder of extracted files (already-unzipped) | `<input type="file" webkitdirectory>` - browser reads entire folder; parse files from `FileList` without JSZip |
| INPUT-04 | Raw `.txt` chat log (parse-only, no audio) | `<input type="file" accept=".txt">` or text drop; parse `_chat.txt` directly; all voice lines get `[Audio not available]` |
| PARSE-01 | Detect "with media" exports; extract `_chat.txt` + `.opus` files from ZIP | JSZip `loadAsync(file)` then iterate entries; key `.opus` files by basename |
| PARSE-02 | Detect "without media" exports and show error | Chat parse step: if voice lines contain only `<Media omitted>` AND no `.opus` files in ZIP, show error screen |
| PARSE-03 | Handle Android (`PTT-*.opus`) and iOS (`00000023-AUDIO-*.opus`) filename patterns | Detect `.opus (file attached)` suffix; match by basename; regex covers both patterns |
| PARSE-04 | Handle `_chat.txt` format variations: strip BOM, Unicode directional marks, US-locale date | Strip on load; detect date format from first parseable lines; US M/D/YY as v1 baseline |
| ERR-01 | "Without media" export - friendly error with re-export instructions | Screen replacement (D-05); no modal |
| ERR-02 | Corrupt/undecodable `.opus` - annotate `[Audio unreadable]` and continue | Phase 1 defers actual decode to Phase 2; in Phase 1 the file is matched but annotated with placeholder; ERR-02 full implementation in Phase 2 |
| ERR-03 | Voice line has no matching audio file in ZIP - annotate `[Audio file missing]` | Parser marks unmatched voice lines at assembly time |
| ERR-04 | Audio file in ZIP has no matching voice line - silently ignore | Orphan `.opus` files that map to nothing; discarded after basename map construction |
| OUT-01 | Reconstructed chat log displayed with voice annotations inline | Results screen renders parsed messages; voice lines get placeholder text per D-09/D-10 |
| OUT-02 | Summary header: "X of Y voice messages identified" | Parser returns count of matched vs total voice lines; rendered in sticky header |
| OUT-03 | Copy full reconstructed log to clipboard with one click | `navigator.clipboard.writeText(plainText)`; fallback `execCommand('copy')` on hidden textarea |
| OUT-04 | Download reconstructed chat as `.txt` | Blob + object URL + hidden `<a download>` click + URL revoke |
| UI-01 | Parchment aesthetic: `#f5f0e8` bg, `#2c2016` text, `#8b5e3c` accent, CSS grain texture | Hand-authored CSS; SVG noise or CSS filter at 3-5% opacity |
| UI-02 | Courier Prime monospace throughout | Google Fonts import in CSS; fallback stack: `"Courier New", Courier, monospace` |
| UI-03 | Clean, focused - one primary action at a time | Three-screen state machine via `display: none` / `display: block` |
| UI-04 | Progress states visually calm; no flashy spinners | CSS-only animated ellipsis (three `<span>` elements with staggered opacity keyframes) |

</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File input (drag-drop + picker) | Browser / Client (main thread) | - | Native browser file APIs; no server involved |
| ZIP extraction | Browser / Client (parser.js) | - | JSZip runs entirely in browser memory on main thread |
| `_chat.txt` parsing | Browser / Client (parser.js) | - | Pure string processing; no server needed |
| Voice line detection + audio matching | Browser / Client (parser.js) | - | Filename-based matching within in-memory Maps |
| Output assembly (plain text + structured) | Browser / Client (parser.js) | - | String transformation from parsed message array |
| UI state machine | Browser / Client (ui.js) | - | DOM manipulation; screen transitions |
| Chat log rendering | Browser / Client (ui.js) | - | DOM construction from parsed message array |
| Clipboard copy | Browser / Client (ui.js) | - | `navigator.clipboard` / `execCommand` fallback |
| File download | Browser / Client (ui.js) | - | Blob + object URL; purely client-side |
| Worker stub (Phase 2 interface) | Browser / Client (worker.js) | - | Stub only in Phase 1; defines postMessage protocol |

**Note:** This phase has no backend, CDN dependency, or database. All tiers collapse to Browser / Client. The architectural split is between `parser.js` (data processing) and `ui.js` (rendering/interaction).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| JSZip | 3.10.1 | ZIP extraction in browser | De facto standard; no build pipeline needed; accepts `File`/`Blob`/`ArrayBuffer`; async API; ZIP64 support |
| Vanilla HTML/CSS/JS | - | All UI and logic | Project constraint (D-01); no framework needed for a linear 3-screen flow |
| ES Modules | Native browser | Code organization | `<script type="module">` in Electron renderer and local server; enables named imports/exports |
| Courier Prime | Google Fonts | Monospace typewriter font | Design system requirement (UI-02) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `navigator.clipboard` | Native browser API | Async clipboard write | Primary copy path (Electron renderer supports it) |
| `document.execCommand('copy')` | Native browser API | Clipboard fallback | When Clipboard API unavailable or throws |
| CSS `@keyframes` | Native CSS | Animated ellipsis | Processing screen (UI-04); no JS timer needed |
| `URL.createObjectURL` + `Blob` | Native browser API | File download trigger | OUT-04 download functionality |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSZip | `fflate` (~25KB vs ~97KB) | fflate is smaller and faster; JSZip has better docs and more familiar API; size irrelevant since vendored |
| JSZip | Native `DecompressionStream` | `DecompressionStream` handles individual gzip/deflate streams, NOT ZIP container format - cannot use |
| `navigator.clipboard` | `execCommand('copy')` | `execCommand` is deprecated but works as fallback; keep in fallback path |
| CSS `@keyframes` ellipsis | `setInterval` JS timer | CSS-only is simpler, no timer cleanup; UI-SPEC explicitly specifies CSS approach |

**Downloading JSZip to vendor location:**

```
Source URL: https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
Save to:    assets/lib/jszip.min.js
```

**Version verification:** `npm view jszip version` returns `3.10.1` (published 2025-03-14) [VERIFIED: npm registry]

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| jszip | npm | ~13 years | ~7M/week | github.com/Stuk/jszip | OK (manual verification - see below) | Approved |

**Methodology:** slopcheck defaulted to PyPI (wrong registry for a JS package). Manual verification:
- `npm view jszip version` returns 3.10.1 [VERIFIED: npm registry]
- `npm view jszip scripts.postinstall` returns nothing - no suspicious scripts [VERIFIED: npm registry]
- Official GitHub: `github.com/Stuk/jszip` - active, 9k+ stars, maintained [CITED: github.com/Stuk/jszip]
- Official docs: `stuk.github.io/jszip` - authoritative documentation [CITED: stuk.github.io/jszip]

**Packages removed due to slopcheck SLOP verdict:** none
**Packages flagged as suspicious:** none

*Note: Phase 1 installs no other packages. JSZip is vendored (downloaded once, committed to assets/lib/). No runtime CDN dependency.*

---

## Architecture Patterns

### System Architecture Diagram

```
USER ACTION (drop ZIP / pick file / pick folder / pick .txt)
         |
         v
  [ui.js] File Input Handler
   - validates file type (.zip vs .txt vs folder)
   - transitions to Processing Screen (min 300ms display)
         |
         v
  [parser.js] parseExport(file)
   - JSZip.loadAsync(file)         <- ZIP path only
   - extractChatText()             <- find _chat.txt
   - extractAudioFiles()           <- build basename->ZipEntry Map
   - parseChatText(text)           <- line-by-line parse
   - detectExportMode()            <- "with media" vs "without media"
   - buildMessageArray()           <- ordered Message[] objects
   - matchVoiceToAudio()           <- correlate voice lines to .opus entries
   - assembleOutput()              <- produce {messages, plainText, stats}
         |
         +-- "without media" detected
         |         v
         |   [ui.js] show Error Screen (D-05)
         |
         +-- parse success
                   v
         [ui.js] show Results Screen
          - renderChatLog(messages)    <- DOM construction
          - renderSummary(stats)       <- "X of Y voice messages identified"
          - bind Copy button           <- navigator.clipboard.writeText(plainText)
          - bind Download button       <- Blob + object URL + <a> click
          - bind "Try another file"    <- reset to Upload Screen
```

### Recommended Project Structure

```
voicefill/
+-- index.html                 # Entry point; loads jszip.min.js then main module
+-- assets/
    +-- css/
    |   +-- style.css          # All styles; parchment design system; screen states
    +-- js/
    |   +-- main.js            # Module entry; imports ui.js and parser.js
    |   +-- parser.js          # ZIP extraction + chat parsing + output assembly
    |   +-- ui.js              # DOM manipulation; screen transitions; event binding
    |   +-- worker.js          # STUB ONLY - defines Phase 2 postMessage interface
    +-- lib/
        +-- jszip.min.js       # Vendored; loaded as classic <script> before modules
```

**Loading order in index.html:**

```html
<!-- JSZip must load before ES modules that reference the global JSZip -->
<script src="assets/lib/jszip.min.js"></script>
<script type="module" src="assets/js/main.js"></script>
```

*JSZip 3.x ships a UMD build that registers `window.JSZip` when loaded as a classic script. Load it before the module entry point.*

---

### Pattern 1: JSZip ZIP Extraction with Basename Normalization

**What:** Load a `File` object from drag-drop or file picker into JSZip; build a Map from audio file basenames to ZipEntry objects.
**When to use:** In `parser.js` after receiving the File from `ui.js`.

```javascript
// Source: stuk.github.io/jszip/documentation/api_jszip/load_async.html [CITED]
// Key insight: WhatsApp ZIP nests files under a chat-named folder.
// zip.files['filename.opus'] returns undefined.
// zip.files['WhatsApp Chat with Alice/filename.opus'] is the real key.
// Solution: build a basename Map, never use full paths downstream.

async function extractZip(file) {
  const zip = await JSZip.loadAsync(file);

  let chatEntry = null;
  const audioFiles = new Map(); // basename -> ZipObject

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;

    // Normalize: take only the last path segment (strips folder prefix)
    const basename = relativePath.split('/').pop();

    if (basename === '_chat.txt') {
      chatEntry = zipEntry;
    } else if (basename.endsWith('.txt') && chatEntry === null) {
      chatEntry = zipEntry; // fallback: first .txt found
    } else if (basename.endsWith('.opus')) {
      audioFiles.set(basename, zipEntry);
    }
  });

  if (!chatEntry) throw new Error('No _chat.txt found in ZIP');

  const text = await chatEntry.async('string');
  return { text, audioFiles };
}
```

**Why basename normalization is critical:** `zip.files['filename.opus']` returns undefined on real WhatsApp exports. The basename Map sidesteps the folder prefix entirely. [CITED: PITFALLS.md GOTCHA-3]

---

### Pattern 2: WhatsApp `_chat.txt` Parser

**What:** Parse the raw text into an ordered array of Message objects, handling BOM, Unicode directional marks, and both Android/iOS voice filename formats.
**When to use:** In `parser.js` after `extractZip` returns the text.

```javascript
// Source: FEATURES.md WhatsApp Export Format; PITFALLS.md CRIT-4 [VERIFIED via prior research]

// US-locale date pattern (v1 baseline per PARSE-04)
// Matches: "12/31/23, 10:30 AM - " and "12/31/23, 10:30:45 AM - "
const LINE_START = /^(\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s*[-–]\s*(.+)/;

// Voice message line with media (covers both Android PTT-* and iOS 00000*-AUDIO-*)
// Matches any line ending in ".opus (file attached)"
const VOICE_WITH_MEDIA = /^.+\.opus \(file attached\)$/;

// Without media placeholder
const VOICE_NO_MEDIA = /^<Media omitted>$/;

function parseChatText(rawText) {
  // Strip UTF-8 BOM (U+FEFF) and Unicode directional marks (PARSE-04)
  // BOM appears as the first character on iOS exports
  // Directional marks (LRM U+200E, RLM U+200F) appear around sender names on Android
  const text = rawText
    .replace(/^﻿/, '')               // UTF-8 BOM at start of file
    .replace(/[‎‏‪-‮]/g, ''); // directional formatting chars

  const lines = text.split('\n');
  const messages = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(LINE_START);
    if (match) {
      if (current) messages.push(current);

      const [, timestamp, rest] = match;
      // Split on FIRST ': ' to separate sender from content.
      // Do NOT use split(':')[0] - sender names can contain colons.
      const colonIdx = rest.indexOf(': ');
      if (colonIdx === -1) {
        // System message (no sender colon pair)
        current = { type: 'system', timestamp, content: rest };
      } else {
        const sender = rest.slice(0, colonIdx);
        const content = rest.slice(colonIdx + 2);

        if (VOICE_WITH_MEDIA.test(content)) {
          // content is e.g. "00000023-AUDIO-2024-01-15 12.31.24.opus (file attached)"
          const basename = content.replace(' (file attached)', '').trim();
          current = { type: 'voice', timestamp, sender, content, basename, matched: false };
        } else if (VOICE_NO_MEDIA.test(content)) {
          current = { type: 'voice-omitted', timestamp, sender, content };
        } else {
          current = { type: 'text', timestamp, sender, content };
        }
      }
    } else if (current && line.trim()) {
      // Continuation line - append to current message
      current.content += '\n' + line;
    }
  }
  if (current) messages.push(current);
  return messages;
}
```

**Note on regex character escapes:** The BOM and directional marks are represented as `﻿`, `‎`, `‏`, `‪`-`‮` (Unicode escape sequences) rather than literal invisible characters, to keep the source file clean and auditable.

---

### Pattern 3: Voice-to-Audio Matching

**What:** Walk the parsed message array; for each `type: 'voice'` message, look up its `basename` in the audio file Map.

```javascript
// Source: ARCHITECTURE.md Data Flow step 3 [VERIFIED via prior research]

function matchVoiceToAudio(messages, audioFiles) {
  let voiceTotal = 0;
  let voiceMatched = 0;
  let hasOmitted = false;

  for (const msg of messages) {
    if (msg.type === 'voice') {
      voiceTotal++;
      if (audioFiles.has(msg.basename)) {
        msg.matched = true;
        msg.audioEntry = audioFiles.get(msg.basename); // ZipObject - read lazily in Phase 2
        voiceMatched++;
      } else {
        msg.annotation = '[Audio file missing]'; // ERR-03
      }
    } else if (msg.type === 'voice-omitted') {
      voiceTotal++;
      hasOmitted = true;
    }
  }

  return { messages, voiceTotal, voiceMatched, hasOmitted };
}
```

---

### Pattern 4: Export Mode Detection (PARSE-02 / ERR-01)

**What:** Determine whether this is a "without media" export that should show the error screen.

```javascript
// Source: FEATURES.md "without media" detection; REQUIREMENTS.md PARSE-02 [VERIFIED]

function detectExportMode({ audioFiles, hasOmitted, voiceMatched }) {
  // "Without media" if: voice lines are <Media omitted>
  // AND there are zero matched audio files in the ZIP
  if (hasOmitted && audioFiles.size === 0 && voiceMatched === 0) {
    return 'without-media';
  }
  // "with-media" covers both normal ZIP exports and parse-only .txt (INPUT-04)
  return 'with-media';
}
```

---

### Pattern 5: Output Assembly (Plain Text)

**What:** Walk messages in order; produce the plain-text string that goes to clipboard and download.

```javascript
// Source: CONTEXT.md D-07, D-09, D-10 [VERIFIED]

function assemblePlainText(messages) {
  const lines = [];
  for (const msg of messages) {
    if (msg.type === 'system') continue; // omit system messages

    let body;
    if (msg.type === 'voice') {
      body = msg.matched
        ? '[Voice message: transcription pending]'  // D-09
        : '[Audio file missing]';                    // D-10 / ERR-03
    } else if (msg.type === 'voice-omitted') {
      body = '[Audio not available]';                // D-10 / INPUT-04
    } else {
      body = msg.content;
    }

    lines.push(`${msg.timestamp} - ${msg.sender}: ${body}`);
  }
  return lines.join('\n');
}
```

---

### Pattern 6: Three-Screen State Machine (ui.js)

**What:** Simple display toggle between named states. Instant swap - no CSS transitions per UI-SPEC.

```javascript
// Source: CONTEXT.md D-04; UI-SPEC.md Screen Transitions [VERIFIED]

const screens = {
  upload:         document.getElementById('screen-upload'),
  processing:     document.getElementById('screen-processing'),
  results:        document.getElementById('screen-results'),
  'without-media': document.getElementById('screen-without-media'),
};

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.style.display = key === name ? 'block' : 'none';
  }
}
```

---

### Pattern 7: CSS-Only Animated Ellipsis (UI-04)

**What:** Three `<span>` elements cycling through opacity at 600ms intervals, staggered by 200ms.
**When to use:** Processing screen; no JS timer needed.

HTML:
```html
<!-- Source: UI-SPEC.md Interaction Contracts [VERIFIED] -->
<p aria-live="polite" class="processing-text">
  Reading export<span class="dot dot-1">.</span><span class="dot dot-2">.</span><span class="dot dot-3">.</span>
</p>
```

CSS:
```css
/* Source: UI-SPEC.md - 600ms per frame, 200ms stagger [VERIFIED] */
@keyframes dot-blink {
  0%, 100% { opacity: 0; }
  50%       { opacity: 1; }
}

.dot {
  animation: dot-blink 1.8s infinite;
}
.dot-1 { animation-delay: 0s; }
.dot-2 { animation-delay: 0.6s; }
.dot-3 { animation-delay: 1.2s; }
```

---

### Pattern 8: Worker Stub (Phase 2 Interface Compatibility)

**What:** A `worker.js` that defines the postMessage protocol Phase 2 will implement - but returns a stub result in Phase 1.
**Why:** Phase 2 must be able to replace this body without touching `ui.js`.

```javascript
// assets/js/worker.js - STUB for Phase 1
// Phase 2 replaces this body with real Whisper pipeline
//
// Message protocol (main thread -> worker):
//   { type: 'transcribe', audioData: Uint8Array, filename: string, index: number, total: number }
//
// Message protocol (worker -> main thread):
//   { status: 'result', filename, text, index, total }
//   { status: 'error',  filename, message }
//   { status: 'ready' }

self.addEventListener('message', (e) => {
  if (e.data.type === 'transcribe') {
    // Phase 1 stub: echo back a placeholder result immediately
    self.postMessage({
      status: 'result',
      filename: e.data.filename,
      text: 'transcription pending',
      index: e.data.index,
      total: e.data.total,
    });
  }
});
```

*In Phase 1, the worker is not invoked by the main parse flow - the parser produces placeholder annotations directly. The stub exists to validate the Worker construction path and give Phase 2 a clear interface to fill in.*

---

### Pattern 9: Processing Screen Minimum Display Time

**What:** Prevent jarring flash if parsing completes in under 300ms.

```javascript
// Source: UI-SPEC.md State 2 - minimum 300ms display [VERIFIED]

async function processFile(file) {
  showScreen('processing');
  const start = Date.now();

  let result;
  try {
    result = await parseExport(file);
  } catch (err) {
    // handle hard parse error - show upload screen with error message
    showScreen('upload');
    showParseError(err.message);
    return;
  }

  const elapsed = Date.now() - start;
  if (elapsed < 300) {
    await new Promise(r => setTimeout(r, 300 - elapsed));
  }

  if (result.mode === 'without-media') {
    showScreen('without-media');
  } else {
    renderResults(result);
    showScreen('results');
  }
}
```

---

### Pattern 10: Clipboard Copy with Fallback

**What:** Primary `navigator.clipboard` path; fallback via hidden textarea on failure.

```javascript
// Source: UI-SPEC.md Interaction Contracts - Clipboard Copy [VERIFIED]

async function copyToClipboard(text, button) {
  const originalLabel = button.textContent;

  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied!';
    setTimeout(() => { button.textContent = originalLabel; }, 1500);
  } catch {
    // Fallback: hidden textarea + execCommand (deprecated but widely supported)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);

    if (ok) {
      button.textContent = 'Copied!';
      setTimeout(() => { button.textContent = originalLabel; }, 1500);
    } else {
      button.textContent = 'Copy failed - select and copy manually';
      setTimeout(() => { button.textContent = originalLabel; }, 3000);
    }
  }
}
```

---

### Pattern 11: Chat Log DOM Rendering (XSS-safe)

**What:** Render each parsed message as DOM nodes using `textContent` exclusively - never `innerHTML` with user-supplied data.
**Why:** WhatsApp message content can contain `<`, `>`, `&`, `"` characters that would be interpreted as markup if inserted via property assignment that triggers HTML parsing.

```javascript
// Source: Security domain - XSS prevention [VERIFIED]

function renderMessage(msg) {
  const row = document.createElement('div');
  row.className = 'message-row';

  const tsSpan = document.createElement('span');
  tsSpan.className = 'timestamp';
  tsSpan.textContent = msg.timestamp; // safe - textContent never parses HTML

  const senderSpan = document.createElement('span');
  senderSpan.className = 'sender';
  senderSpan.textContent = msg.sender + ': '; // safe

  const bodySpan = document.createElement('span');
  if (msg.type === 'voice') {
    bodySpan.className = msg.matched ? 'voice-annotation' : 'voice-annotation error';
    bodySpan.textContent = msg.matched
      ? '[Voice message: transcription pending]'
      : (msg.annotation || '[Audio file missing]');
  } else if (msg.type === 'voice-omitted') {
    bodySpan.className = 'voice-annotation';
    bodySpan.textContent = '[Audio not available]';
  } else {
    bodySpan.textContent = msg.content; // safe - user chat text set as textContent
  }

  row.appendChild(tsSpan);
  row.appendChild(senderSpan);
  row.appendChild(bodySpan);
  return row;
}
```

---

### Anti-Patterns to Avoid

- **Full-path ZIP lookup:** `zip.files[basename]` fails on real WhatsApp exports because entries are prefixed with the chat folder name. Always build a basename Map via `zip.forEach`.
- **Splitting sender on `: ` naively:** `rest.split(': ')[0]` gives the wrong sender if sender names contain colons (e.g., `Dr. Smith`). Use `indexOf(': ')` and `slice`.
- **Assuming `_chat.txt` is at ZIP root:** WhatsApp often nests inside a folder. Use `forEach` with basename extraction.
- **Literal invisible Unicode in source:** Use `﻿`, `‎` etc. as escape sequences in regex patterns - never embed invisible characters literally in source files.
- **Loading all `.opus` data into memory at parse time:** In Phase 1, store the ZipObject reference; read the actual bytes only when needed (Phase 2). In Phase 1 we never need the bytes.
- **Setting chat content via `innerHTML`:** Use `textContent` for all user-supplied data (sender names, message bodies, timestamps). Message text can contain `<` and `>` characters.
- **Loading JSZip as `<script type="module">`:** The UMD build registers `window.JSZip` when loaded as a classic script. Load it before the module entry point without `type="module"`.
- **Date-based voice filename matching:** Match by exact basename string. The filename in `_chat.txt` IS the audio file's basename - no date parsing needed for matching.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP parsing | Custom ZIP binary parser | JSZip 3.10.1 (vendored) | ZIP format has DEFLATE, ZIP64, CRC32 edge cases; JSZip handles all including zip-slip path sanitization since v3.8.0 |
| CSS font loading | System font fallback only | Google Fonts `@import` for Courier Prime | Courier New is too wide and inconsistent across OS; Courier Prime is the specified design font |
| File download | `fetch` or server route | Blob + object URL + `<a download>` | Entirely client-side; no server; no fetch needed |
| Animated ellipsis | `setInterval` JS counter | CSS `@keyframes` + staggered `animation-delay` | Simpler, no timer cleanup, no JS dependency; matches UI-SPEC exactly |

**Key insight:** Phase 1 has zero hard algorithmic problems. Every capability maps to a native browser API or a 10-line pattern. The complexity is entirely in WhatsApp format variance - handle all the edge cases in the parser and everything else is wiring.

---

## Common Pitfalls

### Pitfall 1: WhatsApp ZIP Subfolder Paths

**What goes wrong:** `zip.files['00000023-AUDIO-2024-01-15.opus']` returns `undefined`. Real WhatsApp ZIPs nest files inside a `WhatsApp Chat with Alice/` folder prefix.
**Why it happens:** JSZip keys entries by their full relative path including any parent folder prefix.
**How to avoid:** Build a `Map<basename, ZipObject>` in a single `zip.forEach` pass; downstream code never sees full paths.
**Warning signs:** "No audio files found" even on a "with media" export that definitely contains audio.

---

### Pitfall 2: BOM and Directional Marks Breaking First-Line Parse

**What goes wrong:** The first message in `_chat.txt` never matches the line regex because iOS exports prepend a UTF-8 BOM (U+FEFF) and Android injects directional mark characters (U+200E, U+200F) around sender names.
**Why it happens:** WhatsApp `_chat.txt` encoding is not clean UTF-8 plain text - it includes Unicode presentation characters.
**How to avoid:** Strip BOM and all directional marks immediately after reading the string, before any parsing. Use Unicode escape sequences in regex, not literal invisible characters in source code.
**Warning signs:** First N messages missing from parsed output; sender names have unexpected extra characters.

---

### Pitfall 3: Sender Name Colon Split

**What goes wrong:** `"[timestamp] - Dr. Smith: Hello".split(': ')` gives `["[timestamp] - Dr", " Smith", " Hello"]` - sender becomes `"Dr"`.
**Why it happens:** Naive split on `: ` finds the first occurrence, which may be inside the sender name if the sender name contains a colon.
**How to avoid:** Use `indexOf(': ')` to find the separator position, then `slice` to split exactly once at that position.
**Warning signs:** Messages from senders with colons in names are misattributed or content is truncated.

---

### Pitfall 4: JSZip as ES Module vs. Classic Script

**What goes wrong:** If `jszip.min.js` is not loaded before the module entry point, `JSZip` is undefined when `parser.js` calls `JSZip.loadAsync(...)`.
**Why it happens:** The UMD build registers `window.JSZip` only when loaded as a classic script before module evaluation. Module evaluation order is not guaranteed relative to classic scripts if done incorrectly.
**How to avoid:** Load JSZip as `<script src="assets/lib/jszip.min.js"></script>` (no `type="module"`) before `<script type="module" src="assets/js/main.js"></script>`. Or import JSZip as an ES module directly in `parser.js` if using the ESM build.
**Warning signs:** `ReferenceError: JSZip is not defined` in console on first file drop.

---

### Pitfall 5: "Without Media" vs. Parse-Only Mode Conflation

**What goes wrong:** A user uploads only a `_chat.txt` file (INPUT-04 parse-only mode). The parser detects no audio files, and if logic is naive it may incorrectly show the "without media" error screen.
**Why it happens:** The detection logic may confuse "no audio files present" (valid parse-only) with "without media export" (needs error screen).
**How to avoid:** The "without media" error is triggered ONLY when voice lines contain `<Media omitted>` text AND there are zero audio files. A plain `.txt` upload with voice lines referencing `.opus` filenames but no audio goes to results with `[Audio file missing]` annotations (ERR-03), not the error screen.
**Warning signs:** Parse-only `.txt` upload shows the wrong error screen.

---

### Pitfall 6: 300ms Minimum Processing Screen

**What goes wrong:** Parsing is so fast (under 50ms) that the processing screen flashes imperceptibly - users wonder if anything happened.
**Why it happens:** Phase 1 does no ML; ZIP extraction + string parsing is nearly instant on modern hardware.
**How to avoid:** Record `Date.now()` when switching to processing screen; after parse completes, wait for the remaining time before switching to results.
**Warning signs:** Processing screen disappears in under a frame; no visual confirmation that work occurred.

---

### Pitfall 7: Chat Content Rendered as HTML

**What goes wrong:** WhatsApp messages containing `<`, `>`, or `&` characters are displayed as broken markup, or worse, execute as script if `innerHTML` is used with unescaped user content.
**Why it happens:** Chat messages are arbitrary user text and may contain any characters.
**How to avoid:** Always use `element.textContent = value` for any user-supplied content. Never use `element.innerHTML = untrustedValue`.
**Warning signs:** Messages containing `<b>` or similar tags render as formatted text instead of literal characters.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `FileReader.readAsArrayBuffer` | Direct `File` object to JSZip | JSZip 3.x | No explicit FileReader needed; JSZip accepts `File` directly |
| `document.execCommand('copy')` | `navigator.clipboard.writeText()` | Chrome 66+, 2018 | Async, Promise-based; requires secure context; keep `execCommand` as fallback |
| `window.JSZip` global only | ES module import also available | JSZip 3.x | Both patterns supported; use classic script tag for simplicity in no-build context |
| `webkitdirectory` (vendor prefix) | `webkitdirectory` still required | Still vendor-prefixed | For INPUT-03 folder input - no standard attribute name yet |

**Deprecated/outdated:**
- `document.execCommand('copy')`: Deprecated by W3C but universally supported; keep in fallback path [ASSUMED - MDN marks deprecated; exact removal timeline unverified]
- `Xenova/whisper-*` model IDs: Use `onnx-community/whisper-*` for transformers.js v4 (Phase 2 concern, not Phase 1)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | JSZip UMD build (classic `<script>`) registers `window.JSZip` globally in Electron renderer | Standard Stack, Pattern 1 | Code calling `JSZip.loadAsync(...)` throws ReferenceError; fix by switching to ESM import |
| A2 | `navigator.clipboard.writeText()` is available in Electron renderer process without extra permissions | Pattern 10 | Copy fails silently; fallback execCommand catches it |
| A3 | `document.execCommand('copy')` remains available in Electron Chromium at time of Phase 3 packaging | Pattern 10 | No clipboard fallback; user must select-copy manually |
| A4 | Google Fonts CDN loads Courier Prime successfully in local dev server context | Standard Stack | Font falls back to Courier New; visual degradation only, not a functional failure |
| A5 | All WhatsApp `.opus` voice files in "with media" exports use basenames containing `AUDIO` and end with `.opus (file attached)` in chat text | Pattern 3 | Voice lines not detected; voiceMatched = 0 for all; broaden detection to match any `.opus (file attached)` suffix |
| A6 | INPUT-03 (folder input via `webkitdirectory`) provides File objects accessible by name iteration | Phase Requirements | Folder input path silently fails; lower priority, can be deferred to plan 01-02 |

---

## Open Questions

1. **INPUT-03: Folder input implementation**
   - What we know: `<input type="file" webkitdirectory>` gives a `FileList` of all files in the selected folder
   - What's unclear: Exact iteration pattern for finding `_chat.txt` and `.opus` files from a `FileList` (no JSZip needed)
   - Recommendation: Extract a shared `processFiles(chatText, audioMap)` function that both the ZIP path and folder path call; folder path builds the audioMap from `FileList` by iterating and keying by `file.name`

2. **Worker stub: instantiate in Phase 1 or defer?**
   - What we know: Phase 1 does not invoke the worker; placeholder annotations come from parser.js
   - What's unclear: Whether to `new Worker('assets/js/worker.js', {type: 'module'})` at startup to validate construction works, or defer entirely to Phase 2
   - Recommendation: Defer worker instantiation to Phase 2; stub file exists but is never constructed in Phase 1; keeps Phase 1 focused and avoids premature complexity

3. **Courier Prime font loading strategy for Phase 3**
   - What we know: Google Fonts requires an outbound HTTP request on first load; Phase 3 (Electron) will need offline font availability
   - What's unclear: Whether Electron renderer blocks Google Fonts CDN calls or whether it is fine for Phase 3
   - Recommendation: For Phase 1 (local dev server), `@import url('https://fonts.googleapis.com/...')` is fine. Add a `TODO: bundle font for Phase 3` comment in style.css. Phase 3 research will address Electron offline font strategy.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + npm | `npx serve .` local dev server | Assumed available | - | `python -m http.server 8080` |
| Chrome or Edge | ES modules + drag-drop + clipboard API | Available on dev machine | - | Firefox 114+ also works |
| Google Fonts CDN | Courier Prime font | Available (internet required for dev) | - | Courier New fallback in font stack |

*No external runtime services beyond a local HTTP server. All dependencies are native browser APIs or vendored files.*

---

## Security Domain

> `security_enforcement` not set in config.json - treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in this tool |
| V3 Session Management | No | No sessions; one-shot tool |
| V4 Access Control | No | No multi-user; local only |
| V5 Input Validation | Yes - file input | Validate extension on drop; reject non-ZIP silently; catch JSZip rejection for invalid archives |
| V6 Cryptography | No | No crypto operations |
| V7 Error Handling | Yes | No stack traces in UI; user-visible errors use friendly copy |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| ZIP path traversal (zip-slip) | Tampering | JSZip 3.8.0+ sanitizes `..` path components automatically; `unsafeOriginalName` preserved but not used by our code |
| Malicious ZIP (non-ZIP content with .zip extension) | Tampering | JSZip `loadAsync` rejects invalid ZIPs with a rejected Promise; catch and show user-friendly error |
| XSS via chat content rendered into DOM | Tampering | Use `textContent` for ALL user-supplied values; never assign chat content via `innerHTML` (see Pattern 11) |
| Large ZIP causing browser OOM | Denial of Service | Read audio ZipObjects lazily (Phase 1 never reads audio bytes); warn if ZIP exceeds 500MB |

**DOM rendering rule:** All user-supplied content (sender names, message bodies, timestamps, filenames) MUST be set via `element.textContent`. The `innerHTML` property must only be used for static, developer-authored markup with no user data interpolated. This rule applies to every DOM-building function in ui.js. [VERIFIED: standard browser security practice]

---

## Sources

### Primary (HIGH confidence)
- JSZip official docs: `stuk.github.io/jszip` - `loadAsync` API, ZipObject `.async()` method, `forEach` iteration [CITED via WebFetch 2026-05-21]
- JSZip npm registry: `npm view jszip` returns version 3.10.1, published 2025-03-14 [VERIFIED: npm registry]
- CONTEXT.md - all locked decisions D-01 through D-10 [VERIFIED: project file]
- UI-SPEC.md - all UI patterns, interaction contracts, copywriting, screen definitions [VERIFIED: project file]
- REQUIREMENTS.md - all REQ-IDs and acceptance criteria [VERIFIED: project file]
- ARCHITECTURE.md (prior research) - data flow, component responsibilities, code patterns [VERIFIED: project file]
- PITFALLS.md (prior research) - CRIT-4, GOTCHA-3, GOTCHA-6 directly relevant to Phase 1 [VERIFIED: project file]
- FEATURES.md (prior research) - WhatsApp format variants, date format table, voice detection patterns [VERIFIED: project file]

### Secondary (MEDIUM confidence)
- WhatsApp export format patterns: widely documented in open-source parser projects; stable since ~2016 [CITED: FEATURES.md sources]
- `navigator.clipboard` API availability in Electron renderer: documented behavior [ASSUMED]
- CSS `@keyframes` staggered animation for ellipsis: standard CSS; no library needed [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - JSZip verified via npm registry and official docs; all other items are native browser APIs
- Architecture: HIGH - patterns derived from locked decisions, prior architecture research, and verified JSZip API docs
- Pitfalls: HIGH - WhatsApp format pitfalls verified via prior research; JSZip path pitfall confirmed by official API docs
- UI patterns: HIGH - all patterns directly traceable to approved UI-SPEC.md

**Research date:** 2026-05-21
**Valid until:** 2026-06-20 (JSZip is stable; WhatsApp format is stable; native APIs are stable)
