# VoiceFill — Project Guide

## What This Is

A local, privacy-first Electron desktop app that transcribes WhatsApp voice messages from chat exports using Whisper running entirely in-browser via transformers.js. Nothing leaves the device.

## Project Structure

```
.planning/
  PROJECT.md       — project context and requirements summary
  REQUIREMENTS.md  — full v1 requirements with REQ-IDs
  ROADMAP.md       — 3-phase execution plan
  STATE.md         — current phase and progress
  config.json      — workflow settings
  research/        — domain research (stack, features, architecture, pitfalls)
```

## Current State

See `.planning/STATE.md` for current phase and task status.

## Key Technical Decisions

- **In-browser Whisper**: `@huggingface/transformers` v4 + `onnx-community/whisper-tiny.en` at `dtype: 'q8'`
- **Inference**: Runs in a Web Worker (singleton pipeline, sequential queue)
- **Audio decoding**: `AudioContext.decodeAudioData()` with `sampleRate: 16000`
- **ZIP parsing**: JSZip 3.x
- **Distribution**: Electron — eliminates file:// and HTTP serving requirements
- **No build pipeline**: Vanilla HTML/CSS/JS served via Electron renderer

## Design System

- **Background**: `#f5f0e8` (warm parchment)
- **Text**: `#2c2016` (dark ink)
- **Accent**: `#8b5e3c` (sepia)
- **Texture**: Subtle CSS noise/grain overlay
- **Typography**: Courier Prime or equivalent monospace throughout
- **Aesthetic**: Warm correspondence — reconstructing a physical letter

## Critical Constraints

- Nothing leaves the device — no network requests during use (model CDN fetch on first run only)
- WhatsApp "with media" export required — "without media" has no audio files, show re-export instructions
- WhatsApp format varies by OS (Android vs iOS) and locale — handle both filename patterns and encoding edge cases
- Silence gate required before accepting any Whisper transcript (RMS energy + `no_speech_prob > 0.6`)

## GSD Workflow

This project uses GSD for planning and execution.

- `/gsd:discuss-phase N` — gather context before planning a phase
- `/gsd:plan-phase N` — create PLAN.md for a phase
- `/gsd:execute-phase N` — execute the plan
- `/gsd:progress` — check current state and advance workflow

**Current phase:** 1 — Parse Pipeline
**Next step:** `/gsd:discuss-phase 1`
