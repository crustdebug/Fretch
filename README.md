# ReelChords

Turn a guitar-tutorial reel into a saved, text-format chord + lyric sheet.

Share a reel to the app → it reads the chords shown on screen, identifies the
song, fetches lyrics, and returns a clean [ChordPro](https://www.chordpro.org/)
sheet you can store and reuse.

The core trick: **OCR the chord text the creator put on screen**, rather than
guessing chords from audio — so the output matches what's actually being taught.

## Status

Working end to end on real videos. See [PROJECT_PLAN.md](PROJECT_PLAN.md) for
the full design.

| Phase | Scope | State |
|---|---|---|
| Spikes | de-risk acquisition + OCR | ✅ [findings](spike/) |
| 0 | monorepo, chord-core, CI | ✅ |
| 1 | edge API: reel resolver, song ID, lyrics | ✅ |
| 2 | frame extraction + OCR pipeline | ✅ |
| 3 | async queue, caching, speed | ⬜ |
| 4 | accounts + cloud songbook | ⬜ |
| 5 | hardening + observability | ⬜ |

Verified against the Spike 2 tutorial video: extracts `Em` and `D6-9/F#`,
matching the ground truth in [spike/FINDINGS_OCR.md](spike/FINDINGS_OCR.md).

## How it works

```
video ──► frame sampling ──► OCR ──► chord-grammar filter ──► ChordPro
        (<video> + canvas)  (Tesseract.js/WASM)  (chord-core)
                    │
                    └──► audio excerpt ──► AudD ──► LRCLIB lyrics
```

The whole visual pipeline runs **in the browser**: the page decodes the
video, samples ~1 fps, crops to the region where chord overlays live, and
OCRs each frame in WebAssembly. The Worker is called only for the two things
that genuinely need a server — the AudD token (must not ship to clients) and
LRCLIB (sends no CORS headers). Nothing costs per request.

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

## Documentation

- **[How it works](docs/HOW_IT_WORKS.md)** — using the app, and the backend
  architecture with the reasoning behind it
- [UI flow spec](docs/UI_FLOW.md) — screens, states, data contracts
- [PROJECT_PLAN.md](PROJECT_PLAN.md) — the original design
- [spike/](spike/) — the experiments that shaped it

## Repo layout

```
apps/pwa/            Vite + React PWA — share target, pipeline, UI
  src/pipeline/      frames · ocr · audio · orchestration
apps/worker/         Cloudflare Worker — edge API + static hosting
  src/resolver.js    third-party reel resolver (pluggable provider)
  src/music.js       AudD song ID + LRCLIB lyrics
packages/chord-core/ chord grammar, ChordPro build/parse, transpose (zero deps)
spike/               throwaway experiments + their findings
docs/                UI flow spec, design prototype
```

## Development

Requires Node ≥ 20.

```bash
npm install                                    # all workspaces
npm test                                       # all tests
npm run build --workspace apps/pwa             # build the PWA
npx wrangler dev --config apps/worker/wrangler.jsonc   # API + app on :8787
```

`packages/chord-core` has no runtime dependencies and can be tested alone:

```bash
npm test --workspace packages/chord-core
```

### Configuration

The app degrades gracefully — without any of these it still extracts chords
from uploaded videos.

| Variable | Type | Purpose |
|---|---|---|
| `RESOLVER_HOST` / `RESOLVER_PATH` | var | Instagram reel resolver endpoint |
| `RESOLVER_API_KEY` | secret | resolver API key |
| `SIGNING_KEY` | secret | signs media-proxy URLs (any long random string) |
| `AUDD_API_TOKEN` | secret | song identification; without it, sheets are chords-only |
| `DEBUG_KEY` | secret | enables `/api/debug-resolve` for diagnosing provider responses |

### Deploy

```bash
npm ci && npm run build --workspace apps/pwa      # build command
npx wrangler deploy --config apps/worker/wrangler.jsonc   # deploy command
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
