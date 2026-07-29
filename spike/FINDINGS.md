# Spike findings — Instagram media acquisition

**Date:** 2026-07-26
**Question:** Can a program fetch video + audio from an Instagram reel URL?
**Answer:** Not anonymously, and not reliably from a server.

---

## Evidence

| Test | Command | Result |
|---|---|---|
| IG reel `C8kqQvBRJyf`, anonymous | `yt-dlp -J <url>` | ❌ `Instagram sent an empty media response` |
| IG reel `DAhKpJqSxNM`, anonymous | `yt-dlp -J <url>` | ❌ same error |
| **YouTube control**, anonymous | `yt-dlp -J <yt-url>` | ✅ **metadata returned** |
| IG + Chrome cookies | `--cookies-from-browser chrome` | ⚠️ Chrome not installed — untested |

Environment: yt-dlp 2026.07.04 (latest), ffmpeg 8.1.2, Windows 11, residential IP.

**The YouTube control is decisive.** Tooling, network, and ffmpeg all work.
The failure is Instagram-specific: they now require an authenticated session
for reel media.

---

## Why this invalidates the planned architecture

`PROJECT_PLAN.md` §2/§5/§6 places media fetching inside **AWS Lambda**.
Given the finding, that placement has four problems:

1. **Credential storage** — server-side fetch needs a logged-in Instagram
   session persisted in AWS. That's a personal account credential in an env var.
2. **Datacenter IP reputation** — AWS ranges are trivially identified and are
   the most aggressively blocked class of client.
3. **Shared-session blast radius** — every user's request routes through one
   account. That is the pattern that gets accounts disabled.
4. **Maintenance burden** — an ongoing cat-and-mouse game, for a portfolio project.

§11 of the plan already noted *"doing fetches client-side distributes them."*
The spike promotes that from a footnote to the primary design.

---

## Options

### A. Client-side acquisition (browser extension / native share)
The user's own browser is already logged in, so its request is indistinguishable
from normal use. No stored credentials, no shared IP, no blast radius.
Cost: needs an extension or native app — a PWA alone cannot do this cross-origin.

### B. User-supplied video file (paste link *or* share/upload the video)
The user shares the reel to the app, or downloads it and uploads it. The app
never touches Instagram at all — it receives bytes.
Cost: one extra user step. Benefit: legally and technically clean; the entire
OCR + chord pipeline is unchanged and remains the interesting part.

### C. Multi-source, deprioritise Instagram
Same pipeline, but target YouTube Shorts first (confirmed working above).
Instagram becomes a later, best-effort source.
Cost: none technically — the plan's §12 already lists multi-source as a stretch goal.

### D. Server-side with cookies (NOT recommended)
Proceed as planned, store a session cookie in Lambda. Works until it doesn't.
Risks the account and breaks unpredictably.

---

## Decision (2026-07-26)

**B + C, with Instagram share-to-app preserved as a first-class requirement.**

The key insight that reconciles "no server-side scraping" with "sharing a reel
to my app must work": Android's share sheet can hand over **the video file
itself**, not just a link.

| Share sheet option | App receives | Status |
|---|---|---|
| Share **video/file** | actual video bytes | ✅ works — no fetch, no credentials, no ToS issue |
| Share **link** | `instagram.com/reel/...` URL | ❌ blocked — would require server-side fetch |

### Real-device addendum (2026-07-29)

Tested on actual Android hardware with the deployed PWA. Two results:

1. **The share-target plumbing works end-to-end** — Instagram → Share →
   ReelChords opened the app with the shared content. ✅
2. **Instagram's share sheet only ever shares the URL**, never the video
   file. The "share the video itself" option assumed above does not exist
   inside Instagram's own share flow.

The working path costs one extra tap, entirely within Instagram:
**Share → Download** (saves the reel to the gallery), then share the saved
file from the gallery — gallery apps DO hand over real bytes — or pick it
with the in-app file chooser. The app's Instagram-link guidance teaches
this flow. Caveat: Download is unavailable on some reels (private accounts,
creator opt-out); a screen recording is the universal fallback.

So the PWA manifest's `share_target` must accept `video/*` files, **not only
`text/plain`**. User experience is unchanged (share reel → chords appear);
the implementation avoids the scraper entirely.

Acquisition paths for v1, in priority order:

1. **Shared/uploaded video file** — primary. Covers Instagram, TikTok, anything.
2. **YouTube Shorts URL** — confirmed working anonymously above.
3. **Instagram URL** — accepted, but responds with guidance to share the video
   instead. No scraping attempted.

This keeps ~95% of `PROJECT_PLAN.md` intact. Everything downstream of
acquisition — frame sampling, OCR, the chord-grammar filter, song ID, lyrics,
ChordPro assembly, the edge cache, the songbook — is untouched. The novel and
résumé-worthy part of the project was never the downloader.

### Consequence for the architecture

Because the client now supplies bytes rather than a URL, the Lambda's "fetch
reel" responsibility largely disappears. The upload goes to **R2** via a signed
URL and the job references that object. This is *simpler* than the original
design and removes the plan's biggest external dependency.

---

## Still to verify

- [ ] Does `--cookies-from-browser` work with the user's actual browser? (Edge/Firefox)
- [ ] **Are chord overlays legible enough in sampled frames for OCR?** ← the
      next real risk, and the one the whole product depends on. Test with a
      YouTube Short tutorial since acquisition works there today.
