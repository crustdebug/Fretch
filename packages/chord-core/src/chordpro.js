/**
 * ChordPro assembly (PROJECT_PLAN.md §1 and §6 step 8).
 *
 * ChordPro is a plain-text standard: chords sit in square brackets inline with
 * the lyric they land on, and metadata sits in curly-brace directives.
 *
 *     {title: Twinkle Twinkle Little Star}
 *     {artist: Traditional}
 *
 *     [G]Twinkle twinkle [C]little [G]star
 *
 * It is the de-facto interchange format for chord sheets (OnSong, Ultimate
 * Guitar, SongBook all read it), which is why it's the target output rather
 * than something bespoke.
 */

/**
 * Escape a value for use inside a {directive: value} line.
 * Newlines and closing braces would corrupt the directive.
 */
function escapeDirective(value) {
  return String(value).replace(/[\r\n]+/g, ' ').replace(/}/g, ')').trim();
}

/**
 * Build a ChordPro document.
 *
 * @param {Object} input
 * @param {string} [input.title]
 * @param {string} [input.artist]
 * @param {string} [input.key]
 * @param {string} [input.source]        - where this came from (URL or filename)
 * @param {string[]} [input.progression] - ordered chords, when we have no lyrics
 * @param {{time: number, text: string}[]} [input.lyrics] - timed lyric lines
 * @param {import('./sequence.js').ChordEvent[]} [input.events] - timed chords
 * @returns {string}
 */
export function buildChordPro(input) {
  const { title, artist, key, source, progression, lyrics, events } = input;
  const lines = [];

  if (title) lines.push(`{title: ${escapeDirective(title)}}`);
  if (artist) lines.push(`{artist: ${escapeDirective(artist)}}`);
  if (key) lines.push(`{key: ${escapeDirective(key)}}`);
  if (source) lines.push(`{comment: source: ${escapeDirective(source)}}`);
  if (lines.length) lines.push('');

  // Case 1: we have both timed lyrics and timed chords -> interleave them.
  if (lyrics?.length && events?.length) {
    lines.push(...alignChordsToLyrics(events, lyrics));
    return lines.join('\n') + '\n';
  }

  // Case 2: lyrics but no usable chord timing -> lyrics with a chord header.
  if (lyrics?.length) {
    if (progression?.length) {
      lines.push(`{comment: chords: ${progression.join(' ')}}`, '');
    }
    lines.push(...lyrics.map((l) => l.text));
    return lines.join('\n') + '\n';
  }

  // Case 3: chords only — the common Phase 2 output, before song ID lands.
  const chords = progression?.length
    ? progression
    : (events ?? []).map((e) => e.chord);

  if (chords.length) {
    lines.push('{start_of_chorus}');
    // Wrap at 8 chords per line so long progressions stay readable.
    for (let i = 0; i < chords.length; i += 8) {
      lines.push(chords.slice(i, i + 8).map((c) => `[${c}]`).join(' '));
    }
    lines.push('{end_of_chorus}');
  } else {
    lines.push('{comment: no chords detected}');
  }

  return lines.join('\n') + '\n';
}

/**
 * Place each chord immediately before the lyric line it overlaps in time.
 *
 * This is the simple version: chord goes at the start of the nearest lyric
 * line. PROJECT_PLAN.md §12 lists true syllable-level alignment (via Whisper
 * word timings) as a stretch goal.
 *
 * @param {import('./sequence.js').ChordEvent[]} events
 * @param {{time: number, text: string}[]} lyrics
 */
function alignChordsToLyrics(events, lyrics) {
  const out = [];
  let ei = 0;

  for (let li = 0; li < lyrics.length; li++) {
    const line = lyrics[li];
    const nextTime = lyrics[li + 1]?.time ?? Infinity;

    // Collect every chord event that starts before the next lyric line does.
    const here = [];
    while (ei < events.length && events[ei].start < nextTime) {
      here.push(events[ei].chord);
      ei++;
    }

    out.push(here.length ? `${here.map((c) => `[${c}]`).join('')}${line.text}` : line.text);
  }

  // Any chords left over after the final lyric line.
  if (ei < events.length) {
    out.push(events.slice(ei).map((e) => `[${e.chord}]`).join(' '));
  }

  return out;
}
