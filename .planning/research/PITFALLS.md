# Pitfalls Research — VoiceFill

**Domain:** In-browser audio transcription from chat export files
**Researched:** 2026-05-21
**Overall confidence:** HIGH — these pitfalls are well-documented across browser API specs, transformers.js issues, and WhatsApp export community analysis

---

## Critical Pitfalls (will break the tool if ignored)

---

### CRIT-1: SharedArrayBuffer Requires COOP/COEP Headers — Breaks `file://` Entirely

**What goes wrong:**
`transformers.js` (and any ONNX/WASM runtime that uses multi-threading) relies on `SharedArrayBuffer`. Since the Spectre/Meltdown mitigations, browsers block `SharedArrayBuffer` unless the page is served with two HTTP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

When a user double-clicks the HTML file and opens it as `file://`, there is no HTTP server — no headers can be set — and the browser will throw `ReferenceError: SharedArrayBuffer is not defined` (or silently fall back to single-threaded WASM that may still fail to allocate shared memory). The tool will not function at all.

**Warning signs:**
- `ReferenceError: SharedArrayBuffer is not defined` in console
- transformers.js logs `"SharedArrayBuffer is not available"` and refuses to load the worker
- Works on localhost but breaks when opened from the filesystem

**Prevention:**
- Do NOT support `file://` as a delivery method. Document clearly that the tool must be served (even `python -m http.server` or `npx serve` works)
- Bundle a minimal one-command server launcher: a `start.bat` / `start.sh` that runs `npx serve .` or `python -m http.server 8080` and opens the browser
- Alternatively, investigate whether `transformers.js` single-threaded mode (no SharedArrayBuffer) is viable by setting `env.backends.onnx.wasm.numThreads = 1` before loading — this eliminates the requirement but doubles transcription time on whisper-tiny
- Set the COOP/COEP headers in the server config (trivial with any static server)
- Add a startup check: `if (typeof SharedArrayBuffer === 'undefined') { showFatalError("Must be served over HTTP, not file://") }`

**Phase/component:** Phase 1 (project scaffold) — decide and document the delivery method before writing any transcription code. If choosing single-threaded fallback, verify it in Phase 2 before building the UI around it.

---

### CRIT-2: OPUS Decoding — `AudioContext.decodeAudioData` Rejects `.opus` on Some Browsers

**What goes wrong:**
WhatsApp voice messages are stored as `.opus` files (Opus codec in an OGG container). `AudioContext.decodeAudioData()` support for Opus/OGG is:

- Chrome/Edge: Supported
- Firefox: Supported
- Safari: **Not supported** — Safari's `AudioContext` does not decode OGG containers

Additionally, even in supporting browsers, loading a `.opus` file via `fetch()` and passing the `ArrayBuffer` to `decodeAudioData` can fail silently or with a `DOMException: EncodingError` if the file is malformed, has an unusual sample rate, or uses features that the browser's built-in decoder doesn't support (e.g., stereo Opus at unusual bitrates).

**Warning signs:**
- `DOMException: EncodingError` from `decodeAudioData`
- Works in Chrome but fails in Safari or Firefox on some files
- Silence or garbled audio passed to Whisper (produces hallucinations instead of real transcript)

**Prevention:**
- Scope v1 to Chrome/Edge explicitly — document this in the UI ("Works best in Chrome/Edge")
- Use `ffmpeg.wasm` as a preprocessing step to transcode Opus to PCM WAV before passing to Whisper — this sidesteps the browser codec limitation entirely and is the recommended approach in transformers.js audio examples
- Alternatively, use `libopus` compiled to WASM (e.g., via `opus-recorder` or `opusscript`) to decode manually, then feed raw PCM to Whisper
- Never rely on `decodeAudioData` as the only decoding path for Opus; always have a fallback or error message

**Phase/component:** Phase 2 (audio pipeline) — verify Opus decoding in the first spike before any other audio work. A failed decode here means Whisper gets garbage input, which produces plausible-sounding but wrong transcripts.

---

### CRIT-3: Web Worker `type: "module"` — Not Supported in All Browsers

**What goes wrong:**
`transformers.js` documentation recommends using a Worker with `type: "module"` to import its ES module. The constructor syntax is:

```js
new Worker('./whisper.worker.js', { type: 'module' })
```

Firefox added `type: "module"` Worker support in Firefox 114 (mid-2023). Safari added it in Safari 15. Chrome has had it since Chrome 80. Older browsers — and critically, some corporate/enterprise Chrome deployments locked to older versions — will throw:

```
Failed to construct 'Worker': Module scripts are not supported on DedicatedWorkerGlobalScope
```

Additionally, if the project uses a simple `<script>` tag without a bundler, importing transformers.js inside a module Worker means the Worker needs to handle its own import map — which is only supported in Chrome 89+ for workers.

**Warning signs:**
- `Worker` constructor throws on instantiation
- Works in developer's browser but fails for others
- Error about "module scripts not supported"

**Prevention:**
- Target Chrome 89+ and Firefox 114+ — document this requirement
- Use `importScripts()` with a CDN-hosted UMD build of transformers.js as the fallback inside the Worker (classic worker, no module type)
- Consider using `Blob` URL Worker construction if you need to embed the worker inline:
  ```js
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  new Worker(URL.createObjectURL(blob));
  ```
- Test explicitly in Firefox and Chrome during Phase 2

**Phase/component:** Phase 2 (transcription engine) — test Worker construction as the very first step.

---

### CRIT-4: WhatsApp Export Format Variations Break Parsing

**What goes wrong:**
WhatsApp `_chat.txt` format varies by:

1. **Phone locale** — date format differs:
   - US locale: `1/15/24, 10:30 AM - Sender: message`
   - EU locale: `15/01/2024, 10:30 - Sender: message`
   - Some locales use 24-hour clock, some 12-hour
   - Year format: 2-digit (`24`) vs 4-digit (`2024`)

2. **Android vs iOS:**
   - Android: `[1/15/24, 10:30:45 AM] Sender: message` (square brackets, includes seconds)
   - iOS: `1/15/24, 10:30 AM - Sender: message` (no brackets, no seconds)
   - Android uses LRM (Left-to-Right Mark, U+200E) and RTL marks in lines
   - iOS may include a BOM (U+FEFF) at the start of the file

3. **Group chats vs 1:1:**
   - Group chats include sender name per line
   - 1:1 chats only have two possible senders; "You" is used for the exporting user's messages

4. **Voice message placeholder text:**
   - `<Media omitted>` — export without media
   - `00000023-AUDIO-2024-01-15 at 10.30.15.opus (file attached)` — iOS with media
   - `PTT-20240115-WA0023.opus (file attached)` — Android with media (PTT = Push-To-Talk)
   - `‎audio omitted` — some locales use this instead of `<Media omitted>`

**Warning signs:**
- Parser correctly handles one test file but misses messages in others
- Date parsing fails silently (messages dropped rather than error thrown)
- Voice message lines not detected on Android exports

**Prevention:**
- Write a regex-based parser that handles ALL known date formats rather than a single strptime-style format
- Detect the date format from the first few lines rather than assuming
- Test with actual exports from both Android and iOS in US and EU locale
- For voice message detection, match on the file extension pattern (`.opus (file attached)`) rather than the full filename
- Strip BOM and directional marks at parse time: `text.replace(/^﻿/, '').replace(/‎/g, '')`
- Make the parser emit structured objects and log unparsed lines to a debug panel

**Phase/component:** Phase 1 (parser) — this is the first thing built and must handle all variants from the start, not patched later.

---

## Significant Gotchas (will cause bugs or bad UX)

---

### GOTCHA-1: Whisper Hallucination on Silence and Noise

**What goes wrong:**
Whisper is prone to generating plausible-sounding but entirely fabricated text when given:
- Silent audio (microphone accidentally activated)
- Background noise only (fan hum, ambient room sound)
- Audio shorter than ~0.5 seconds
- Audio that is not speech (music, beeps)

Common hallucinated outputs for silence: `"Thank you."`, `"Thank you for watching."`, `"you"`, `"Subtitles by..."`, `"[BLANK_AUDIO]`. These will silently corrupt the chat log — the user gets a plausible transcript that is completely wrong.

**Warning signs:**
- Very short audio files (< 1 second) producing text output
- Repeated identical transcripts across different silent files
- The word "thank" appearing suspiciously often

**Prevention:**
- Compute RMS energy of the audio before sending to Whisper:
  ```js
  const rms = Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length);
  if (rms < 0.01) { return '[silent message]'; }
  ```
- Check audio duration: if < 0.5s, skip Whisper and label as `[too short to transcribe]`
- Check Whisper's `no_speech_prob` from the output logits — transformers.js returns this; if `no_speech_prob > 0.6`, suppress the output
- Display a confidence indicator in the output: dim or annotate low-confidence transcripts

**Phase/component:** Phase 2 (transcription engine) — add silence detection before the first real transcription test. Without it, test data will silently be wrong.

---

### GOTCHA-2: transformers.js Model — CDN Hit on Every Load Breaks Privacy Promise

**What goes wrong:**
By default, `transformers.js` fetches models from HuggingFace CDN (`https://huggingface.co/`) on first load. Models are cached in the **browser's HTTP cache** (not localStorage or IndexedDB). This means:

- First run: network request to huggingface.co (expected, documented)
- Subsequent runs: served from HTTP cache — BUT HTTP cache is subject to eviction, cache control headers, private browsing, and browser storage limits. In Incognito/Private mode, cache is cleared on exit, causing a fresh CDN download every session
- The model files (whisper-tiny: ~40MB, whisper-base: ~140MB) will re-download every private session, breaking the privacy-first promise

Additionally, `transformers.js` has no built-in UI for download progress unless you implement the `progress_callback` yourself, so the first load appears frozen.

**Warning signs:**
- Network tab shows `huggingface.co` requests on every page load in a private window
- Page appears frozen for 30-60 seconds on first load with no feedback
- Users in corporate environments with HuggingFace blocked cannot use the tool at all

**Prevention:**
- Use `env.cacheDir` or configure `env.backends.onnx.wasm.wasmPaths` to point to locally bundled model files
- Bundle the model ONNX files alongside the HTML — store them in a `/models/` folder. Set `env.localModelPath` to point to the local path. This eliminates all CDN dependency after initial distribution
- If CDN-first is acceptable for v1, implement the `progress_callback` to show a progress bar during download:
  ```js
  await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
    progress_callback: (p) => updateProgressBar(p.progress)
  });
  ```
- For true offline-first: pre-download the model, bundle it in the ZIP/release, load from local path

**Phase/component:** Phase 2 (transcription setup) — decide the model delivery strategy before writing any UI. This affects the distribution format of the whole tool.

---

### GOTCHA-3: ZIP Extraction — JSZip Async Behavior and WhatsApp Path Structure

**What goes wrong:**
`JSZip.loadAsync()` is Promise-based and processes entries lazily. Common mistakes:

1. Iterating `zip.files` with `for...of` and `await` inside — this works but does NOT guarantee order of resolution; voice messages may be passed to Whisper out of chat order
2. WhatsApp zips have a nested structure: files are inside a folder named after the chat (e.g., `WhatsApp Chat with Alice/`). Naive path matching fails:
   ```
   zip.files['00000023-AUDIO-2024-01-15.opus']  // undefined
   zip.files['WhatsApp Chat with Alice/00000023-AUDIO-2024-01-15.opus']  // correct
   ```
3. JSZip returns filenames with the full path including the folder — must normalize to just the filename for matching against `_chat.txt` references
4. Large ZIPs (many voice messages) can cause the browser to freeze if all files are decompressed into memory simultaneously

**Warning signs:**
- `zip.files[filename]` returns `undefined` even though the file is in the ZIP
- Works for ZIPs with no subdirectory but fails for real WhatsApp exports
- Browser tab becomes unresponsive on ZIPs with 50+ voice messages

**Prevention:**
- Build a filename-to-zipEntry map at load time, normalizing all paths to just the basename:
  ```js
  const audioFiles = {};
  Object.keys(zip.files).forEach(path => {
    const name = path.split('/').pop();
    if (name.endsWith('.opus')) audioFiles[name] = zip.files[path];
  });
  ```
- Process voice messages sequentially, not all at once — transcribe one, update UI, then next
- Use `zipEntry.async('arraybuffer')` lazily (on demand) rather than decompressing all at load time

**Phase/component:** Phase 1 (ZIP ingestion) — normalize paths at the first parsing step so downstream code never sees full ZIP paths.

---

### GOTCHA-4: File Size and Browser Memory — Many Voice Messages

**What goes wrong:**
WhatsApp allows voice messages up to 16MB each. A chat with 50 voice messages could have 800MB of audio. Decompressing all of it into memory simultaneously will:
- Cause `RangeError: Invalid typed array length` or OOM crash
- Freeze the tab for tens of seconds
- On iOS Safari (32-bit memory limit), crash the tab reliably

Additionally, when Whisper processes audio, it resamples to 16kHz mono PCM Float32. A 16MB Opus file can decompress to a much larger PCM buffer (Opus is ~10:1 compression), so 16MB input → ~160MB Float32 buffer per message.

**Warning signs:**
- Tab crashes or becomes unresponsive with real-world exports
- `RangeError` or OOM error in console
- Works fine with 3 test messages, fails with 30

**Prevention:**
- Process messages sequentially, one at a time — never hold more than one decoded audio buffer in memory simultaneously
- After transcribing a message, explicitly nullify the buffer and hint GC: `audioBuffer = null`
- Show a per-message progress indicator so the user knows the tool is working, not frozen
- Add a soft cap warning: if the chat contains > 100 voice messages, warn the user before processing begins
- For very large ZIPs, stream the ZIP file using a streaming reader rather than loading the whole ZIP into memory at once (JSZip supports streaming via `loadAsync` with a stream, not just ArrayBuffer)

**Phase/component:** Phase 2 (transcription pipeline) — sequential processing with UI feedback must be designed in from the start, not added later.

---

### GOTCHA-5: CORS and `file://` Protocol — Which APIs Break

**What goes wrong:**
Even if `SharedArrayBuffer` were available on `file://` (it isn't), several other APIs break:

- `fetch()` to local files is blocked in Chrome on `file://` (`fetch('models/whisper.onnx')` fails with CORS error)
- `importScripts()` inside a Worker from `file://` is blocked in Chrome
- `localStorage` and `IndexedDB` technically work on `file://` but are shared across ALL local files — security issue
- Service Workers cannot be registered from `file://` at all

The net result: a tool opened via `file://` will fail to load models, fail to spawn workers, and fail to fetch any local resource.

**Warning signs:**
- `Fetch API cannot load file:///...` in console
- Worker fails to start with `SecurityError`
- Everything works on `localhost:8080` but nothing works when sharing the file directly

**Prevention:**
- The prevention is identical to CRIT-1: mandate HTTP serving
- Add a startup check that detects `window.location.protocol === 'file:'` and shows a clear error with instructions to run the local server
- Provide a `start.bat` / `start.sh` launcher that starts `npx serve .` automatically

**Phase/component:** Phase 1 (project scaffold) — the server requirement must be established and documented before building anything else.

---

### GOTCHA-6: WhatsApp `_chat.txt` Encoding — BOM, RTL Marks, and Emoji in Names

**What goes wrong:**
- iOS exports sometimes begin with a UTF-8 BOM (`\xEF\xBB\xBF` / U+FEFF). If not stripped, the first line's regex won't match because the date starts with an invisible character
- Android exports inject Left-to-Right Mark (U+200E) before the sender name and after the dash separator in lines containing RTL text
- Sender names can contain emoji, which breaks naive regex character classes (`[a-zA-Z ]` won't match `"Alice 🌸"`)
- Group chat sender names may contain `:` (e.g., `"Dr. Smith: message"`) — a naive split on `:` will produce wrong sender/message splits

**Warning signs:**
- First message in file never parses
- Messages from senders with emoji names are misattributed
- Group chats with `:` in sender names produce garbled output

**Prevention:**
- Strip BOM on file load: `text = text.replace(/^﻿/, '')`
- Strip all directional marks globally: `text = text.replace(/[‎‏‪-‮]/g, '')`
- Use a greedy sender name regex that captures everything up to the first `: ` (colon-space): `/^(.*?): (.*)$/` not `/^([a-z]+): /i`
- Test with group chats that have numeric-only names and emoji names

**Phase/component:** Phase 1 (parser) — apply all normalization at the very first text-processing step before any parsing logic runs.

---

## Minor Issues (worth knowing but lower priority)

---

### MINOR-1: transformers.js Progress Callback API Changes Between Versions

**What goes wrong:**
The shape of the object passed to `progress_callback` has changed between transformers.js major versions. In v2.x the shape differs from v3.x. If code references `progress.progress` vs `progress.loaded / progress.total`, one will be undefined and the progress bar will show NaN% or 0%.

**Prevention:**
- Pin to a specific transformers.js version and check the changelog before upgrading
- Defensive progress handler: `const pct = progress.progress ?? (progress.loaded / progress.total * 100) ?? 0`

**Phase/component:** Phase 2 (transcription UI) — minor, caught immediately in testing.

---

### MINOR-2: `AudioContext` Requires User Gesture in Some Browsers

**What goes wrong:**
Chrome and Safari require `AudioContext` to be created (or resumed) within a user gesture handler (click, keydown, etc.). If the code creates an `AudioContext` during page load or when a file is first dropped, it may be in `suspended` state and `decodeAudioData` calls will queue but never resolve.

**Warning signs:**
- `AudioContext` state is `"suspended"` after creation
- `decodeAudioData` never resolves or rejects — just hangs

**Prevention:**
- Create `AudioContext` lazily inside a click/drop event handler, not at module load time
- After creating it, call `audioCtx.resume()` and await it before calling `decodeAudioData`

**Phase/component:** Phase 2 (audio pipeline).

---

### MINOR-3: JSZip Handles ZIP64 Poorly on Some Browsers

**What goes wrong:**
ZIP64 format (required for ZIPs > 4GB or with > 65535 files) is not fully supported by older JSZip versions. WhatsApp exports are unlikely to hit 4GB, but very active group chats with lots of media could approach this.

**Prevention:**
- For v1, document a maximum ZIP size (e.g., "tested with exports up to 500MB")
- Use JSZip 3.x which has better ZIP64 support than 2.x

**Phase/component:** Low priority — add a file size check on ZIP upload and warn if > 500MB.

---

### MINOR-4: WhatsApp "Export Without Media" vs "Export With Media" — Silent Mismatch

**What goes wrong:**
If the user exports chat "without media" and uploads only the `.txt` file, voice message lines appear as `<Media omitted>` — there are no audio files to transcribe. If the tool tries to match these to audio files that don't exist, it may silently produce a broken output or loop forever waiting for files.

**Prevention:**
- Detect at parse time whether voice message lines reference filenames or just `<Media omitted>`
- If `<Media omitted>` is found and no audio files are present, show a friendly message explaining how to re-export with media
- Never treat missing audio as a silent skip — always label the line as `[voice message — no audio file available]`

**Phase/component:** Phase 1 (parser + UI) — handle this at parse time and surface it clearly to the user.

---

### MINOR-5: Whisper Tiny vs Base — Quality Cliff for Accented Speech

**What goes wrong:**
Whisper Tiny (39MB quantized) has noticeably worse performance on:
- Non-native English speakers
- Low-quality microphone audio
- Fast speech
- Messages with background noise

The quality difference between Tiny and Base (~140MB quantized) is meaningful for real-world WhatsApp voice messages (often recorded on the go, not in quiet conditions).

**Prevention:**
- Offer both in the UI with a note: "Tiny: fast (39MB), Base: more accurate (140MB)"
- Default to Base for quality — Tiny is the fallback for slow machines
- In the output, label each transcript with the model used

**Phase/component:** Phase 2 (model selection) — decide default in Phase 2, expose toggle in Phase 3 UI polish.

---

## Phase-Specific Warning Matrix

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|---------------|------------|
| Phase 1 | Project scaffold | file:// delivery assumption | Mandate HTTP serving; add startup check |
| Phase 1 | ZIP ingestion | Nested path in WhatsApp ZIP | Normalize all filenames at ingest |
| Phase 1 | Chat parser | BOM + RTL marks + locale date formats | Strip encoding artifacts first; detect date format |
| Phase 1 | Voice line detection | Android (PTT-*) vs iOS filename format | Match on `.opus (file attached)` pattern, not full name |
| Phase 2 | Worker setup | SharedArrayBuffer absent | Check at startup; fall back to single-thread or block |
| Phase 2 | Worker setup | `type: "module"` Worker not supported | Target modern Chrome/Firefox explicitly |
| Phase 2 | Audio decode | Opus not decodeable via AudioContext | Use ffmpeg.wasm or scope to Chrome/Edge |
| Phase 2 | Model loading | CDN hit breaks privacy promise | Bundle model locally or document first-run behavior |
| Phase 2 | Transcription | Hallucination on silence | RMS check + duration check + no_speech_prob gate |
| Phase 2 | Memory | All audio decompressed at once | Sequential processing, buffer nullification |
| Phase 3 | UX | No progress feedback during transcription | Per-message progress bar from Phase 2 |
| Phase 3 | UX | Export without media — silent failure | Detect and surface clearly |

---

## Sources and Confidence

| Pitfall | Confidence | Basis |
|---------|------------|-------|
| SharedArrayBuffer / COOP/COEP | HIGH | Well-documented in MDN, Chromium security notes, transformers.js README |
| Opus decoding in browsers | HIGH | MDN compatibility table, known Safari limitation |
| Web Worker module type | HIGH | MDN, Can I Use data |
| WhatsApp format variations | HIGH | Extensively documented in open-source WhatsApp parser projects (whatsapp-chat-parser, etc.) |
| Whisper hallucination on silence | HIGH | Known issue in OpenAI Whisper repo; mitigation via no_speech_prob is standard |
| transformers.js model caching | MEDIUM | HTTP cache behavior per spec; transformers.js env API from docs/training data (verify against current transformers.js v3 docs before implementing) |
| JSZip nested paths | HIGH | Standard ZIP structure for WhatsApp; JSZip API is stable |
| Memory / sequential processing | HIGH | Basic browser memory constraints + AudioContext API behavior |
| file:// protocol breakage | HIGH | Chrome security model, well-documented |
| AudioContext user gesture | HIGH | Chrome/Safari autoplay policy, documented |

**Note on transformers.js env API:** The exact property names for `env.localModelPath`, `env.backends.onnx.wasm.numThreads`, etc. should be verified against the current transformers.js v3 documentation before implementation. The behavioral expectations (local model loading, thread count control) are correct; exact API spelling may have changed.
