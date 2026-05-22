# Project Retrospective — VoiceFill

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v1.0 — MVP

**Shipped:** 2026-05-22
**Phases:** 3 | **Plans:** 7 | **Commits:** 67

### What Was Built

- Complete WhatsApp export parse pipeline — drag-drop ZIP input, BOM/RTL stripping, Android+iOS voice detection, four input modes
- In-browser Whisper ASR via Web Worker — @huggingface/transformers@4.2.0, two-step OfflineAudioContext decode+resample, RMS silence gate, progressive in-place DOM updates
- Parchment aesthetic UI — Courier Prime, warm parchment palette, 350ms transcript-appear animation, clipboard copy with execCommand fallback
- Electron desktop packaging — contextIsolation:true, CSP meta tag for WASM unsafe-eval, portable .exe, zero terminal required
- Instagram export support — ZIP and JSON parsing, Latin-1 encoding fix, m4a audio matching, oldest-first sort by timestamp_ms

### What Worked

- **Vertical-slice phasing was correct**: Phase 1 end-to-end with placeholders → Phase 2 real transcripts → Phase 3 packaging. Each phase produced a usable artifact with no dead ends.
- **Research-first approach caught real pitfalls**: The two-step OfflineAudioContext decode+resample (Pitfall 5), CDN import requirement in Electron renderer (Pitfall 6), and JSZip load order issue were all caught before implementation.
- **textContent-only discipline** was established in Phase 1 and held throughout all 7 plans without exception — zero XSS risks introduced.
- **Code review pass after Phase 3** caught 3 critical issues (undeclared variable, missing try/catch, null guard) before shipping.

### What Was Inefficient

- **ROADMAP.md Phase 2 checkbox was never updated** to [x] during execution — traceability state became stale. A quick STATE.md update after each phase completion would prevent this.
- **REQUIREMENTS.md traceability table was not updated** during phase transitions — required batch correction at milestone close. Requirements should be checked off as part of each plan summary.
- **No milestone audit** was run — gaps identified manually at close instead. A lightweight `/gsd:audit-milestone` pass before close would give more confidence.

### Patterns Established

- **Pipeline singleton storing Promise (not resolved value)** — prevents duplicate model downloads across Worker restarts
- **Two-step OfflineAudioContext** (48kHz decode, 16kHz resample) — required for Whisper; single-context does not auto-resample
- **CSS class-driven animation** — JS applies class, CSS defines keyframe — no JS animation code
- **basename Map normalization** — `zip.forEach` basename → ZipObject map; never `zip.files[path]` directly
- **detectExportMode triple-condition guard** — prevents parse-only .txt from false-routing to without-media screen
- **processZipFile() routing layer** — routes ZIP files to WhatsApp or Instagram parser; both paths preserved

### Key Lessons

1. **Load order matters for UMD vendors**: JSZip UMD build must be a `<script>` tag before the ES module entry point — `window.JSZip` must exist when the module runs. Lesson: vendor any UMD libraries as classic scripts, document the load order as a critical constraint.
2. **CSP must come before packaging**: The `unsafe-eval` CSP meta tag must be in index.html before electron-builder packages the app — silent WASM failure in the packaged exe otherwise. Lesson: add CSP to packaging checklist at Phase 1, not Phase 3.
3. **Transformers.js API surface is narrower than documented**: `no_speech_prob` is described in Whisper papers but not exposed by the transformers.js pipeline API. Lesson: spike actual API surface before committing to a feature (RMS gate was a clean fallback).
4. **Track requirement checkbox state per plan**: Marking requirements at milestone close is a lot of batch work. Update the traceability table in each plan SUMMARY instead.

### Cost Observations

- Model: claude-sonnet-4-6 (balanced profile)
- Sessions: ~5-6 across 2 days
- Notable: 2-day wall-clock for a complete offline AI desktop app from scratch — research-first GSD workflow earned its overhead

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 MVP | 3 | 7 | First milestone — baseline established |

### Top Lessons (Verified Across Milestones)

1. Research-first approach catches pitfalls before implementation — worth the overhead
2. Vertical-slice phasing produces usable artifacts at every phase boundary
