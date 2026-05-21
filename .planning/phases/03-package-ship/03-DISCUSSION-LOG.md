# Phase 3: Package & Ship - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 3-Package & Ship
**Areas discussed:** Offline strictness, Distribution target, Instagram scope

---

## Offline Strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Strict: bundle everything locally | Google Fonts embedded, transformers.js vendored. Zero network after model download. | |
| User data: no network for transcription, CDN ok for UI | transformers.js stays on CDN. Only model weights cached locally. | ✓ |
| Offline is aspirational — just document it | Keep CDN loads, note in README. | |

**User's choice:** User data: no network for transcription, CDN ok for UI

---

| Option | Description | Selected |
|--------|-------------|----------|
| Code-level guarantee is enough | Offline enforced by worker code structure. No runtime interception. | ✓ |
| Add a runtime check | Main process logs/intercepts outbound requests for test observability. | |

**User's choice:** Code-level guarantee is enough
**Notes:** Worker has no outbound calls in the transcription path by construction. No runtime enforcement needed.

---

## Distribution Target

| Option | Description | Selected |
|--------|-------------|----------|
| Just me — run with npm start | No packaging. Distribute as source. | |
| Slightly broader — portable .exe or .zip | electron-builder produces standalone binary. No Node.js required. | ✓ |
| Proper distribution — NSIS installer | Installs to Program Files, Start Menu shortcut, uninstaller. | |

**User's choice:** Slightly broader — portable .exe or .zip

---

| Option | Description | Selected |
|--------|-------------|----------|
| Windows only | Target Windows 11. Simpler. | ✓ |
| Windows + Mac | Both platforms. Requires Mac runner. | |
| You decide | Claude picks. | |

**User's choice:** Windows only

---

## Instagram Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Real attempt — parse if format verifiable | Researcher verifies format. Implement if possible, graceful fallback if not. | ✓ |
| Stub only — detect and show 'coming soon' | Drop target added, format detected, friendly stub shown. | |
| Skip entirely | Defer Instagram to v2. | |

**User's choice:** Real attempt — parse if format verifiable

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, I have one | Real export available for format verification. | |
| No, docs only | Researcher uses official docs and public samples. | ✓ |
| I can get one | Request export before execution. | |

**User's choice:** No, docs only
**Notes:** Researcher must hedge parser against format variations. No real device export available.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Graceful 'not supported' screen | Text chat reconstructed; voice lines annotated [Instagram voice: format not supported]. | ✓ |
| Block the whole phase | Don't ship Phase 3 until Instagram audio works. | |
| You decide | Claude picks (graceful degradation). | |

**User's choice:** Graceful 'not supported' screen

---

## Claude's Discretion

- Whether a preload script is needed (depends on if `app.*` main process APIs are used — researcher determines)
- Instagram audio codec identification (researcher checks if AAC/MP4 is AudioContext-decodable in Electron)
- electron-builder config fields (appId, productName, win.target values)

## Deferred Ideas

None — discussion stayed within phase scope.
