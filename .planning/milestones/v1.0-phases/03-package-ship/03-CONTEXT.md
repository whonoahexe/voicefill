# Phase 3: Package & Ship - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Package the finished VoiceFill app as a self-contained Electron desktop binary for Windows that double-clicks to launch — no terminal, no Node.js required. Add Instagram JSON exports as a secondary input format (parsed if the format is verifiable; graceful "not supported" screen if it isn't). The Whisper transcription path remains strictly offline; CDN loads for Google Fonts and transformers.js are acceptable.

</domain>

<decisions>
## Implementation Decisions

### Offline Strictness (DIST-02)
- **D-01:** **User-data offline, CDN ok for UI/library code.** The transcription path (worker.js → Whisper pipeline) must make zero network requests — no user audio leaves the device. CDN loads for Google Fonts and `@huggingface/transformers` from jsdelivr are acceptable; these are UI and library code, not user data.
- **D-02:** **Code-level guarantee is sufficient.** No runtime network interception (session.setProxy, webRequest interceptor) is needed. The offline guarantee is enforced by the worker code structure: `env.allowLocalModels = false` plus no outbound calls in the transcription path. Phase 3 documents this guarantee; no runtime enforcement added.

### Distribution Format (DIST-01)
- **D-03:** **electron-builder, Windows-only, portable .exe / .zip.** Target platform is Windows only. Distribution format is a portable executable or zip — no NSIS installer, no Start Menu shortcut, no Program Files. Someone can download, extract, and double-click to run without an install wizard.
- **D-04:** Electron shell uses standard security defaults: `nodeIntegration: false`, `contextIsolation: true`. No preload script needed if the app has no IPC requirements (the app is pure renderer-side today). Researcher confirms if any Electron APIs (e.g., `app.getPath` for cache dir) require a preload bridge.

### Instagram Support (PARSE-05)
- **D-05:** **Real attempt — parse if format is verifiable, graceful fallback if not.** The researcher verifies the current Instagram JSON export structure using official docs and any available format samples. If voice messages are identifiable and audio files are extractable, implement the parser (plan 03-02). If the format is unverifiable or audio files use a codec that can't be decoded in-browser, the app shows a graceful "not supported" screen — text chat is still reconstructed, voice lines are annotated `[Instagram voice: format not supported]`.
- **D-06:** **No real export available for testing.** Researcher relies on official Instagram documentation and publicly available format samples. Parser must hedge against format variations accordingly.
- **D-07:** Instagram detection: look for the root JSON structure characteristic of Instagram exports (e.g., `messages` array with `share` or `audio` media types). If the file is recognized as Instagram but voices are unsupported, show the fallback UX; if the file is unrecognized entirely, show the existing "unsupported format" error.

### Claude's Discretion
- Whether a preload script is needed (depends on whether any `app.*` APIs are used in the main process — researcher determines this).
- Instagram audio codec — researcher identifies what codec Instagram uses for voice messages (likely AAC/MP4). If it's decodable via `AudioContext`, implement; if not, graceful fallback.
- Exact electron-builder config fields (appId, productName, win.target) — standard values, planner decides.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Scope
- `.planning/REQUIREMENTS.md` — Phase 3 covers: DIST-01, DIST-02, PARSE-05
- `.planning/ROADMAP.md` §Phase 3 — Phase goal, success criteria, and plan breakdown (03-01: Electron shell; 03-02: Instagram parser)
- `.planning/PROJECT.md` — Core value, privacy constraint (nothing leaves the device), Electron decision rationale

### Existing Code (Integration Points)
- `index.html` — Current entry point; Electron BrowserWindow will load this file. Note: loads Google Fonts from CDN (acceptable per D-01).
- `assets/js/worker.js` — CDN import of `@huggingface/transformers@4.2.0` from jsdelivr (acceptable per D-01). `env.allowLocalModels = false` is set — confirms online-only model fetch from HuggingFace Hub.
- `assets/js/parser.js` — WhatsApp ZIP/folder/txt parser. Instagram parser (03-02) follows the same interface: `parseInstagram(file) → { messages, audioFiles, exportMode }`.
- `assets/js/ui.js` — Screen state machine; Instagram support adds a new `exportMode: 'instagram'` branch (or equivalent) and reuses existing `showScreen()` / `renderChatLog()` infrastructure.

### Design System
- `CLAUDE.md` §Design System — Parchment aesthetic. Any Instagram "not supported" screen must match: warm background, sepia accent, Courier Prime, no flashy error states.

### No external specs
No additional ADRs referenced during discussion. Researcher should verify:
- electron-builder docs for Windows portable target configuration
- Electron security best practices (nodeIntegration/contextIsolation defaults)
- Instagram JSON export format via official docs / community format samples

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `assets/js/parser.js → parseZip() / parseFolder()`: These are the existing entry points. Instagram parser (03-02) adds a `parseInstagram()` function following the same return shape `{ messages, audioFiles, exportMode }`.
- `assets/js/ui.js → showScreen()`: Existing screen state machine. Instagram support reuses `showScreen('results')` and the existing error screen pattern — no new screen needed unless Instagram audio is unsupported (then uses a new `showScreen('instagram-unsupported')` or an existing error variant).
- `assets/js/ui.js → renderChatLog()`: Existing renderer. Instagram text messages map to the same `{ sender, timestamp, body, type }` shape — reuse is likely high.

### Established Patterns
- **textContent only** — XSS rule from Phase 1 applies unconditionally to all user-content rendering, including Instagram message bodies and any "not supported" annotation text.
- **Singleton Worker** — already in place; Instagram voice files go through the same transcription queue as WhatsApp `.opus` files (if decodable).
- **No build pipeline** — Electron must work with vanilla HTML/CSS/JS served via `BrowserWindow.loadFile('index.html')`. No webpack, no bundler. All assets remain relative-path imports.

### Integration Points
- **Electron main process** (new file, e.g., `electron/main.js`): Creates `BrowserWindow`, calls `loadFile('index.html')`, sets `nodeIntegration: false`, `contextIsolation: true`. This is the only new process-level file; all app logic remains in renderer JS.
- **package.json** (new): `"main": "electron/main.js"`, `"scripts": { "start": "electron .", "build": "electron-builder --win" }`, electron and electron-builder in devDependencies.
- **Drop zone in ui.js**: Currently accepts ZIP files. Phase 3 extends drop/pick to also accept `.json` files and routes them to `parseInstagram()`.

</code_context>

<specifics>
## Specific Ideas

- Portable Windows build: electron-builder `win.target: "portable"` produces a single `.exe` that runs without installation. Alternatively `win.target: "zip"` produces an extracted folder — either works for the "portable" use case.
- Instagram voice format: researcher should specifically look for whether Instagram stores voice messages as `.mp4` audio-only files vs `.aac` — `AudioContext.decodeAudioData()` handles both natively in Chromium (Electron's renderer engine). If so, the same decode path as WhatsApp `.opus` applies.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 3-Package & Ship*
*Context gathered: 2026-05-21*
