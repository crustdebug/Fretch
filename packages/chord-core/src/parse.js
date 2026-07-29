/**
 * ChordPro parser — the inverse of chordpro.js.
 *
 * The builder produces ChordPro text for storage; the PWA needs it back as
 * structure to render chords above lyrics. Living here (not in the app) keeps
 * the format knowledge in one tested package, and the Worker will reuse it
 * later for transposed exports.
 *
 * Supported subset, matching what buildChordPro emits:
 *   {title: X} {artist: X} {key: X} {comment: X}
 *   {start_of_chorus} / {end_of_chorus}
 *   lyric lines with inline [Chord] markers
 */

/**
 * @typedef {{chord: string|null, text: string}} Segment
 * @typedef {{type: 'line', segments: Segment[]}} Line
 * @typedef {{type: 'comment', text: string}} Comment
 * @typedef {{type: 'section', name: string, items: (Line|Comment)[]}} Section
 *
 * @typedef {Object} Sheet
 * @property {string|null} title
 * @property {string|null} artist
 * @property {string|null} key
 * @property {Section[]} sections
 */

const DIRECTIVE_RE = /^\{\s*([\w-]+)\s*(?::\s*(.*?))?\s*\}$/;

/**
 * @param {string} text
 * @returns {Sheet}
 */
export function parseChordPro(text) {
  /** @type {Sheet} */
  const sheet = { title: null, artist: null, key: null, sections: [] };

  // Lines outside any explicit section land in an implicit unnamed one.
  let current = { type: 'section', name: '', items: [] };
  const flush = () => {
    if (current.items.length) sheet.sections.push(current);
  };

  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const directive = line.trim().match(DIRECTIVE_RE);
    if (directive) {
      const [, name, value = ''] = directive;
      switch (name) {
        case 'title':
        case 't':
          sheet.title = value;
          break;
        case 'artist':
        case 'subtitle':
        case 'st':
          sheet.artist = value;
          break;
        case 'key':
          sheet.key = value;
          break;
        case 'comment':
        case 'c':
          current.items.push({ type: 'comment', text: value });
          break;
        case 'start_of_chorus':
        case 'soc':
          flush();
          current = { type: 'section', name: 'chorus', items: [] };
          break;
        case 'start_of_verse':
        case 'sov':
          flush();
          current = { type: 'section', name: 'verse', items: [] };
          break;
        case 'end_of_chorus':
        case 'eoc':
        case 'end_of_verse':
        case 'eov':
          flush();
          current = { type: 'section', name: '', items: [] };
          break;
        default:
          // Unknown directive: preserve as a comment rather than lose it.
          current.items.push({ type: 'comment', text: line.trim() });
      }
      continue;
    }

    current.items.push({ type: 'line', segments: parseLine(line) });
  }

  flush();
  return sheet;
}

/**
 * Split one lyric line into chord/text segments.
 *
 *   "[G]Twinkle twinkle [C]little [G]star"
 * →  [{chord:'G', text:'Twinkle twinkle '},
 *     {chord:'C', text:'little '},
 *     {chord:'G', text:'star'}]
 *
 * Text before the first chord becomes a chordless leading segment, so lines
 * that start mid-phrase render correctly.
 *
 * @param {string} line
 * @returns {Segment[]}
 */
export function parseLine(line) {
  /** @type {Segment[]} */
  const segments = [];
  // Split keeps the captured chord names at odd indices.
  const parts = line.split(/\[([^\]]+)\]/);

  if (parts[0]) segments.push({ chord: null, text: parts[0] });
  for (let i = 1; i < parts.length; i += 2) {
    segments.push({ chord: parts[i], text: parts[i + 1] ?? '' });
  }

  // A line with no chords at all: single chordless segment.
  if (segments.length === 0) segments.push({ chord: null, text: line });
  return segments;
}
