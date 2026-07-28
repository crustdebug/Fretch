# ReelChords

Turn a guitar-tutorial reel into a saved, text-format chord + lyric sheet.

Share a reel to the app → it reads the chords shown on screen, identifies the
song, fetches lyrics, and returns a clean [ChordPro](https://www.chordpro.org/)
sheet you can store and reuse.

The core trick: **OCR the chord text the creator put on screen**, rather than
guessing chords from audio — so the output matches what's actually being taught.

## Status

Early development. See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the full design.

| Phase | Scope | State |
|---|---|---|
| Spikes | de-risk acquisition + OCR | ✅ done — [findings](spike/) |
| 0 | monorepo, chord-core, CI | 🚧 in progress |
| 1 | vertical slice: song ID + lyrics | ⬜ |
| 2 | frame extraction + OCR pipeline | ⬜ |
| 3 | async queue, caching, speed | ⬜ |
| 4 | songbook + PWA polish | ⬜ |
| 5 | hardening + docs | ⬜ |

## How it works

```
share video ──► frame sampling ──► OCR ──► chord-grammar filter ──► ChordPro
                    (ffmpeg)     (Tesseract)   (chord-core)
```

Two findings from pre-build spikes shaped the design:

1. **Instagram blocks server-side media fetching.** So the app accepts the
   *shared video file itself* rather than fetching from a URL. Same user
   experience, no credentials stored, no ToS grey area.
   → [spike/FINDINGS.md](spike/FINDINGS.md)

2. **OCR accuracy is not the bottleneck — chord-grammar coverage is.** On the
   test video Tesseract read `D6-9/F#` perfectly in all 11 frames, and an
   over-strict grammar rejected it. The grammar is therefore built as swappable
   config, tunable without a redeploy.
   → [spike/FINDINGS_OCR.md](spike/FINDINGS_OCR.md)

## Repo layout

```
apps/pwa/            Vite + React PWA — share target, WASM OCR fast path
apps/worker/         Cloudflare Worker — edge API, cache, orchestration
services/processor/  AWS Lambda — frame extraction, OCR fallback, assembly
packages/chord-core/ shared chord grammar + ChordPro builder (zero deps)
infra/cloudflare/    wrangler config, KV/R2 bindings
infra/aws/           Lambda, SQS, DynamoDB definitions
spike/               throwaway experiments + their findings
```

## Development

Requires Node ≥ 20.

```bash
npm install          # install all workspaces
npm test             # run all tests
```

`packages/chord-core` has no runtime dependencies and can be tested alone:

```bash
npm test --workspace packages/chord-core
```

### Spike scripts

The `spike/` directory holds the throwaway experiments that de-risked the
project. They need Python 3, `ffmpeg`, `yt-dlp`, and `tesseract`:

```bash
python spike/ocr_chords.py <video-url-or-file>
```

## Stack

Cloudflare Pages · Workers · KV · R2 · Turnstile
AWS Lambda · SQS · DynamoDB
Upstash Redis · AudD · LRCLIB · Tesseract.js · ffmpeg.wasm

Everything runs on always-free tiers by design — see PROJECT_PLAN.md §3 for
why that constraint drove the service choices.

## Notes

Personal/portfolio project. Lyrics and recordings are copyrighted; this stores
chord sheets and references lyrics via [LRCLIB](https://lrclib.net/), and never
stores or redistributes audio.

## License

MIT
