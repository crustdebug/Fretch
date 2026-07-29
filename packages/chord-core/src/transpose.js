/**
 * Chord transposition (PROJECT_PLAN.md §9 Phase 4: "transpose/capo").
 *
 * Only the ROOT and the BASS (after the last slash) of a chord symbol are
 * notes. Everything between is quality/extension text that must pass through
 * untouched — critically including flats/sharps inside extensions: the 'b5'
 * in F#m7b5 is not a B-flat, and a naive find-and-replace would corrupt it.
 */

const SHARP_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_SCALE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_INDEX = new Map([
  ...SHARP_SCALE.map((n, i) => [n, i]),
  ...FLAT_SCALE.map((n, i) => [n, i]),
]);

/**
 * Transpose a single note name by n semitones.
 * @param {string} note        e.g. 'F#', 'Bb', 'C'
 * @param {number} semitones   positive = up, negative = down
 * @param {boolean} preferFlat spell the result with flats instead of sharps
 */
export function transposeNote(note, semitones, preferFlat = false) {
  const idx = NOTE_INDEX.get(note);
  if (idx === undefined) return note;
  const next = ((idx + semitones) % 12 + 12) % 12;
  return (preferFlat ? FLAT_SCALE : SHARP_SCALE)[next];
}

// Root note at the very start of a chord symbol.
const ROOT_RE = /^([A-G])(#|b)?/;
// Bass note only if the text after the LAST slash is exactly a note —
// this leaves 'C6/9' alone (the '9' is an extension, not a bass).
const BASS_RE = /\/([A-G])(#|b)?$/;

/**
 * Transpose a full chord symbol: root and bass move, the middle is untouched.
 *
 *   transposeChord('Am7/E', 2)  -> 'Bm7/F#'
 *   transposeChord('F#m7b5', 1) -> 'Gm7b5'   (the b5 survives)
 *   transposeChord('C6/9', 2)   -> 'D6/9'    (no false bass match)
 *
 * @param {string} chord
 * @param {number} semitones
 * @param {boolean} [preferFlat]
 */
export function transposeChord(chord, semitones, preferFlat = false) {
  if (!semitones) return chord;
  return String(chord)
    .replace(ROOT_RE, (m) => transposeNote(m, semitones, preferFlat))
    .replace(BASS_RE, (m) => '/' + transposeNote(m.slice(1), semitones, preferFlat));
}

/**
 * Transpose a raw ChordPro document: every [Chord] marker moves, and so does
 * the {key: X} directive — otherwise the document would disagree with its own
 * chords. Lyrics and all other directives pass through untouched. Operating
 * on the text (rather than a parsed sheet) means the output is still a valid
 * ChordPro file ready to save.
 *
 * @param {string} chordproText
 * @param {number} semitones
 * @param {boolean} [preferFlat]
 */
export function transposeChordPro(chordproText, semitones, preferFlat = false) {
  if (!semitones) return chordproText;
  return String(chordproText)
    .replace(/\[([^\]]+)\]/g, (_, c) => `[${transposeChord(c, semitones, preferFlat)}]`)
    .replace(
      /\{(\s*key\s*:\s*)([^}]+?)(\s*)\}/gi,
      (_, pre, key, post) => `{${pre}${transposeChord(key.trim(), semitones, preferFlat)}${post}}`,
    );
}
