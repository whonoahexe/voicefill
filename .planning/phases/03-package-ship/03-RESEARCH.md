# Phase 3: Package & Ship - Research

**Researched:** 2026-05-21
**Domain:** Electron packaging (electron-builder), Instagram JSON export parsing, Chromium audio codec support
**Confidence:** MEDIUM-HIGH overall (Electron/electron-builder: HIGH; Instagram format: MEDIUM)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** User-data offline, CDN ok for UI/library code. The transcription path (worker.js to Whisper pipeline) must make zero network requests — no user audio leaves the device. CDN loads for Google Fonts and `@huggingface/transformers` from jsdelivr are acceptable; these are UI and library code, not user data.

**D-02:** Code-level guarantee is sufficient. No runtime network interception (session.setProxy, webRequest interceptor) is needed. The offline guarantee is enforced by the worker code structure: `env.allowLocalModels = false` plus no outbound calls in the transcription path. Phase 3 documents this guarantee; no runtime enforcement added.

**D-03:** electron-builder, Windows-only, portable .exe / .zip. Target platform is Windows only. Distribution format is a portable executable or zip — no NSIS installer, no Start Menu shortcut, no Program Files. Someone can download, extract, and double-click to run without an install wizard.

**D-04:** Electron shell uses standard security defaults: `nodeIntegration: false`, `contextIsolation: true`. No preload script needed if the app has no IPC requirements (the app is pure renderer-side today). Researcher confirms if any Electron APIs (e.g., `app.getPath` for cache dir) require a preload bridge.

**D-05:** Real attempt — parse if format is verifiable, graceful fallback if not. The researcher verifies the current Instagram JSON export structure using official docs and any available format samples. If voice messages are identifiable and audio files are extractable, implement the parser (plan 03-02). If the format is unverifiable or audio files use a codec that can't be decoded in-browser, the app shows a graceful "not supported" screen — text chat is still reconstructed, voice lines are annotated `[Instagram voice: format not supported]`.

**D-06:** No real export available for testing. Researcher relies on official Instagram documentation and publicly available format samples. Parser must hedge against format variations accordingly.

**D-07:** Instagram detection: look for the root JSON structure characteristic of Instagram exports (e.g., `messages` array with `share` or `audio` media types). If the file is recognized as Instagram but voices are unsupported, show the fallback UX; if the file is unrecognized entirely, show the existing "unsupported format" error.

### Claude's Discretion

- Whether a preload script is needed (depends on whether any `app.*` APIs are used in the main process — researcher determines this).
- Instagram audio codec — researcher identifies what codec Instagram uses for voice messages (likely AAC/MP4). If it's decodable via `AudioContext`, implement; if not, graceful fallback.
- Exact electron-builder config fields (appId, productName, win.target) — standard values, planner decides.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIST-01 | Tool is packaged as an Electron desktop app — eliminates HTTP serving requirement and `file://` limitations | Covered by 03-01: Electron shell, BrowserWindow.loadFile, electron-builder portable target |
| DIST-02 | App runs fully offline after initial Whisper model download — no ongoing network dependency | Covered by 03-01: code-level guarantee via worker.js structure; CSP meta tag documentation |
| PARSE-05 | Instagram JSON export is parsed and voice messages extracted (secondary — may be incomplete if format verification is blocked) | Covered by 03-02: Instagram format structure documented; audio_files field confirmed; m4a/AAC decodable via AudioContext |
</phase_requirements>

---

## Summary

Phase 3 wraps the existing Phase 1+2 renderer code inside an Electron shell and adds Instagram JSON parsing. The core renderer code (index.html, assets/js/\*, assets/lib/jszip.min.js) requires zero changes to work inside Electron — `BrowserWindow.loadFile('index.html')` serves the page with the same relative-asset behavior as a local HTTP server.

The Electron shell requires one new file (`electron/main.js`) and a `package.json` at project root. Security defaults — `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` (Electron 20+ default) — are correct for this app, which is pure renderer-side with no IPC requirements. No preload script is needed because the app makes no calls to `app.*` or other main-process APIs.

**Critical finding — CSP required:** Electron 20+ with sandbox mode enabled applies Chromium's default CSP, which blocks WASM instantiation. The transformers.js CDN import already works in the Phase 2 worker, but a `<meta http-equiv="Content-Security-Policy">` tag must be added to `index.html` to allow `'unsafe-eval'` (required for WASM compilation) and to whitelist `cdn.jsdelivr.net` and HuggingFace CDN domains for the model fetch. Without this, the worker will fail to initialize in the packaged app. [VERIFIED: github.com/huggingface/transformers.js/issues/774]

**Instagram format verdict:** The format is sufficiently verifiable to implement a real parser with a graceful fallback. The top-level `participants` + `messages` structure is confirmed. Voice messages appear in two confirmed ways: a `voice_media` field on the message object, or an `audio_files` array on the message object (each entry with a `uri` field pointing to a relative path inside the ZIP). Audio files are `.m4a` (AAC in MP4 container), which Chromium decodes natively via `AudioContext.decodeAudioData()`. [VERIFIED: instaview.py source analysis + MDN Web Audio API]

**Primary recommendation:** Implement 03-01 first (main.js + package.json + CSP fix), verify the packaged app runs the existing WhatsApp flow end-to-end, then add the Instagram parser in 03-02.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| App launch / window creation | Electron main process | — | BrowserWindow lives here; renderer cannot launch itself |
| HTML/CSS/JS rendering | Electron renderer (Chromium) | — | All existing app code stays in renderer unchanged |
| Whisper transcription | Web Worker (renderer thread) | — | Already built in Phase 2; no change |
| Offline network guarantee | Web Worker code structure | CSP meta tag | D-02: enforced by `env.allowLocalModels = false`; CSP is belt-and-suspenders |
| Instagram JSON parsing | Renderer JS (parser.js) | — | Same tier as WhatsApp parser; follows identical interface |
| Audio decode (Instagram) | Renderer main thread | — | AudioContext.decodeAudioData; same pattern as WhatsApp .opus |
| Distribution packaging | electron-builder | — | Produces portable .exe; runs on user's Windows machine |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 42.2.0 | Chromium+Node.js desktop shell | Official Electron project; 13-year npm registry age; maintained by Electron HQ |
| electron-builder | 26.8.1 | Packaging, portable .exe / .zip output | De-facto standard for Electron distribution; supports Windows portable target natively |

[VERIFIED: npm registry — `npm view electron version` = 42.2.0, created 2012-05-18; `npm view electron-builder version` = 26.8.1, created 2015-05-26]

### No new runtime dependencies needed

The Instagram parser is pure JavaScript using the same JSZip already loaded for WhatsApp ZIPs. No additional npm packages are required.

### Installation

```bash
npm install --save-dev electron electron-builder
```

Both go in devDependencies — they are build/dev tools, not runtime packages shipped to users. Electron bundles its own Chromium and Node.js runtimes in the distributed .exe.

---

## Package Legitimacy Audit

> slopcheck defaulted to PyPI registry and flagged both packages as non-existent on PyPI (correct — they are npm packages). Manual npm registry verification was performed instead.

| Package | Registry | Age | Downloads | Source Repo | Disposition |
|---------|----------|-----|-----------|-------------|-------------|
| electron | npm | ~13 yrs (2012-05-18) | 2M+/wk | github.com/electron/electron | Approved |
| electron-builder | npm | ~10 yrs (2015-05-26) | 800K+/wk | github.com/electron-userland/electron-builder | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

Neither package has a postinstall script making network calls (verified via `npm view electron scripts.postinstall` — empty; same for electron-builder). Both are maintained by well-known organizations (Electron HQ / electron-userland).

---

## Architecture Patterns

### System Architecture Diagram

```
  User double-clicks VoiceFill.exe
           |
  +--------+------------------------------------------+
  | Electron Main Process (electron/main.js)           |
  | app.whenReady() -> BrowserWindow                   |
  | nodeIntegration: false                             |
  | contextIsolation: true                             |
  | sandbox: true (Electron 20+ default)               |
  +--------+------------------------------------------+
           |  BrowserWindow.loadFile('../index.html')
           v
  +----------------------------------------------------------+
  | Renderer Process (Chromium)                              |
  |                                                          |
  | index.html -> assets/js/main.js (ES module entry)        |
  |                     |                                    |
  |          +----------+-----------+                        |
  |          | ui.js (screen SM)    |                        |
  |          +---+----------+-------+                        |
  |              |          |                                |
  |      +-------v--+  +----v---------------------+         |
  |      | parser.js|  | worker.js (Web Worker)   |         |
  |      | WhatsApp |  | CDN: @huggingface/       |         |
  |      | Instagram|  | transformers@4.2.0        |         |
  |      +---+------+  +--------------------------+         |
  |          |                                              |
  |      +---v------------------+                           |
  |      | JSZip (assets/lib/)  |                           |
  |      | File/ZIP parsing     |                           |
  |      +----------------------+                           |
  +----------------------------------------------------------+
           |  CDN (first run only — model download)
           v
  HuggingFace Hub / jsDelivr
```

### Recommended Project Structure

```
voicefill/
|-- electron/
|   +-- main.js           # NEW: main process, BrowserWindow setup
|-- assets/
|   |-- css/style.css
|   |-- js/
|   |   |-- main.js       # existing ES module entry
|   |   |-- ui.js         # existing + Instagram route added
|   |   |-- parser.js     # existing + parseInstagram() added
|   |   +-- worker.js     # existing Whisper worker (unchanged)
|   +-- lib/
|       +-- jszip.min.js  # existing
|-- index.html             # existing + CSP meta tag added
+-- package.json           # NEW: main, scripts, devDeps, build config
```

No changes to the assets/ directory structure. The `electron/` subdirectory holds only main.js.

### Pattern 1: Minimal Electron main.js

```javascript
// electron/main.js
// Source: https://www.electronjs.org/docs/latest/tutorial/tutorial-first-app
const { app, BrowserWindow } = require('electron/main');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,    // default false; explicit for clarity
      contextIsolation: true,    // default true; explicit for clarity
      // sandbox: true is the Electron 20+ default -- do not override
      // No preload: app is pure renderer-side, no IPC needed (D-04 resolution)
    }
  });

  // __dirname is electron/ -- go one level up to reach index.html at root
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  // macOS: re-create window on dock icon click if none are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

[VERIFIED: Electron official tutorial — app.whenReady(), loadFile, window-all-closed pattern]

### Pattern 2: package.json (complete)

```json
{
  "name": "voicefill",
  "version": "1.0.0",
  "description": "Transcribe WhatsApp voice messages offline",
  "main": "electron/main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder --win portable"
  },
  "devDependencies": {
    "electron": "^42.2.0",
    "electron-builder": "^26.8.1"
  },
  "build": {
    "appId": "com.voicefill.app",
    "productName": "VoiceFill",
    "directories": {
      "output": "dist"
    },
    "files": [
      "index.html",
      "assets/**/*",
      "electron/**/*"
    ],
    "win": {
      "target": "portable"
    }
  }
}
```

**Note on icon:** electron-builder requires a `.ico` file for Windows builds. If no icon asset exists, omit the `icon` field — electron-builder will use its default Electron icon. [ASSUMED]

**Note on files glob:** When a custom `files` array is provided, electron-builder does NOT add the default `**/*` catch-all. Only listed paths are included. Production node_modules are added automatically. [CITED: electron.build/contents.html]

### Pattern 3: CSP meta tag for index.html

```html
<!-- Add inside <head>, before any <script> tags -->
<!-- Required for WASM compilation in packaged Electron app with sandbox: true -->
<!-- Source: github.com/huggingface/transformers.js/issues/774 -->
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src https://cdn.jsdelivr.net https://huggingface.co https://cdn-lfs.hf.co https://cdn-lfs-us-1.hf.co; worker-src 'self' blob:; img-src 'self' data:;">
```

**Why `'unsafe-eval'` is required:** transformers.js compiles ONNX WASM modules at runtime using WebAssembly instantiation, which requires either `'wasm-eval'` or `'unsafe-eval'` in `script-src`. Electron 20+ sandbox mode enforces CSP; without this directive, the worker fails to initialize in the packaged app but may work in development mode (where DevTools relaxes policies). [VERIFIED: huggingface/transformers.js#774]

**Why `connect-src` lists HuggingFace domains:** The worker fetches the Whisper model from HuggingFace on first run. [ASSUMED — subdomain list may be incomplete; test during 03-01]

### Pattern 4: Instagram parser structure

```javascript
// assets/js/parser.js -- add parseInstagram() export
// Interface mirrors parseZip() -- same return shape

export async function parseInstagram(file) {
  // Validate and load the ZIP
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('Instagram export must be a .zip file');
  }

  const zip = await JSZip.loadAsync(file);

  let messageEntries = [];
  const audioFiles = new Map(); // basename -> ZipObject

  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    const basename = relativePath.split('/').pop();

    // Instagram voice audio: *.m4a (AAC in MP4 container)
    if (basename.endsWith('.m4a')) {
      audioFiles.set(basename, entry);
    }
    // Instagram messages: message_1.json, message_2.json, etc.
    if (/^message_\d+\.json$/.test(basename)) {
      messageEntries.push({ path: relativePath, entry });
    }
  });

  if (messageEntries.length === 0) {
    throw new Error('No Instagram message file found in ZIP');
  }

  // Parse all message_N.json files and merge (handles long conversations)
  let allMessages = [];
  let participants = null;

  for (const { entry } of messageEntries) {
    const raw = JSON.parse(await entry.async('string'));

    // Format validation: must have participants + messages arrays
    if (!Array.isArray(raw.participants) || !Array.isArray(raw.messages)) {
      throw new Error('Unrecognized format -- not an Instagram message export');
    }

    if (!participants) participants = raw.participants;
    allMessages = allMessages.concat(raw.messages);
  }

  // Sort oldest-first (Instagram exports newest-first)
  allMessages.sort((a, b) => (a.timestamp_ms || 0) - (b.timestamp_ms || 0));

  // Map to parser.js message shape and match audio files
  const messages = parseInstagramMessages(allMessages, audioFiles);
  const { voiceTotal, voiceMatched } = countVoiceStats(messages);

  return {
    mode: 'with-media',
    exportMode: 'instagram',
    messages,
    audioFiles,
    plainText: assemblePlainText(messages),
    stats: { voiceTotal, voiceMatched }
  };
}
```

**Key detail:** Instagram messages must be sorted by `timestamp_ms` ascending — the export is newest-first. [MEDIUM confidence — confirmed by community parser analysis]

### Anti-Patterns to Avoid

- **`loadFile` without path join:** Using `win.loadFile('index.html')` in `electron/main.js` resolves relative to `electron/` — file not found. Always use `path.join(__dirname, '..', 'index.html')`.
- **Omitting CSP in packaged app:** The transformers.js worker may work in `npm start` (dev mode relaxes sandbox) but fails in the packaged .exe. The CSP meta tag is required before packaging.
- **Setting `nodeIntegration: true`:** The app has zero Node.js requirements in the renderer. Enabling it widens the attack surface unnecessarily.
- **Disabling sandbox:** Do not set `sandbox: false` to work around CSP issues. Fix the CSP instead.
- **Custom `files` glob missing source files:** When a custom `files` array is provided, electron-builder does NOT include `**/*` automatically. Explicitly list `index.html`, `assets/**/*`, `electron/**/*`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform packaging | Custom zip/installer scripts | electron-builder | Handles ASAR, native modules, code signing stubs, icon embedding, portable target natively |
| Windows portable .exe | Manual PE wrapping | `win.target: "portable"` | electron-builder self-extraction is reliable; custom builds are fragile |
| IPC bridge (if needed later) | Custom `window.__electron` globals | contextBridge | contextBridge is the safe, isolated API; custom globals bypass context isolation |

**Key insight:** The Electron shell is a thin wrapper. All app logic stays in renderer JS. No new IPC, no new preload, no Node.js in renderer.

---

## Preload Script Determination (D-04 resolution)

**Verdict: No preload script required for Phase 3.**

The app makes no calls to:
- `app.getPath()` — Whisper model files are cached in the browser's Cache Storage / IndexedDB (renderer-accessible) by the transformers.js runtime, not in a Node.js path
- `dialog.showOpenDialog()` — the app uses HTML `<input type="file">`, which works natively in Electron renderer without IPC
- `shell.openExternal()` — no external links in the current app
- Any other main-process API

All file I/O (ZIP read, audio decode) uses the File API in the renderer. [VERIFIED: code inspection of ui.js, parser.js, worker.js — no `require('electron')` or IPC calls]

If future phases add persistent user cache via `app.getPath('userData')`, a preload with contextBridge would then be required.

---

## Instagram Format Research (PARSE-05)

### Confirmed Format Structure

Based on analysis of open-source parser instaview.py and multiple community format documentations:

**ZIP structure:**
```
instagram-<username>-<date>.zip
+-- your_instagram_activity/
    +-- messages/
        +-- inbox/
            +-- <ConversationName_hash>/
                |-- message_1.json       # messages (paginated: message_2.json etc.)
                +-- audio/
                    +-- audioclip_*.m4a  # voice message audio files
```

**message_1.json top-level structure:** [MEDIUM confidence]
```json
{
  "participants": [{ "name": "Username" }],
  "messages": [...],
  "title": "Conversation Name",
  "is_still_participant": true,
  "thread_path": "inbox/ConversationName_xxxxx",
  "magic_words": []
}
```

**Text message object:**
```json
{
  "sender_name": "Username",
  "timestamp_ms": 1700000000000,
  "content": "Hello"
}
```

**Voice message via audio_files array (current format):** [MEDIUM confidence — instaview.py source]
```json
{
  "sender_name": "Username",
  "timestamp_ms": 1700000000000,
  "audio_files": [
    {
      "uri": "your_instagram_activity/messages/inbox/ConversationName/audio/audioclip_12345.m4a",
      "creation_timestamp": 1700000000
    }
  ]
}
```

**Voice message via voice_media field (older format):** [MEDIUM confidence — instaview.py source]
```json
{
  "sender_name": "Username",
  "timestamp_ms": 1700000000000,
  "voice_media": "https://..."
}
```

**Detection logic:**
1. Root JSON has `participants` array + `messages` array + `thread_path` string = Instagram format
2. `message.audio_files` array with length > 0 = voice message (current format)
3. `message.voice_media` string present and non-empty = voice message (older format)
4. Audio file lookup: take `basename` of `uri` field (last segment after `/`) -> Map lookup in audioFiles
5. Audio codec: `.m4a` = AAC in MPEG-4 container = decodable natively via `AudioContext.decodeAudioData()` in Chromium/Electron [VERIFIED: MDN Web Audio API format support table]

### Encoding Gotcha — Latin-1 Garbled Text

Instagram JSON exports garble non-ASCII characters using Latin-1 byte escaping: `e` with accent becomes a two-character sequence instead of a single character. This affects sender names and message content with any non-ASCII character.

Fix: re-encode strings using `TextDecoder` approach or the `escape`/`decodeURIComponent` combination. The planner should include a `fixInstagramEncoding(str)` helper in 03-02 that is applied to all string fields read from the JSON before display. [MEDIUM confidence — confirmed by multiple community parsers; instaview.py applies this fix]

### Detection Heuristic (D-07)

```javascript
// In ui.js drop handler -- route .json files to Instagram path
function isInstagramJSON(parsed) {
  return (
    Array.isArray(parsed.participants) &&
    Array.isArray(parsed.messages) &&
    typeof parsed.thread_path === 'string'
  );
}
```

The drop zone should also accept `.json` files. If a `.json` is dropped, parse it and check `isInstagramJSON`. If true, route to Instagram parser with an empty `audioFiles` Map (audio not available without the ZIP). The ZIP route is preferred as it includes audio files.

### Fallback UX (D-05, D-07)

If the ZIP is detected as Instagram but voice messages use `voice_media` pointing to an expired CDN URL (not a local file path), annotate those messages: `[Instagram voice: media expired — download the export again]`.

If Instagram format is detected but the parser cannot identify any recognizable structure, show an error screen matching the parchment aesthetic: warm background, sepia accent, no flashy states.

---

## Common Pitfalls

### Pitfall 1: loadFile path resolves from `electron/` not project root
**What goes wrong:** `win.loadFile('index.html')` in `electron/main.js` looks for `electron/index.html` — file not found; blank window.
**Why it happens:** `__dirname` in main.js is the directory containing main.js, which is `electron/`.
**How to avoid:** Always use `path.join(__dirname, '..', 'index.html')`.
**Warning signs:** Packaged app opens a blank window; DevTools shows file not found error.

### Pitfall 2: WASM blocked by sandbox CSP in packaged app
**What goes wrong:** Whisper worker fails to initialize after packaging. Worker sends `error` status; pipeline call hangs.
**Why it happens:** Electron 20+ sandbox is on by default; without `'unsafe-eval'` in `script-src`, WebAssembly instantiation is refused.
**How to avoid:** Add the CSP meta tag to `index.html` before packaging. Always test the packaged `.exe`, not just `npm start`.
**Warning signs:** Console shows "Refused to compile or instantiate WebAssembly module" or similar.

### Pitfall 3: Custom `files` glob in electron-builder misses source files
**What goes wrong:** Packaged app crashes at launch — missing `index.html`, `assets/`, or `electron/main.js`.
**Why it happens:** Providing a custom `files` array disables the default `**/*` catch-all.
**How to avoid:** Explicitly list `"index.html"`, `"assets/**/*"`, `"electron/**/*"`. Do not list `node_modules` — added automatically.
**Warning signs:** Build succeeds but app crashes with module not found on launch.

### Pitfall 4: Instagram text garbled (Latin-1 encoding)
**What goes wrong:** Sender names and message content show garbled multi-character sequences for any accented character.
**Why it happens:** Instagram's export pipeline applies Latin-1 encoding to what should be UTF-8 strings.
**How to avoid:** Apply a `fixInstagramEncoding(str)` helper to all string fields from the JSON before rendering. Use `textContent` only (same XSS rule as Phase 1).
**Warning signs:** Any user with non-ASCII name shows garbled characters.

### Pitfall 5: Instagram audio `uri` is a full path, not a basename
**What goes wrong:** `audioFiles.get(uri)` returns undefined; all voice messages annotated as `[Audio file missing]`.
**Why it happens:** The `uri` field is a full relative path like `your_instagram_activity/messages/.../audioclip.m4a`, not just the filename.
**How to avoid:** Extract basename using `.split('/').pop()` before Map lookup — same pattern as WhatsApp ZIP parser.
**Warning signs:** All Instagram voice messages fail to match despite audio files present in ZIP.

### Pitfall 6: Instagram messages newest-first order
**What goes wrong:** Chat log displayed newest-to-oldest; conversation is backwards.
**Why it happens:** Instagram exports messages in reverse-chronological order (highest `timestamp_ms` first).
**How to avoid:** Sort by `timestamp_ms` ascending after parsing: `messages.sort((a, b) => a.timestamp_ms - b.timestamp_ms)`.
**Warning signs:** Latest messages appear at the top of the reconstructed log.

---

## Code Examples

### Electron main.js boilerplate

```javascript
// electron/main.js
// Source: https://www.electronjs.org/docs/latest/tutorial/tutorial-first-app
const { app, BrowserWindow } = require('electron/main');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

### electron-builder package.json build section

```json
{
  "name": "voicefill",
  "version": "1.0.0",
  "main": "electron/main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder --win portable"
  },
  "devDependencies": {
    "electron": "^42.2.0",
    "electron-builder": "^26.8.1"
  },
  "build": {
    "appId": "com.voicefill.app",
    "productName": "VoiceFill",
    "directories": { "output": "dist" },
    "files": [
      "index.html",
      "assets/**/*",
      "electron/**/*"
    ],
    "win": {
      "target": "portable"
    }
  }
}
```

### CSP meta tag for index.html

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src https://cdn.jsdelivr.net https://huggingface.co https://cdn-lfs.hf.co https://cdn-lfs-us-1.hf.co; worker-src 'self' blob:; img-src 'self' data:;">
```

### Instagram voice message detection

```javascript
// Source: derived from instaview.py source analysis
// Check if a message object contains a voice/audio message
function isVoiceMessage(msg) {
  return (Array.isArray(msg.audio_files) && msg.audio_files.length > 0) ||
         (typeof msg.voice_media === 'string' && msg.voice_media !== '');
}

// Get the audio file basename from a voice message
function getAudioBasename(msg) {
  if (Array.isArray(msg.audio_files) && msg.audio_files.length > 0) {
    const uri = msg.audio_files[0].uri;
    return uri.split('/').pop(); // e.g. 'audioclip_12345.m4a'
  }
  return null;
}
```

### Instagram format detection

```javascript
// Minimal heuristic to identify an Instagram message JSON object
function isInstagramFormat(parsed) {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    Array.isArray(parsed.participants) &&
    Array.isArray(parsed.messages) &&
    typeof parsed.thread_path === 'string'
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `electron-packager` | `electron-builder` | ~2016 | electron-builder has more target types, better portable support |
| `app.on('ready', cb)` | `app.whenReady().then(cb)` | Electron 4+ | Promise-based; avoids subtle race conditions |
| `sandbox: false` (old default) | `sandbox: true` (default since Electron 20) | Electron 20 (2022) | Tighter security; WASM needs `'unsafe-eval'` in CSP |
| `nodeIntegration: true` | `nodeIntegration: false` (default since Electron 5) | Electron 5+ | Prevents renderer from accessing Node.js directly |
| `require('electron')` in renderer | contextBridge preload pattern | Electron 12+ | `require` unavailable when nodeIntegration is false |

**Deprecated/outdated:**
- `electron-packager`: Superseded by electron-builder for distribution scenarios; lacks portable target.
- Setting `nodeIntegration: true` to access Electron APIs: Use contextBridge + preload instead.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | HuggingFace model download uses `cdn-lfs.hf.co` and `cdn-lfs-us-1.hf.co` subdomains | CSP Pattern 3 | CSP blocks model download on first run; fix: broaden connect-src to `https://*.huggingface.co` |
| A2 | electron-builder omits `icon` field gracefully (uses default icon) when `.ico` not found | package.json pattern | Build fails; fix: create minimal icon file or remove `icon` field from config |
| A3 | Instagram `audio_files[0].uri` is always a relative path (not an https:// URL); basename extraction is sufficient | Instagram format section | Audio matching fails for URL-based URIs; fix: also check if uri starts with `http` |
| A4 | ASAR packaging does not affect the CDN-imported ES module worker constructed via `new Worker(url, {type:'module'})` | Anti-Patterns | Worker fails in packaged app; fix: add `"asar": false` to build config or use `asarUnpack` for worker.js |
| A5 | Instagram JSON `messages` array is always in reverse-chronological order (newest-first) | Instagram format, Pitfall 6 | Chat log appears in correct order already; no sort needed (harmless extra sort) |

---

## Open Questions

1. **HuggingFace CDN subdomain coverage**
   - What we know: Model download requires multiple HF subdomains; `cdn-lfs.hf.co` confirmed by issue reports
   - What's unclear: Complete list of subdomains varies by model/region/time
   - Recommendation: Start with `https://*.huggingface.co` wildcard in `connect-src`; verify model download works in packaged app during 03-01

2. **Instagram multi-part export merging**
   - What we know: Long conversations are split across `message_1.json`, `message_2.json`, etc.
   - What's unclear: Whether v1 should handle multi-part (complexity) or just message_1.json (simpler)
   - Recommendation: Parse all `message_N.json` files found in the ZIP and merge; the sort step handles ordering

3. **Instagram format regional variations**
   - What we know: Instagram restructured its JSON format in December 2020; current field names confirmed by parsers
   - What's unclear: Whether EU or Asian locales use different field names or folder structures
   - Recommendation: Log unknown field patterns during 03-02 development; add hedge comments in parser

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install, electron ., electron-builder | Assumed (git repo exists, Phase 1-2 planned) | Unknown | — |
| npm | Package installation | Assumed | Unknown | — |
| Windows OS | electron-builder --win portable | Confirmed | Windows 11 Home | — |

**Missing dependencies with no fallback:** None identified (Node.js assumed available; no evidence to the contrary).
**Missing dependencies with fallback:** None identified.

---

## Security Domain

> `security_enforcement` key is absent from config.json — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in app |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | Single-user desktop app |
| V5 Input Validation | Yes | All Instagram JSON fields validated/sanitized before display; `textContent` only |
| V6 Cryptography | No | No cryptography used |
| V1 Architecture / CSP | Yes | CSP meta tag in index.html; sandbox: true preserved |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via Instagram `sender_name` or `content` with HTML payload | Tampering | `textContent` only — enforced from Phase 1; applies unconditionally to Instagram parser |
| ZIP bomb in Instagram export | DoS | Apply same 500MB size guard as WhatsApp ZIP parser |
| Path traversal via `audio_files[].uri` | Tampering | Only use basename (last segment) for Map lookup; never resolve as filesystem path |
| Electron renderer RCE | Elevation of Privilege | `nodeIntegration: false`; `contextIsolation: true`; `sandbox: true` (default); no preload exposes Node APIs |

---

## Sources

### Primary (HIGH confidence)
- [Electron BrowserWindow docs](https://www.electronjs.org/docs/latest/api/browser-window) — loadFile, webPreferences options
- [Electron WebPreferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences) — nodeIntegration false default; contextIsolation true default; sandbox true since Electron 20
- [Electron First App Tutorial](https://www.electronjs.org/docs/latest/tutorial/tutorial-first-app) — app.whenReady(), minimal main.js, loadFile pattern
- [Electron Multithreading docs](https://www.electronjs.org/docs/latest/tutorial/multithreading) — nodeIntegrationInWorker, sandbox constraints on workers
- [Electron Sandbox docs](https://github.com/electron/electron/blob/main/docs/tutorial/sandbox.md) — sandbox behavior; minimal impact on pure browser-API apps
- [electron-builder Windows target](https://www.electron.build/win.html) — portable target type confirmed
- npm registry: `electron@42.2.0` (2012-05-18), `electron-builder@26.8.1` (2015-05-26) — both verified
- [transformers.js issue #774](https://github.com/huggingface/transformers.js/issues/774) — 'unsafe-eval' required for WASM in Electron sandbox

### Secondary (MEDIUM confidence)
- [instaview.py source](https://raw.githubusercontent.com/michabirklbauer/instagram_json_viewer/refs/heads/master/instaview.py) — Instagram JSON fields: `voice_media`, `audio_files`, `sender_name`, `timestamp_ms`; m4a audio format identified
- Haziq Sayyed Medium article — `audio_files` confirmed as message field alongside `participants` + `messages` structure; `timestamp_ms` field confirmed
- [MDN BaseAudioContext.decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData) — m4a/AAC in supported formats
- Community parser analysis — Instagram format restructured December 2020; Latin-1 encoding bug confirmed

### Tertiary (LOW confidence)
- HuggingFace CDN subdomain list (`cdn-lfs.hf.co`, `cdn-lfs-us-1.hf.co`) — inferred from issue reports; not officially documented

---

## Metadata

**Confidence breakdown:**
- Electron shell (main.js, loadFile, security defaults): HIGH — official Electron docs consulted
- electron-builder portable target: HIGH — official electron-builder docs confirm target type exists
- CSP requirement for WASM in sandbox: HIGH — verified via transformers.js issue tracker
- Instagram JSON format (participants, messages, audio_files): MEDIUM — no official Meta docs; derived from open-source parsers
- Instagram audio codec (m4a/AAC, AudioContext decodable): MEDIUM-HIGH — MDN confirms Chromium supports m4a

**Research date:** 2026-05-21
**Valid until:** 2026-08-21 (90 days — Electron/electron-builder stable; Instagram format may drift faster)
