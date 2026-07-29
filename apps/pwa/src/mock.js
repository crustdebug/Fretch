/**
 * Mock pipeline result, used until the real backend lands (Phase 1–2).
 *
 * Building the UI against this fixture is deliberate: it pins down the data
 * contract the Worker/Lambda must eventually produce, so the backend gets
 * built to fit the app rather than the reverse.
 *
 * Twinkle Twinkle is the plan's own example (§1) and is public domain, so no
 * copyrighted lyrics enter the repo.
 */

export const MOCK_RESULT = {
  id: 'mock-twinkle',
  title: 'Twinkle Twinkle Little Star',
  artist: 'Traditional',
  key: 'G',
  source: 'demo',
  confidence: 0.94,
  chordpro: [
    '{title: Twinkle Twinkle Little Star}',
    '{artist: Traditional}',
    '{key: G}',
    '',
    '[G]Twinkle twinkle [C]little [G]star',
    '[C]How I [G]wonder [D]what you [G]are',
    '[G]Up a[C]bove the [G]world so [D]high',
    '[G]Like a [C]diamond [G]in the [D]sky',
    '[G]Twinkle twinkle [C]little [G]star',
    '[C]How I [G]wonder [D]what you [G]are',
  ].join('\n'),
};

/**
 * The real pipeline stages from PROJECT_PLAN.md §6, with plausible timings.
 * The processing screen plays these back so the UX for the async flow —
 * progressive status, song appearing before chords — exists before the
 * backend does.
 */
export const PIPELINE_STAGES = [
  { id: 'acquire', label: 'Reading video', ms: 700 },
  { id: 'frames', label: 'Sampling frames', ms: 900 },
  { id: 'ocr', label: 'Reading on-screen chords', ms: 1400 },
  { id: 'filter', label: 'Filtering with chord grammar', ms: 500 },
  { id: 'songid', label: 'Identifying the song', ms: 900 },
  { id: 'lyrics', label: 'Fetching lyrics', ms: 600 },
  { id: 'assemble', label: 'Assembling your sheet', ms: 400 },
];
