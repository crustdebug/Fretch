# How ReelChords works

Two audiences, two halves. Part 1 is what a user does and sees. Part 2 is
what happens underneath, and why it's built that way.

---

# Part 1 — Using the app

## Getting the app

Open the site and tap **Install app** in the top bar.

- **Android (Chrome)** — the native install dialog appears; accept it and
  ReelChords lands on your home screen.
- **iPhone (Safari)** — no install event exists, so the button shows
  instructions: Share → *Add to Home Screen*.
- **Desktop (Chrome/Edge)** — installs as a windowed app.

Installing matters on Android for one specific reason: **it registers
ReelChords in the system share sheet**. Until it's installed, other apps
can't share videos to it.

## Getting chords out of a video

There are three ways in. They all converge on the same pipeline.

### 1. Upload a video file — the most reliable path

Tap **Choose a video** and pick any video from your device. Works offline
for the chord-reading part, needs no API keys, and never fails for reasons
outside your control.

### 2. Share a video to the app (Android)

From your gallery — or any app that shares actual video files — tap Share
and pick **ReelChords**. The video arrives pre-loaded.

Note the distinction that matters: *gallery apps share the video file;
Instagram shares only a link.* See below.

### 3. Paste an Instagram link

Paste an **Instagram reel** URL and the app fetches the video for you
automatically.

Reel fetching is **rate-limited to 5 per hour** — it spends a metered
third-party quota, and an open endpoint would be drained by the first
crawler that found it. Uploading files has no limit.

If fetching fails — private accounts, an unavailable reel, or the resolver
being down — the app shows the manual route: Instagram → **Share →
Download** (saves to your gallery) → then upload or share that file. A
screen recording works too; the chords only need to be visible.

**YouTube links are not supported yet.** They need a different resolver
provider than Instagram. Pasting one tells you so and points at upload
instead of failing silently.

## What makes a video work

The app reads **chord names printed on screen**. It does not listen to the
audio and guess.

Works well:
- Tutorials where chord names are overlaid as clear text (`Em`, `D6-9/F#`)
- Steady overlays that stay on screen for a second or more
- Standard digital fonts

Works poorly:
- Handwritten or heavily stylised chord text
- Chords that flash by in a few frames
- Videos with no chord text at all — only diagrams or audio

If nothing is found, the app says **"No chords on screen"** rather than
inventing something.

## Reading your sheet

Processing takes roughly **30–90 seconds** for a short video, with a live
counter (`Reading on-screen chords 14/40`) so you can see it working. It
runs on your device, not a server.

The finished sheet shows:

- **Title and artist**, when the song was identified from its audio.
  Otherwise **"Song not identified"** — which is not a failure, the chords
  are the product.
- **The chords**, either above the lyric they land on, or as a plain
  progression when there are no lyrics.
- **Transpose** — the − / + buttons shift every chord and the key together.
- **Save to songbook** — keeps it on your device, readable offline.
- **Copy ChordPro** — copies the standard text format, which Ultimate
  Guitar, OnSong, SongBook and others import directly.

## Your songbook

Everything you save appears under **Songbook**, tagged with its key.
Storage is local to your device — nothing is uploaded, and there's no
account. (Cloud sync is a later phase.)

---

# Part 2 — The backend

## The shape of it

```
┌─────────────────── the browser ────────────────────┐
│  video → frames → OCR → chord grammar → ChordPro   │
│         (canvas)  (WASM)  (chord-core)             │
└───────────────────────┬────────────────────────────┘
                        │ only when a server is unavoidable
┌───────────────────────▼────────────────────────────┐
│  Cloudflare Worker                                 │
│    /api/resolve  → third-party reel resolver       │
│    /api/media    → signed media proxy              │
│    /api/identify → AudD                            │
│    /api/lyrics   → LRCLIB                          │
│    everything else → the PWA's static assets       │
└────────────────────────────────────────────────────┘
```

**The heavy work runs on the user's device.** Video decoding, frame
sampling, and OCR — the expensive parts — never touch a server. The Worker
handles only what a browser genuinely cannot.

This is a deliberate departure from the original plan, which routed
everything through AWS Lambda + SQS. Two reasons: it costs nothing per
request and can't run out of free tier, and it removes an entire class of
failure (queues, cold starts, job state) from a project that doesn't need
it yet. The async AWS path remains the right answer at scale — it is a
Phase 3 optimisation, not a prerequisite.

## The client pipeline

`apps/pwa/src/pipeline/`

### 1. Frames — `frames.js`

Seeks a `<video>` element to each timestamp and draws onto a `<canvas>`:
~1 fps, capped at 40 frames.

*Why not ffmpeg.wasm, as the plan specified?* It's ~30 MB and requires
`SharedArrayBuffer`, which needs COOP/COEP headers that complicate
Cloudflare's asset serving. The browser already ships a hardware-accelerated
video decoder, and seeking uses it. For still frames at 1 fps, that is all
ffmpeg would have given us.

Three preprocessing steps, each earning its place:

| Step | Why |
|---|---|
| **Crop to the top 45%** | Spike 2 found chord overlays live at the top; the player and their room below are pure OCR noise |
| **Upscale 2×** | small overlay text OCRs far better enlarged |
| **Grayscale + contrast stretch** | separates glyph edges from busy photographic backgrounds |

### 2. OCR — `ocr.js`

Tesseract.js (Tesseract 5 compiled to WebAssembly) in a web worker, so the
UI stays responsive. Two settings carried directly from the spike:

- **PSM 11 (sparse text)** — overlays are scattered words, not a document.
  The default page-segmentation mode assumes paragraphs and does badly.
- **A chord-only character allowlist** — chords use a small fixed set of
  glyphs, so forbidding everything else eliminates whole classes of misreads
  before they happen.

### 3. Chord grammar — `packages/chord-core`

The novel part, and per Spike 2 the highest-risk one. OCR returns
everything on screen: chords, fret numbers, handles, "FOLLOW FOR MORE",
and garbage. The grammar validates each token against the structure of a
chord symbol:

```
C#m7/G#
││││ └── optional bass note
│││└──── extension: 7, 9, sus4, add9, 6-9 …
││└───── quality: m / maj / dim / aug
│└────── accidental: # or b
└─────── root: A–G
```

Because the vocabulary is small and known, the same rules **repair** OCR
errors: `Arn` isn't a chord, `Am` is, and they're one glyph apart — so
`Arn → Am`. That's the "domain-specific error-correction layer" from the
plan's §10.

> **The finding that shaped this:** Spike 2 showed Tesseract read `D6-9/F#`
> *perfectly* in all 11 frames, and an over-strict grammar threw it away.
> The bottleneck is grammar coverage, not character recognition. So the
> ruleset is data, not hardcoded regex — it can be swapped at runtime
> without redeploying.

Chords appearing in fewer than 2 frames are dropped as transition
artefacts, then consecutive repeats collapse into timed events.

### 4. Audio — `audio.js`

Web Audio decodes the video's audio track and renders a **10-second, mono,
16 kHz WAV** excerpt. Short and low-rate on purpose: enough to fingerprint,
small to upload, and per the plan's §11 we never store or forward full
audio.

This runs **in parallel** with frame extraction and OCR — song ID doesn't
depend on frames, so serialising them would waste seconds.

## The Worker

`apps/worker/src/`

### `/api/resolve` — reel resolver

Sends an Instagram URL to a third-party downloader API and returns a signed
proxy URL.

Everything provider-specific is **configuration, not code**
(`RESOLVER_HOST`, `RESOLVER_PATH`, `RESOLVER_API_KEY`) because these
services churn and get discontinued; swapping providers should be a
dashboard change. Response parsing scores all URLs in the JSON by how
video-like they are rather than assuming one provider's schema, so a
provider that nests its answer differently still works.

### `/api/media` — signed proxy

Instagram's CDN sends no CORS headers, so a browser **cannot** fetch the
resolved URL directly. The Worker streams it through our origin instead.

A naive proxy here would let anyone relay arbitrary traffic through your
Worker. So every proxy URL carries an **HMAC signature with a 10-minute
expiry**, and only URLs the resolver itself produced will verify. Forged or
expired signatures get `403`.

### `/api/identify` — song ID

Posts the audio excerpt to AudD. The token stays server-side, which is the
entire reason this endpoint exists.

Returns `200` with `song: null` when nothing matches — an unidentified song
is a normal outcome, not an error, because the chords are still the product.

### `/api/lyrics` — lyrics

Proxies LRCLIB (free, no key, no CORS headers of its own). Prefers **synced**
lyrics, whose timestamps let chords be placed against the right line; falls
back to plain text.

### Rate limiting and caching

`ratelimit.js`. Three endpoints spend real money or bandwidth, so each gets
a per-IP hourly budget:

| Endpoint | Budget | Because |
|---|---|---|
| `/api/resolve` | 5/hour | metered provider quota, often tiny on free tiers |
| `/api/identify` | 20/hour | AudD credits |
| `/api/media` | 30/hour | proxied bandwidth |

Counters live in Cloudflare KV when the binding exists, with an in-memory
per-isolate fallback otherwise — a floor rather than a guarantee, but it
never fails open.

With KV bound, resolved URLs are also **cached for 5 minutes**, and a cache
hit is checked *before* the rate limit — repeating an already-resolved reel
costs no quota, so it shouldn't count against the caller.

### `/api/debug-resolve` — diagnostics

Returns the resolver provider's raw JSON plus what the extractor made of it.
Exists because resolver free tiers are small — one call diagnoses an unknown
response shape instead of several guesses. Guarded by `DEBUG_KEY`; 404s
without it, so nobody can spend your quota.

### Static hosting

The same Worker serves the PWA. One origin means the app calls `/api/*`
relative to itself and **CORS never enters the picture**.

## The share target

Static hosting can only answer `GET`, but Android shares by `POST`ing
multipart form data. The **service worker** bridges that gap: it intercepts
the POST before it leaves the device, stores the file in the Cache API, and
redirects to `/?share=video`, which the app reads on load.

The consequence is neat — **a shared video never leaves the phone** unless
it needs to.

## Configuration

The app degrades gracefully. With nothing configured, uploading a video
still produces a chord sheet.

| Variable | Type | Without it |
|---|---|---|
| `RESOLVER_HOST` / `RESOLVER_PATH` | var | Instagram links show manual guidance |
| `RESOLVER_API_KEY` | secret | as above |
| `SIGNING_KEY` | secret | media proxy refuses everything |
| `AUDD_API_TOKEN` | secret | sheets are chords-only, no title or lyrics |
| `DEBUG_KEY` | secret | `/api/debug-resolve` stays 404 |
| `RATE_LIMIT_KV` | KV binding | limits fall back to per-isolate memory; no resolve caching |

## Verification

The pipeline was tested end to end in a real browser against the Spike 2
tutorial video, and extracted exactly `Em` and `D6-9/F#` — matching the
ground truth recorded in [spike/FINDINGS_OCR.md](../spike/FINDINGS_OCR.md).

117 automated tests cover the chord grammar, ChordPro build/parse round
trips, transposition edge cases (`F#m7b5`, `C6/9` — where naive
find-and-replace corrupts the chord), resolver response-shape tolerance,
signature forgery/expiry, and rate-limit budgets.

Rate limiting was verified live against `wrangler dev`: six rapid resolve
calls produced five upstream attempts and a `429` on the sixth.

## Known limits

- **OCR speed** — 30–90 s for a short video. WASM is slower than native;
  Spike 2 measured 0.16 s/frame natively.
- **Stylised overlays** — handwritten or heavily-styled chord text is
  untested and is the known weak spot.
- **No caching yet** — processing the same video twice does the work twice.
  Edge caching keyed on a content hash is Phase 3.
- **Local-only songbook** — device storage, no account, no sync.
- **Resolver dependency** — third-party downloader APIs break. The manual
  download path exists precisely because this will happen.
