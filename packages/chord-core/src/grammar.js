/**
 * Chord grammar — validation and OCR error correction.
 *
 * This is the "domain-specific error-correction layer" from PROJECT_PLAN.md §10,
 * and per Spike 2 it is the project's top functional risk. See
 * spike/FINDINGS_OCR.md: on the test video, Tesseract read the chord `D6-9/F#`
 * perfectly in all 11 frames and an over-strict grammar threw it away. Grammar
 * coverage — not character recognition — is what breaks.
 *
 * Everything here is expressed as swappable DATA rather than baked-in regex, so
 * the ruleset can later be served from Cloudflare KV as remote config and tuned
 * without a redeploy (PROJECT_PLAN.md §11).
 */

/**
 * The default ruleset.
 *
 * A chord name is highly structured:
 *
 *     C#m7/G#
 *     ^^^^^ ^^
 *     | ||| |
 *     | ||| +-- optional bass note after a slash (inversions)
 *     | ||+---- optional extension: 7, 9, sus4, add9, 6-9 ...
 *     | |+----- optional quality: m / maj / dim / aug
 *     | +------ optional accidental: # or b
 *     +-------- root note: A-G
 *
 * That rigid structure is what makes this work as an error-corrector as well as
 * a classifier: the space of valid chords is small and known, so a token that is
 * *almost* a chord was probably a chord that OCR got slightly wrong.
 */
export const DEFAULT_RULES = {
  root: '[A-G]',
  accidental: '(?:#|b|♯|♭)?',
  quality: '(?:m|min|maj|M|dim|aug|\\+|°|ø)?',

  // Extensions are richer than they first appear. Real tutorials use all of:
  //   G7  Cmaj7  Dsus4  Cadd9  Am6  D6-9  C6/9  F#m7b5  E7#9  Bbmaj13
  // Crucially the separator between stacked extensions may be '-', '/', or
  // nothing at all. Omitting that is the exact bug Spike 2 caught.
  extAtom: '(?:sus2|sus4|sus|add9|add11|add13|add2|alt|no3|no5|maj|M|m|2|4|5|6|7|9|11|13)',
  alteration: '(?:[#b+-](?:5|9|11|13))',

  bass: '(?:/[A-G](?:#|b)?)?',

  /**
   * Common OCR confusions, tried only when a token is NOT already a valid
   * chord. Order matters — most-specific first. 'rn' → 'm' is the classic:
   * at small sizes those glyphs are nearly identical.
   */
  ocrFixes: [
    ['rn', 'm'],
    ['l', '1'],
    ['I', '1'],
    ['O', '0'],
    ['o', '0'],
    ['§', '5'],
    ['S', '5'],
    ['|', ''],
    ['(', ''],
    [')', ''],
    ['*', ''],
    ['~', ''],
    ['_', ''],
    [',', ''],
    ['.', ''],
  ],

  /**
   * Tokens that satisfy the regex but are almost never chords in practice.
   * 'A' and 'I' are ordinary English words; a lone 'B'/'b' is usually noise.
   * 'Em', 'Am' etc. are unambiguous and deliberately NOT listed.
   */
  ambiguous: ['A', 'a', 'I', 'b', 'B'],

  /** Tokens longer than this are never chords. */
  maxTokenLength: 10,
};

/**
 * Compile a ruleset into a matcher. Kept separate from the rules themselves so
 * remote config can be swapped in at runtime.
 *
 * @param {typeof DEFAULT_RULES} [rules]
 */
export function compileGrammar(rules = DEFAULT_RULES) {
  const extension = `(?:[-/]?(?:${rules.extAtom}|${rules.alteration}))*`;
  const pattern = `^${rules.root}${rules.accidental}${rules.quality}${extension}${rules.bass}$`;
  const chordRe = new RegExp(pattern);
  const ambiguous = new Set(rules.ambiguous);

  /** Strip surrounding junk and unify unicode accidentals. */
  function normalise(token) {
    return String(token)
      .trim()
      .replace(/^[-—–:;]+|[-—–:;]+$/g, '')
      .replace(/♯/g, '#')
      .replace(/♭/g, 'b');
  }

  function isChord(token) {
    return chordRe.test(token) && !ambiguous.has(token);
  }

  /**
   * Try single substitutions from the OCR-confusion table, returning the first
   * repair that yields a valid chord.
   */
  function tryRepair(token) {
    for (const [bad, good] of rules.ocrFixes) {
      if (!token.includes(bad)) continue;
      const candidate = token.split(bad).join(good);
      if (isChord(candidate)) {
        return { chord: candidate, rule: `'${bad}'->'${good}'` };
      }
    }
    return null;
  }

  /**
   * Classify a single OCR token.
   *
   * @param {string} raw
   * @returns {{chord: string|null, status: 'exact'|'repaired'|'rejected', rule?: string}}
   */
  function classify(raw) {
    const token = normalise(raw);
    if (!token || token.length > rules.maxTokenLength) {
      return { chord: null, status: 'rejected' };
    }
    if (isChord(token)) {
      return { chord: token, status: 'exact' };
    }
    const repaired = tryRepair(token);
    if (repaired) {
      return { chord: repaired.chord, status: 'repaired', rule: repaired.rule };
    }
    return { chord: null, status: 'rejected' };
  }

  return { classify, isChord, normalise, pattern };
}

/** Convenience: a matcher using the default rules. */
export const defaultGrammar = compileGrammar();

/** @param {string} token */
export const classify = (token) => defaultGrammar.classify(token);
