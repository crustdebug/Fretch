/**
 * Turn per-frame chord detections into an ordered progression.
 *
 * Implements PROJECT_PLAN.md §6 step 5 ("collapse time") plus step 4b
 * ("threshold by occurrence"), which Spike 2 added: chords seen in only one or
 * two frames are typically partial reads captured mid-transition. On the test
 * video `Em` was momentarily misread as `E` and as `F` while the overlay was
 * fading — both appeared exactly once, while the real chords appeared 4 and 11
 * times. A minimum-occurrence threshold removes that class of error cleanly.
 */

import { defaultGrammar } from './grammar.js';

/**
 * @typedef {Object} FrameDetection
 * @property {number} frame      - frame index
 * @property {number} timestamp  - seconds into the video
 * @property {string[]} tokens   - raw OCR tokens for this frame
 */

/**
 * @typedef {Object} ChordEvent
 * @property {string} chord
 * @property {number} start   - seconds
 * @property {number} end     - seconds
 * @property {number} frames  - how many frames supported this event
 */

/**
 * @param {FrameDetection[]} detections
 * @param {Object} [options]
 * @param {number} [options.minOccurrences=3] - drop chords seen fewer times than this
 * @param {ReturnType<import('./grammar.js').compileGrammar>} [options.grammar]
 * @returns {{events: ChordEvent[], progression: string[], counts: Record<string, number>, repairs: Record<string, number>}}
 */
export function buildProgression(detections, options = {}) {
  const { minOccurrences = 3, grammar = defaultGrammar } = options;

  // --- Pass 1: classify every token, tally global counts -------------------
  const counts = {};
  const repairs = {};
  /** @type {{timestamp: number, chords: string[]}[]} */
  const perFrame = [];

  for (const det of detections) {
    const found = new Set();
    for (const token of det.tokens) {
      const { chord, status, rule } = grammar.classify(token);
      if (!chord) continue;
      found.add(chord);
      if (status === 'repaired') {
        const key = `${token} -> ${chord} (${rule})`;
        repairs[key] = (repairs[key] ?? 0) + 1;
      }
    }
    for (const c of found) counts[c] = (counts[c] ?? 0) + 1;
    perFrame.push({ timestamp: det.timestamp, chords: [...found] });
  }

  // --- Pass 2: drop under-supported chords ---------------------------------
  const trusted = new Set(
    Object.entries(counts)
      .filter(([, n]) => n >= minOccurrences)
      .map(([chord]) => chord),
  );

  // --- Pass 3: collapse consecutive repeats into timed events --------------
  /** @type {ChordEvent[]} */
  const events = [];
  for (const { timestamp, chords } of perFrame) {
    const present = chords.filter((c) => trusted.has(c)).sort();
    if (present.length === 0) continue;

    // A frame can legitimately show more than one chord (e.g. a progression
    // strip). Treat the sorted set as the identity for run-detection.
    const key = present.join('|');
    const last = events[events.length - 1];

    if (last && last.chord === key) {
      last.end = timestamp;
      last.frames += 1;
    } else {
      events.push({ chord: key, start: timestamp, end: timestamp, frames: 1 });
    }
  }

  return {
    events,
    progression: events.map((e) => e.chord),
    counts,
    repairs,
  };
}
