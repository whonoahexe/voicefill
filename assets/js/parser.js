// assets/js/parser.js
// ZIP extraction and full _chat.txt parse pipeline using JSZip.
// Voice detection, BOM/RTL stripping, voice-to-audio matching, mode detection, output assembly.

// ERR-02 note: [Audio unreadable] annotation is a Phase 2 concern — audio bytes are decoded in
// Phase 2 (AudioContext.decodeAudioData). Phase 1 only matches files by basename; corrupt files
// cannot be detected here. Phase 2 injects '[Audio unreadable]' at the decode step.

// ── Regex constants ──────────────────────────────────────────────────────────

// WhatsApp _chat.txt line start: timestamp followed by ASCII hyphen or en-dash (U+2013)
const LINE_START = /^(\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s*[-–]\s*(.+)/;

// Voice message patterns
const VOICE_WITH_MEDIA = /^.+\.opus \(file attached\)$/;
const VOICE_NO_MEDIA   = /^<Media omitted>$/;

// ── parseChatText ─────────────────────────────────────────────────────────────

/**
 * Parse raw _chat.txt content into a structured message array.
 * Strips UTF-8 BOM and Unicode directional marks before parsing (PARSE-04).
 *
 * @param {string} rawText — raw string from _chat.txt
 * @returns {Array<{type: string, timestamp: string, sender?: string, content: string, basename?: string, matched?: boolean, annotation?: string, audioEntry?: object}>}
 */
export function parseChatText(rawText) {
  // Strip UTF-8 BOM U+FEFF (Pitfall 2 / PARSE-04)
  let text = rawText.replace(/^﻿/, '');

  // Strip Unicode directional marks: LRM U+200E, RLM U+200F, and range U+202A-U+202E
  // Pitfall 2: WhatsApp adds these around sender names in RTL contexts causing phantom chars
  text = text.replace(/[‎‏‪-‮]/g, '');

  const lines = text.split('\n');
  const messages = [];
  let current = null;

  for (const line of lines) {
    const match = LINE_START.exec(line);

    if (match) {
      // Flush previous message
      if (current) messages.push(current);

      const timestamp = match[1].trim();
      const rest = match[2];

      // Split on first ': ' using indexOf — NOT split() — to avoid breaking on colons in content
      // Pitfall 3: sender names never contain ': ' but message bodies can
      const colonIdx = rest.indexOf(': ');

      if (colonIdx === -1) {
        // No sender colon — system message (group join, subject change, etc.)
        current = {
          type: 'system',
          timestamp,
          content: rest,
        };
      } else {
        const sender  = rest.slice(0, colonIdx);
        const content = rest.slice(colonIdx + 2);

        if (VOICE_WITH_MEDIA.test(content)) {
          // Android: PTT-20240115-WA0001.opus (file attached)
          // iOS:     00000023-AUDIO-2024-01-15.opus (file attached)
          const basename = content.replace(' (file attached)', '').trim();
          current = {
            type: 'voice',
            timestamp,
            sender,
            content,
            basename,
            matched: false,
          };
        } else if (VOICE_NO_MEDIA.test(content)) {
          // "Without media" export — voice message omitted from export
          current = {
            type: 'voice-omitted',
            timestamp,
            sender,
            content,
          };
        } else {
          current = {
            type: 'text',
            timestamp,
            sender,
            content,
          };
        }
      }
    } else if (current) {
      // Continuation line — append to current message content
      current.content += '\n' + line;
    }
    // Lines before the first match (blank lines, etc.) are silently ignored
  }

  // Flush last message
  if (current) messages.push(current);

  return messages;
}

// ── matchVoiceToAudio ─────────────────────────────────────────────────────────

/**
 * Match voice messages to audio file entries.
 * Mutates messages array in place (sets matched, audioEntry, annotation fields).
 *
 * @param {Array} messages — output of parseChatText
 * @param {Map<string, object>} audioFiles — basename -> ZipObject or File
 * @returns {{ messages: Array, voiceTotal: number, voiceMatched: number, hasOmitted: boolean }}
 */
export function matchVoiceToAudio(messages, audioFiles) {
  let voiceTotal   = 0;
  let voiceMatched = 0;
  let hasOmitted   = false;

  for (const msg of messages) {
    if (msg.type === 'voice') {
      voiceTotal++;
      if (audioFiles.has(msg.basename)) {
        msg.matched    = true;
        msg.audioEntry = audioFiles.get(msg.basename); // ZipObject ref; bytes read in Phase 2
        voiceMatched++;
      } else {
        msg.matched    = false;
        msg.annotation = '[Audio file missing]'; // ERR-03 / D-10
      }
    } else if (msg.type === 'voice-omitted') {
      hasOmitted = true;
    }
  }

  return { messages, voiceTotal, voiceMatched, hasOmitted };
}

// ── detectExportMode ──────────────────────────────────────────────────────────

/**
 * Determine whether this is a "without-media" export.
 * CRITICAL (Pitfall 5): parse-only .txt mode (INPUT-04) has an empty audioFiles map but
 * voice lines reference filenames (not <Media omitted>), so hasOmitted is false — returns
 * 'with-media' correctly and is NOT routed to the error screen.
 *
 * @param {{ audioFiles: Map, hasOmitted: boolean, voiceMatched: number }} opts
 * @returns {'with-media'|'without-media'}
 */
function detectExportMode({ audioFiles, hasOmitted, voiceTotal, voiceMatched }) {
  // Without-media: no audio files in ZIP and evidence of audio content (either <Media omitted>
  // lines or filename references without matching files). Covers both WhatsApp export styles:
  // - Old/Android: voice lines show "<Media omitted>"
  // - New/iOS: voice lines reference PTT-*.opus but files are absent from the ZIP
  if (audioFiles.size === 0 && (hasOmitted || (voiceTotal > 0 && voiceMatched === 0))) {
    return 'without-media';
  }
  return 'with-media';
}

// ── assemblePlainText ─────────────────────────────────────────────────────────

/**
 * Assemble plain text output from parsed messages.
 * System messages are skipped.
 * Voice annotations follow D-09 and D-10.
 *
 * @param {Array} messages — output of matchVoiceToAudio
 * @returns {string} Plain text reconstructed chat log
 */
export function assemblePlainText(messages) {
  const lines = [];

  for (const msg of messages) {
    if (msg.type === 'system') continue;

    let body;
    if (msg.type === 'voice') {
      if (msg.matched) {
        body = '[Voice message: transcription pending]'; // D-09: Phase 1 placeholder
      } else {
        body = '[Audio file missing]'; // ERR-03 / D-10
      }
    } else if (msg.type === 'voice-omitted') {
      body = '[Audio not available]'; // D-10 / INPUT-04
    } else {
      body = msg.content;
    }

    lines.push(`${msg.timestamp} - ${msg.sender ?? ''}: ${body}`);
  }

  return lines.join('\n');
}

/**
 * Extract _chat.txt raw lines and audio file map from a WhatsApp export ZIP.
 *
 * @param {File} file - Browser File object from drag-drop or file picker
 * @returns {Promise<{ mode: string, messages: Array, plainText: string, stats: { voiceTotal: number, voiceMatched: number }, rawLines: string[] }>}
 * @throws {Error} 'Not a ZIP file' — if file extension is not .zip
 * @throws {Error} 'ZIP file exceeds 500MB limit' — if file is too large
 * @throws {Error} 'Invalid or corrupt ZIP file' — if JSZip rejects the file
 * @throws {Error} 'No _chat.txt found in ZIP' — if no chat text entry is found
 */
export async function parseZip(file) {
  // Validate file extension (case-insensitive)
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('Not a ZIP file');
  }

  // 500MB size guard (T-01-03: reject before JSZip.loadAsync to avoid OOM)
  if (file.size > 500 * 1024 * 1024) {
    throw new Error('ZIP file exceeds 500MB limit');
  }

  // Guard: JSZip must be available as a global (loaded via classic <script> tag in index.html)
  if (typeof JSZip === 'undefined') {
    throw new Error('ZIP library failed to load — please reload the application');
  }

  // Load ZIP — JSZip UMD build registered window.JSZip by the classic <script> tag
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (err) {
    throw new Error('Invalid or corrupt ZIP file');
  }

  let chatEntry = null;
  const audioFiles = new Map(); // basename -> ZipObject (bytes read lazily in Phase 2)

  // Iterate all entries; normalize paths to basename only (Pitfall 1 fix)
  // WhatsApp ZIPs nest files under a chat-named subfolder — full-path lookup returns undefined
  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;

    // Strip any subfolder prefix — take only the last path segment
    const basename = relativePath.split('/').pop();

    if (basename === '_chat.txt') {
      chatEntry = zipEntry;
    } else if (basename.endsWith('.txt') && chatEntry === null) {
      chatEntry = zipEntry; // fallback: some WhatsApp versions name the file after the conversation
    } else if (basename.endsWith('.opus')) {
      audioFiles.set(basename, zipEntry);
    }
  });

  if (chatEntry === null) {
    throw new Error('No chat log found in ZIP (expected _chat.txt or a .txt file)');
  }

  // Read chat text (string, not binary)
  const rawText = await chatEntry.async('string');

  // Full parse pipeline
  const messages = parseChatText(rawText);
  const { voiceTotal, voiceMatched, hasOmitted } = matchVoiceToAudio(messages, audioFiles);
  const mode      = detectExportMode({ audioFiles, hasOmitted, voiceTotal, voiceMatched });
  const plainText = assemblePlainText(messages);

  // rawLines kept for backward compat (Plan 01-01 skeleton used it; Plan 01-03 removes it)
  const rawLines = rawText.split('\n').filter(l => l.trim().length > 0);

  return { mode, messages, plainText, stats: { voiceTotal, voiceMatched }, rawLines };
}

// ── parseFolder ──────────────────────────────────────────────────────────────

/**
 * Parse a WhatsApp export from an already-extracted folder (webkitdirectory FileList).
 * INPUT-03: user selects the folder of extracted files rather than the ZIP.
 *
 * @param {FileList} fileList — from <input type="file" webkitdirectory>
 * @returns {Promise<{ mode: string, messages: Array, plainText: string, stats: { voiceTotal: number, voiceMatched: number } }>}
 */
export async function parseFolder(fileList) {
  let chatFile = null;
  const audioFiles = new Map(); // basename -> File object

  for (let i = 0; i < fileList.length; i++) {
    const file     = fileList[i];
    const basename = file.name; // FileList entries already have just the filename

    if (basename === '_chat.txt') {
      chatFile = file;
    } else if (basename.endsWith('.txt') && chatFile === null) {
      chatFile = file; // fallback: some WhatsApp versions name the file after the conversation
    } else if (basename.endsWith('.opus')) {
      audioFiles.set(basename, file); // File object — compatible for Phase 1 (bytes read in Phase 2)
    }
  }

  if (chatFile === null) {
    throw new Error('No chat log found in selected folder (expected _chat.txt or a .txt file)');
  }

  const rawText = await chatFile.text();

  const messages = parseChatText(rawText);
  const { voiceTotal, voiceMatched, hasOmitted } = matchVoiceToAudio(messages, audioFiles);
  const mode      = detectExportMode({ audioFiles, hasOmitted, voiceTotal, voiceMatched });
  const plainText = assemblePlainText(messages);

  return { mode, messages, plainText, stats: { voiceTotal, voiceMatched } };
}

// ── parseTxt ─────────────────────────────────────────────────────────────────

/**
 * Parse a raw _chat.txt file without any audio files (parse-only mode).
 * INPUT-04: user loads a chat log exported "without media" or just the text file.
 * All voice lines will be unmatched -> '[Audio file missing]'.
 * Mode is always 'with-media' (Pitfall 5: voice lines reference filenames, not <Media omitted>).
 *
 * @param {File} file — .txt File object
 * @returns {Promise<{ mode: string, messages: Array, plainText: string, stats: { voiceTotal: number, voiceMatched: number } }>}
 */
export async function parseTxt(file) {
  const rawText = await file.text();

  const messages   = parseChatText(rawText);
  const audioFiles = new Map(); // empty — no audio in parse-only mode

  const { voiceTotal, voiceMatched } = matchVoiceToAudio(messages, audioFiles);
  // Always treat parse-only .txt as 'with-media' — voice-omitted lines render as
  // '[Audio not available]' and the results screen is shown regardless of export type (WR-04).
  const mode      = 'with-media';
  const plainText = assemblePlainText(messages);

  return { mode, messages, plainText, stats: { voiceTotal, voiceMatched } };
}

// ── parseInstagram ────────────────────────────────────────────────────────────

/**
 * Fix garbled Latin-1 encoded characters in Instagram JSON exports.
 * Instagram's export pipeline applies Latin-1 encoding to what should be UTF-8 strings.
 * This affects sender names and message content containing any non-ASCII character.
 * @param {string} str — potentially garbled string from Instagram JSON
 * @returns {string} — correctly decoded UTF-8 string (or original if fix fails)
 */
function fixInstagramEncoding(str) {
  if (!str) return str;
  try { return decodeURIComponent(escape(str)); } catch { return str; }
}

/**
 * Determine if an Instagram message object is a voice/audio message.
 * Instagram voice messages appear in two confirmed formats:
 * - audio_files array (current format): contains .m4a file reference
 * - voice_media string (older format): contains a CDN URL
 * @param {Object} msg — Instagram message object from JSON
 * @returns {boolean}
 */
function isVoiceMessage(msg) {
  return (Array.isArray(msg.audio_files) && msg.audio_files.length > 0) ||
         (typeof msg.voice_media === 'string' && msg.voice_media !== '');
}

/**
 * Extract the audio file basename from an Instagram voice message.
 * The uri field is a full relative path inside the ZIP — only the last segment is used
 * as the Map key (Pitfall 5: uri is a full path, not a basename).
 * @param {Object} msg — Instagram message object from JSON
 * @returns {string|null} — basename e.g. 'audioclip_12345.m4a', or null if not extractable
 */
function getInstagramAudioBasename(msg) {
  if (Array.isArray(msg.audio_files) && msg.audio_files.length > 0) {
    const uri = msg.audio_files[0].uri;
    if (typeof uri === 'string' && uri.length > 0) {
      return uri.split('/').pop(); // e.g. 'audioclip_12345.m4a' (Pitfall 5 guard)
    }
  }
  return null;
}

/**
 * Parse an Instagram JSON export ZIP into the shared message format.
 * Instagram exports voice messages as .m4a (AAC in MPEG-4 container), decodable
 * natively via AudioContext.decodeAudioData() in Chromium/Electron.
 *
 * PARSE-05 — Instagram JSON export parsing.
 * Implements: oldest-first sort (Pitfall 6), Latin-1 encoding fix (Pitfall 4),
 * audio basename extraction (Pitfall 5), 500MB size guard (T-03-07).
 *
 * @param {File} file — .zip File object from drag-drop or file picker
 * @returns {Promise<{ mode: string, exportMode: string, messages: Array, audioFiles: Map, plainText: string, stats: { voiceTotal: number, voiceMatched: number } }>}
 * @throws {Error} 'Instagram export must be a .zip file' — if file extension is not .zip
 * @throws {Error} 'ZIP file exceeds 500MB limit' — if file is too large
 * @throws {Error} 'No Instagram message file found in ZIP' — if no message_N.json found
 * @throws {Error} 'Unrecognized format -- not an Instagram message export' — if JSON structure invalid
 */
export async function parseInstagram(file) {
  // Validate file extension
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('Instagram export must be a .zip file');
  }

  // 500MB size guard (T-03-07: mirrors parseZip() guard)
  if (file.size > 500 * 1024 * 1024) {
    throw new Error('ZIP file exceeds 500MB limit');
  }

  // Guard: JSZip must be available as a global (loaded via classic <script> tag in index.html)
  if (typeof JSZip === 'undefined') {
    throw new Error('ZIP library failed to load — please reload the application');
  }

  // Load ZIP — JSZip UMD build registered window.JSZip by the classic <script> tag
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (err) {
    throw new Error('Invalid or corrupt ZIP file');
  }

  const jsonEntries = [];          // { path, entry } for message_N.json files
  const htmlEntries = [];          // { path, entry } for message_N.html files
  const audioFiles = new Map();    // basename -> ZipObject (bytes read lazily)

  // Iterate all entries; collect message files and audio files.
  // Audio: .m4a (JSON export), .ogg and .mp4 (HTML export).
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    const basename = relativePath.split('/').pop(); // Pitfall 5: strip path prefix

    if (basename.endsWith('.m4a') || basename.endsWith('.ogg')) {
      audioFiles.set(basename, entry);
    }
    if (/^message_\d+\.json$/.test(basename)) {
      jsonEntries.push({ path: relativePath, entry });
    }
    if (/^message_\d+\.html$/.test(basename)) {
      htmlEntries.push({ path: relativePath, entry });
    }
  });

  if (jsonEntries.length === 0 && htmlEntries.length === 0) {
    throw new Error('No Instagram message file found in ZIP');
  }

  let messages;

  if (jsonEntries.length > 0) {
    // ── JSON format (older Instagram exports) ──────────────────────────────────
    let allRawMessages = [];
    for (const { entry } of jsonEntries) {
      let raw;
      try {
        raw = JSON.parse(await entry.async('string'));
      } catch (_e) {
        throw new Error('Unrecognized format -- not an Instagram message export');
      }
      if (!Array.isArray(raw.participants) || !Array.isArray(raw.messages)) {
        throw new Error('Unrecognized format -- not an Instagram message export');
      }
      allRawMessages = allRawMessages.concat(raw.messages);
    }

    // Sort ascending by timestamp_ms — Instagram JSON exports newest-first (Pitfall 6 guard)
    allRawMessages.sort((a, b) => (a.timestamp_ms || 0) - (b.timestamp_ms || 0));

    messages = allRawMessages.map(msg => {
      const sender    = fixInstagramEncoding(msg.sender_name || '');
      const content   = fixInstagramEncoding(msg.content || '');
      const timestamp = new Date(msg.timestamp_ms || 0).toLocaleString();

      if (!isVoiceMessage(msg)) {
        return { type: 'text', timestamp, sender, content };
      }

      const basename = getInstagramAudioBasename(msg);
      if (basename && audioFiles.has(basename)) {
        return { type: 'voice', timestamp, sender, content: '', basename, matched: true, audioEntry: audioFiles.get(basename) };
      }
      if (basename) {
        return { type: 'voice', timestamp, sender, content: '', basename, matched: false, annotation: '[Audio file missing]' };
      }
      // voice_media CDN URL — expired (T-03-08: never fetched or rendered as HTML)
      return { type: 'voice', timestamp, sender, content: '', matched: false, annotation: '[Instagram voice: media expired — download the export again]' };
    });
  } else {
    // ── HTML format (newer Instagram exports) ─────────────────────────────────
    // Uses DOMParser (available in Electron/Chromium renderer).
    let rawHtmlMessages = [];
    for (const { entry } of htmlEntries) {
      const html = await entry.async('string');
      const doc  = new DOMParser().parseFromString(html, 'text/html');

      for (const block of doc.querySelectorAll('div._a6-g')) {
        const sender      = fixInstagramEncoding(block.querySelector('h2._a6-h')?.textContent?.trim() || '');
        const timestampStr = block.querySelector('div._a6-o')?.textContent?.trim() || '';
        const timestamp_ms = new Date(timestampStr).getTime() || 0;
        const audioEl     = block.querySelector('audio[src]');

        if (audioEl) {
          const src      = audioEl.getAttribute('src') || '';
          const basename = src.split('/').pop();
          rawHtmlMessages.push({ _t: 'audio', sender, timestamp_ms, timestampStr, basename });
        } else {
          // Text content sits in the second non-empty child of the inner wrapper div
          const contentEl = block.querySelector('div._a6-p > div');
          let text = '';
          if (contentEl) {
            for (const child of contentEl.children) {
              const t = child.textContent?.trim();
              if (t) { text = t; break; }
            }
          }
          rawHtmlMessages.push({ _t: 'text', sender, timestamp_ms, timestampStr, content: fixInstagramEncoding(text) });
        }
      }
    }

    // Sort ascending — HTML exports are newest-first
    rawHtmlMessages.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

    messages = rawHtmlMessages.map(m => {
      const timestamp = m.timestampStr || new Date(m.timestamp_ms).toLocaleString();
      if (m._t === 'text') {
        return { type: 'text', timestamp, sender: m.sender, content: m.content };
      }
      // Audio message
      if (m.basename && audioFiles.has(m.basename)) {
        return { type: 'voice', timestamp, sender: m.sender, content: '', basename: m.basename, matched: true, audioEntry: audioFiles.get(m.basename) };
      }
      return { type: 'voice', timestamp, sender: m.sender, content: '', basename: m.basename || '', matched: false, annotation: '[Audio file missing]' };
    });
  }

  // Compute stats
  const voiceTotal   = messages.filter(m => m.type === 'voice').length;
  const voiceMatched = messages.filter(m => m.type === 'voice' && m.matched).length;

  return {
    mode: 'with-media',
    exportMode: 'instagram',
    messages,
    audioFiles,
    plainText: assemblePlainText(messages),
    stats: { voiceTotal, voiceMatched },
  };
}
