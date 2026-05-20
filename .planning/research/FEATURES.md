# Features Research — VoiceFill

**Researched:** 2026-05-21
**Confidence note:** WebSearch and WebFetch were unavailable in this environment. WhatsApp export format findings are HIGH confidence (stable, widely documented format unchanged since ~2016, corroborated by open-source parsers). Instagram export format findings are MEDIUM confidence. Tool landscape findings are MEDIUM confidence based on training data through August 2025.

---

## WhatsApp Export Format (detailed)

### How to Export

WhatsApp (Android and iOS) offers "Export chat" from within any conversation. The user chooses:

- **Without media** — produces a single `_chat.txt` file inside a `.zip`
- **With media** — produces `_chat.txt` plus all attached media files inside a `.zip`

The zip is named after the conversation, e.g. `WhatsApp Chat with John.zip` or `WhatsApp Chat - Family.zip`.

### _chat.txt Line Format

Every message line follows this pattern:

```
[date], [time] - [Sender]: [content]
```

Real examples:

```
12/31/23, 10:30 AM - John: Hey how are you
12/31/23, 10:31 AM - Alice: Good! Voice note incoming
12/31/23, 10:31 AM - Alice: <Media omitted>
12/31/23, 10:32 AM - John: 00000023-AUDIO-2024-01-15 12.31.24.opus (file attached)
```

**System messages** (no sender) appear as:
```
12/31/23, 10:00 AM - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.
12/31/23, 10:05 AM - John created group "Family"
```

**Multi-line messages** continue on subsequent lines with no timestamp prefix — any line not starting with the date-time pattern is a continuation of the previous message.

### Voice Message Representation

#### Mode 1: Export Without Media

Voice messages (and all other media) appear as:
```
12/31/23, 10:31 AM - Alice: <Media omitted>
```

The `<Media omitted>` placeholder is used for ALL media types — photos, videos, stickers, documents, voice messages, and GIFs. There is **no way to distinguish voice from other media** in this export mode from the text alone.

#### Mode 2: Export With Media

Voice messages appear with the actual filename referenced:
```
12/31/23, 10:32 AM - John: 00000023-AUDIO-2024-01-15 12.31.24.opus (file attached)
```

The filename pattern for voice messages:
```
[sequence]-AUDIO-[YYYY-MM-DD] [HH.MM.SS].[ext] (file attached)
```

- **Sequence**: zero-padded integer, e.g. `00000023`
- **Type tag**: `AUDIO` for voice messages specifically
- **Date/time**: matches the message timestamp, space-separated, with dots for time colons
- **Extension**: `.opus` on Android (modern), `.m4a` or `.aac` on older Android/iOS, `.caf` rarely on iOS

Other media filenames follow similar patterns:
- Photos: `00000001-IMAGE-2024-01-15 10.30.00.jpg`
- Videos: `00000002-VIDEO-2024-01-15 10.30.01.mp4`
- Documents: use original filename, not the sequence pattern

The corresponding `.opus` (or other) file is present in the same zip alongside `_chat.txt`.

**Key insight for VoiceFill:** "AUDIO" in the filename is a reliable discriminator for voice messages in "with media" exports.

### Date Format Variations

WhatsApp uses the device locale to format dates. This is a significant parsing challenge:

| Locale / Region | Date Format | Example |
|-----------------|-------------|---------|
| US English | M/D/YY | `12/31/23, 10:30 AM` |
| UK / European | D/M/YY | `31/12/23, 10:30` |
| German | D.M.YY | `31.12.23, 10:30` |
| Brazilian Portuguese | D/M/YYYY | `31/12/2023 10:30` |
| 24-hour variants | same date, HH:MM | `31/12/23, 22:30` |
| iOS (some locales) | YYYY/M/D | `2023/12/31, 10:30 AM` |

**Additional variations:**
- AM/PM present on 12-hour locales; absent on 24-hour locales
- Separator between date and time is `, ` (comma-space) in most locales but can be a space only
- Year is 2-digit (YY) in most but 4-digit (YYYY) in some (Brazil, some European)
- The dash-space ` - ` between timestamp and sender name is consistent across all locales

**v1 recommendation:** Target the US English format `M/D/YY, H:MM AM/PM` first. Add a locale-detection heuristic (try parsing with multiple patterns, pick the one that successfully parses the most lines).

### Edge Cases

1. **Group chats vs. 1-on-1**: Group chats include sender names. 1-on-1 chats include sender name too (both sides named).
2. **Forwarded messages**: Prefixed with `‎<This message was forwarded>` or a Unicode left-to-right mark character before the sender.
3. **Deleted messages**: `This message was deleted` or `You deleted this message` as content.
4. **Emoji and Unicode**: Fully supported in content; sender names can contain emoji.
5. **RTL languages**: Arabic/Hebrew sender names may include directional Unicode markers.
6. **Encryption notice**: Always the first system message in any export.
7. **Very long exports**: WhatsApp splits exports at ~100,000 messages; a long conversation may require combining multiple exports.
8. **iOS vs Android differences**: iOS sometimes uses slightly different filename patterns or wraps content differently; the ` (file attached)` suffix is consistent.

---

## Instagram Export Format

### How to Export

Instagram data download is requested via Settings > Your Activity > Download Your Information (or "Download or transfer information"). The user selects "Messages" (and optionally media). Instagram emails a download link within hours to days.

### Archive Structure

```
instagram-export.zip
  messages/
    inbox/
      johndoe_abc123def/
        message_1.json
        message_2.json      (if conversation is large, paginated)
        audio/
          audioclip_12345678.m4a
          audioclip_98765432.m4a
```

Each conversation gets its own folder with a name like `<username>_<hash>`. Large conversations are split into `message_1.json`, `message_2.json`, etc., with the newest messages in `message_1.json`.

### messages_1.json Structure

```json
{
  "participants": [
    {"name": "YourUsername"},
    {"name": "TheirUsername"}
  ],
  "messages": [
    {
      "sender_name": "TheirUsername",
      "timestamp_ms": 1705312284000,
      "content": "hey",
      "type": "Generic"
    },
    {
      "sender_name": "YourUsername",
      "timestamp_ms": 1705312300000,
      "audio_files": [
        {
          "uri": "messages/inbox/johndoe_abc123def/audio/audioclip_12345678.m4a",
          "creation_timestamp": 1705312299
        }
      ],
      "type": "Generic"
    }
  ],
  "title": "TheirUsername",
  "is_still_participant": true,
  "thread_type": "Regular",
  "magic_words": []
}
```

**Key fields for audio messages:**
- `audio_files` array is present instead of (or alongside) `content`
- `uri` is a relative path from the export root to the actual `.m4a` file
- Audio files ARE included in the "Download with media" option
- Format is typically `.m4a` (AAC), occasionally `.mp4`
- No separate `<Media omitted>` equivalent — if the user downloads without media, the `audio_files` array still references the URI but the file won't be present

**Confidence note (MEDIUM):** Instagram's export format has changed over time (they've migrated between JSON format versions). The structure above matches the format as of 2024; field names like `audio_files` vs `audio_messages` have varied across export versions. VoiceFill should handle both field name variants.

### Text Encoding Issue

Instagram exports often have Mojibake encoding — text that was UTF-8 encoded but stored as Latin-1. For example, `João` might appear as `JoÃ£o`. This is a known Instagram export bug affecting all text fields including sender names and message content. It does NOT affect audio file URIs.

**Mitigation:** Apply a Latin-1-to-UTF-8 decode pass on all string fields, fall back gracefully if it produces invalid characters.

### Compared to WhatsApp

| Aspect | WhatsApp | Instagram |
|--------|----------|-----------|
| Primary format | Plain text (_chat.txt) | JSON |
| Audio format | .opus (Android), .m4a (iOS) | .m4a |
| Voice detection (with media) | "AUDIO" in filename + `(file attached)` | `audio_files` field in JSON |
| Voice detection (without media) | `<Media omitted>` — ambiguous | URI present but file missing |
| Timestamp | Human-readable locale string | Unix milliseconds |
| Multi-line messages | Continuation lines (no prefix) | Single `content` field |
| Parsing complexity | Medium (regex, locale variants) | Low (structured JSON) |

---

## Existing Tool Landscape

### WhatsApp Chat Analyzers / Viewers

Several tools exist for analyzing WhatsApp exports, but virtually none address voice message transcription:

**Desktop/web analyzers (text-only):**
- **Whatsanalyze** (whatsanalyze.com) — Statistics: message counts, most active hours, word frequency, emoji usage. No media handling.
- **WhatsApp Chat Analyzer** (chat-analyzer.com and similar) — Same pattern: upload _chat.txt, get charts. Privacy varies wildly (many upload to server).
- **chat-analytics** (GitHub: nicholasgasior/chat-analytics and similar) — Open source Python scripts for stats generation from _chat.txt.
- **wa-automate** / **whatsapp-web.js** — Automation libraries, not export analyzers.

**Parsers (developer-focused):**
- **whatsapp-chat-parser** (npm) — JavaScript library that parses _chat.txt into a structured array of message objects. Well-maintained, handles locale variants. No media/audio handling.
- **WhatsApp-Chat-Exporter** (GitHub: KnugiHK/WhatsApp-Chat-Exporter) — Python tool that reads WhatsApp backups directly (not exports). Produces HTML. No transcription.

**Voice transcription tools (general, not WhatsApp-specific):**
- **OpenAI Whisper API** — Requires API key and upload, violates VoiceFill's privacy constraint.
- **whisper.cpp** — Local CLI tool, requires setup, not browser-based.
- **Whisper Web** (huggingface.co/spaces) — Browser demo of Whisper via transformers.js, but for single-file transcription only, not integrated with chat exports.

### The Gap VoiceFill Fills

No existing tool combines:
1. WhatsApp export parsing (handling both `<Media omitted>` and `(file attached)` modes)
2. In-browser Whisper transcription (no upload, no API key)
3. Inline insertion of transcripts into the chat log
4. Output formatted for LLM consumption

The closest adjacent tool is the Hugging Face Whisper Web demo, but it has no awareness of chat structure — it transcribes one file at a time and produces raw text. VoiceFill's differentiator is the end-to-end pipeline: parse → match → transcribe → reconstruct → copy.

---

## Feature Categories

### Table Stakes

Features that users will assume exist. Missing any of these makes the tool feel incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Zip upload (drag & drop or file picker) | WhatsApp exports are always zips; requiring manual unzip is friction | Low | Use JSZip in-browser |
| Parse `_chat.txt` — both export modes | Core function; must handle `<Media omitted>` AND `(file attached)` | Medium | Two distinct detection paths |
| Match audio files to voice message lines | Without this, transcription has no target | Medium | Filename-based matching for "with media"; heuristic/positional for "without media" |
| Transcribe audio via in-browser Whisper | Core value prop | High | transformers.js + whisper-tiny or whisper-base |
| Insert transcripts inline in chat log | Core output | Low | String reconstruction |
| Copy-to-clipboard output | Users need to paste into Claude; one-click is table stakes | Low | Clipboard API |
| Progress indicator during transcription | Whisper takes 2-20s per message; silent waiting is unacceptable | Low | Per-message progress |
| Show total voice messages found | User needs to know scope before committing to transcription | Low | Parse-time count |
| Handle "without media" gracefully | User may not know their export mode; must not silently fail | Medium | Clear message: "No audio files found — export includes voice message placeholders but no audio. Re-export with media." |

### Differentiators

Features that distinguish VoiceFill from alternatives. Not universally expected, but high-value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Zero upload / full privacy | No other free tool offers this combination | Low (architectural) | Must be called out clearly in UI |
| Batch transcription (all voice messages in one operation) | Alternatives transcribe one file at a time | Medium | Queue + sequential processing |
| Output format optimized for Claude | "[Voice message from Alice]: ..." framing helps Claude understand the data | Low | Formatting decision, not engineering |
| Automatic audio-to-message matching | User doesn't have to manually match files to lines | Medium | Key differentiator vs generic Whisper tools |
| Instagram export support | Expands beyond WhatsApp; few tools handle both | Medium | Secondary to WhatsApp; JSON parsing is easier |
| Whisper model selection (tiny vs base) | User can trade speed for accuracy | Low | Radio button; persist choice in localStorage |
| Works offline after first model load | After Whisper model is cached, completely offline | Low (architectural) | Consequence of transformers.js approach |

### Anti-Features (deliberate exclusions for v1)

Features to explicitly NOT build, with rationale.

| Anti-Feature | Why Exclude | What to Do Instead |
|--------------|-------------|-------------------|
| Multi-language Whisper | Adds model download size, UX complexity, and per-message latency for language detection | English-only; add `lang=en` parameter to transformers.js call to force English decoding |
| Speaker diarization | Identifying who spoke in a voice message is a separate hard ML problem | Use sender name from the chat line (already available) — no audio-based speaker ID needed |
| Chat statistics / analytics | Out of scope for VoiceFill's core value; clutters the tool | Recommend Whatsanalyze for stats; VoiceFill is for transcription only |
| Editing / correcting transcripts | Whisper errors are real but inline editing adds significant UI complexity | Output is a starting point for Claude analysis; Claude handles ambiguity well |
| Persistent history / saved sessions | One-shot tool; no server, no IndexedDB persistence needed | Each run is fresh; user copies output |
| Mobile-responsive layout | Personal use tool; desktop browser sufficient | Basic responsive enough not to break on tablets but not optimized |
| Cloud sync or share links | Violates privacy-first principle | Explicitly out of scope forever |
| PDF or formatted export | LLM consumption is plain text; formatting adds complexity | Plain text output only |
| WhatsApp backup file support (.db / .crypt) | Requires Android root or special tools; completely different pipeline | Supported export (.zip) only — direct backups are out of scope |
| Real-time / live transcription | Not relevant to exported chat logs | N/A |

---

## Feature Dependencies

```
Zip parsing
  └── _chat.txt parsing
        ├── Voice message detection ("with media" path)
        │     └── Audio file matching
        │           └── Whisper transcription
        │                 └── Inline transcript insertion
        │                       └── Copy-to-clipboard output
        └── Voice message detection ("without media" path)
              └── User error message (no audio to transcribe)

[Optional] Instagram JSON parsing
  └── Audio message detection
        └── Audio file matching (URI-based)
              └── Whisper transcription (same pipeline)
                    └── Reconstructed plain-text output
```

## MVP Recommendation

Prioritize for Phase 1:
1. Zip upload + _chat.txt parsing (both export modes)
2. Voice message detection and audio file matching ("with media" exports only)
3. Whisper transcription via transformers.js (English, whisper-tiny)
4. Inline transcript insertion with Claude-friendly formatting
5. Copy-to-clipboard
6. Progress indicator + voice message count

Defer to Phase 2:
- Instagram export support (nice-to-have, different parsing path, lower user demand)
- Whisper model selection UI (default to tiny; add toggle later)
- Locale-aware date parsing beyond US English

Defer indefinitely:
- "Without media" export transcription (there are no audio files to transcribe — this is inherently a user education problem, not an engineering one; the tool should explain the limitation clearly)

---

## Sources

- WhatsApp export format: HIGH confidence — based on training data corroborated by widespread open-source parser documentation (whatsapp-chat-parser npm package, multiple GitHub repos). Format has been stable since approximately 2016. The `<Media omitted>` and `(file attached)` patterns are consistent across platforms.
- Instagram export format: MEDIUM confidence — Instagram has revised their export schema multiple times; the `audio_files` field structure matches the post-2022 format. Verify against an actual export before implementing.
- Tool landscape: MEDIUM confidence — training data through August 2025; new tools may exist. The core observation (no existing tool combines WhatsApp parsing + in-browser Whisper + chat reconstruction) was valid as of training cutoff.
- Feature categorization: Analysis based on project requirements in PROJECT.md combined with domain knowledge of chat export tools.
