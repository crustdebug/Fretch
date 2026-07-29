# UI flow — screens and states

Text companion to the visual spec (Claude artifact "ReelChords — UI Flow").
Wireframes fix **structure and states**, not look and feel; visual design is
being sourced separately.

```
share video ─┐
share link  ─┼→ 01 Home → 02 Processing → 03 Sheet ⇄ 04 Songbook
paste/upload ┘        ↑         │ (failed)
                      └─────────┘
```

## 01 Home — intake  `built`

| State | Trigger → shows |
|---|---|
| Empty | fresh open — dropzone + link input, CTA disabled |
| Video loaded | picked or via share sheet — preview, name+size, CTA enabled |
| Link OK | YouTube URL recognised — confirmation, CTA enabled |
| IG guidance | Instagram URL — teach-the-workaround panel (amber, not an error) |
| Link unknown | unsupported source — soft warning |
| Share failed | share inbox empty — gentle retry |

Open: does the grammar demo stay on Home or move to an about screen?

## 02 Processing — staged progress  `built · error state needs design`

| State | Notes |
|---|---|
| Running | 7 real pipeline stages (ids match future job-status API); cancel |
| Song found early | progressive reveal slot for title/artist mid-wait (Phase 3) |
| Failed | **undesigned** — three distinct failures need three messages: no chord text found · unreadable video · song unknown (chords-only → still go to Sheet) |
| Cached hit | < 200 ms — skips this screen entirely |

## 03 Sheet — the money screen  `built · variants need design`

Elements: header (title · artist · key · confidence) · transpose stepper ·
chord-over-word body with section labels · actions (save, copy; later export/share).

Variants: chords-only (song ID failed — never present as failure; offer manual
title) · low confidence (< ~70% → visible caveat).

Chord typography is the app's signature. Later: density control / performance
mode (big type, autoscroll).

## 04 Songbook  `built`

States: populated (list; delete needs confirm-or-undo) · empty (brand moment + CTA).
Later: search/sort, sync state. No cover art exists — design without it.

## Cross-cutting  `needs design`

- Install prompt (iOS = manual Add-to-Home-Screen instructions)
- Offline: songbook readable, Home says "can't process offline"
- First-run explanation of what the app does
- Brand: name lockup, icon, microcopy tone

## Data contract per screen

| Screen | Available | Never available |
|---|---|---|
| Home | video name/size/preview, link kind | content info before processing |
| Processing | stage id; song title/artist may arrive early | reliable % progress |
| Sheet | title, artist, key, confidence, chords(+timing), lyrics (sometimes), source | album art, BPM |
| Songbook | title, artist, saved date, key, source | cover art |
