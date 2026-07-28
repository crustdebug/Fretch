# Spike 2 findings — chord OCR legibility

**Date:** 2026-07-26
**Question:** Can OCR read chord overlays off tutorial video frames, and can we
separate chords from everything else on screen?
**Answer:** Yes, decisively. And the hard part is not what the plan assumed.

---

## Test

Source: [Easiest 2 Chord Beginner Song for Guitar — America](https://www.youtube.com/shorts/wputiDZGBg4)
(YouTube Short, 53s, 2.4 MB at lowest quality)

Pipeline: `yt-dlp` → `ffmpeg` (1 fps, 2× upscale, grayscale) → Tesseract 5.4
(`--psm 11`, sparse text) → chord-grammar filter.

## Result

| Metric | Value |
|---|---|
| Frames sampled | 53 |
| OCR time | 8.5 s total, **0.16 s/frame** |
| Frames containing chords | 17 |
| Unique chords found | 4 |
| Detected progression | `Em → D6-9/F# → E → F` |

Chord frequency: `D6-9/F#` ×11, `Em` ×4, `E` ×1, `F` ×1.

The video is a two-chord song. The two dominant detections — **Em** and
**D6-9/F#** — are the correct answer. `E`/`F` singletons are partial reads of
`Em` during overlay transitions and would be removed by a min-occurrence threshold.

---

## The key finding: OCR accuracy was never the bottleneck

The plan (§11) lists *"OCR accuracy — sped-up, stylized, or handwritten-font
tutorials will miss"* as the main risk here. On this sample that was wrong.

**Tesseract read `D6-9/F#` perfectly, in all 11 frames.** The chord was then
**rejected by my own chord-grammar filter**, because the first version of the
regex had no rule for a `-` separator between stacked extensions.

Fixing the grammar took the result from 6 chord-frames to 17 and recovered the
song's primary chord.

> **The failure mode is grammar coverage, not character recognition.**

This inverts where effort should go. §11's mitigation — *"ship the chord-grammar
filter as remote config so you can improve accuracy without redeploying"* — is
therefore the single highest-value item in the plan, and should be built early
rather than in Phase 5.

## Second finding: frame layout is exploitable structure

![frame](out/ocr_frames/f_0009.png)

Every chord frame has the same anatomy:

```
┌─────────────────────┐
│      D6-9/F#        │  ← chord name, bold, top ~15% of frame
│   ┌───┬───┬───┐     │
│   │ ● │   │ ● │     │  ← fretboard diagram
│   └───┴───┴───┘     │
│    1 0 0 2 0 0      │  ← fret/finger numbers
├─────────────────────┤
│   (person playing)  │  ← noise: crop this away
└─────────────────────┘
```

Two consequences:

1. **Cropping to the top ~25% of the frame before OCR** would cut noise tokens
   dramatically (628 raw tokens, the overwhelming majority from the room behind
   the player) and speed up OCR.
2. The fret row (`1 0 0 2 0 0`) is correctly rejected as a chord but is real
   fingering data — a stretch goal (`PROJECT_PLAN.md` §12 already lists
   chord-diagram recognition).

---

## Chord grammar: current state

43/43 unit tests pass, including everything this video produced.

Accepts: `G C Em Am D7 C#m Bb Gmaj7 Dsus4 F#m7 C/G Am7/E Asus2 Cadd9`
`D6-9/F# C6/9 F#m7b5 E7#9 Bbmaj13 Am6 Dm7b5 G7sus4`

Repairs: `Arn→Am`, `Ern→Em`, `C#rn7→C#m7` (the `rn`/`m` confusion is the
classic OCR failure and is worth keeping).

Rejects: `the FOLLOW Twinkle subscribe guitar lesson 2024 Chorus Verse`
and the real noise tokens `1002 00 012 ee o}}F Pr ==`.

---

## Revised risk ranking

| Risk | Plan's view | After spikes |
|---|---|---|
| Instagram fetch | legal footnote (§11) | **confirmed blocker** — solved by share-file, see [FINDINGS.md](FINDINGS.md) |
| OCR accuracy | primary technical risk (§11) | **not the bottleneck** on clean overlays |
| Chord-grammar coverage | minor (§6 step 4) | **now the top functional risk** |
| Frame preprocessing | unmentioned | meaningful easy win (crop to overlay region) |

## Still unproven

- [ ] Handwritten / stylized / animated overlays (this sample was clean digital text)
- [ ] Videos where chords appear only in the caption, not on-screen
- [ ] Tesseract.js in-browser performance vs the 0.16 s/frame native baseline
- [ ] Whether cropping to the top region actually improves precision (easy to test)
