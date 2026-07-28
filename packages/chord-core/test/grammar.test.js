import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classify, compileGrammar, DEFAULT_RULES } from '../src/index.js';

describe('chord grammar — acceptance', () => {
  const valid = [
    // basic triads
    'G', 'C', 'D', 'Em', 'Am', 'F#m', 'Bb',
    // sevenths and extensions
    'D7', 'Gmaj7', 'Am7', 'Cmaj9', 'E13',
    // suspensions and additions
    'Dsus4', 'Asus2', 'Cadd9', 'G7sus4',
    // slash / inversions
    'C/G', 'Am7/E', 'D/F#',
    // altered
    'F#m7b5', 'E7#9', 'Bbmaj13', 'Am6', 'Dm7b5',
    // the one Spike 2 caught: '-' as an extension separator
    'D6-9/F#', 'C6/9',
  ];

  for (const chord of valid) {
    test(`accepts ${chord}`, () => {
      assert.equal(classify(chord).chord, chord, `${chord} should be accepted`);
    });
  }
});

describe('chord grammar — rejection', () => {
  // Real noise tokens captured from the Spike 2 test video, plus common
  // tutorial-overlay text. These are regression tests: every one of them was
  // observed in actual OCR output.
  const invalid = [
    // English words
    'the', 'Hello', 'Twinkle', 'guitar', 'lesson', 'Chorus', 'Verse',
    // call-to-action overlay text
    'FOLLOW', 'subscribe', 'SHARE',
    // fret/finger number rows (correctly not chords)
    '1002', '00', '012', '2024',
    // OCR garbage observed in spike/out
    'ee', 'o}}F', 'Pr', '==', '~~', 'a=', '###',
  ];

  for (const token of invalid) {
    test(`rejects ${JSON.stringify(token)}`, () => {
      assert.equal(classify(token).chord, null, `${token} should be rejected`);
    });
  }
});

describe('OCR error correction', () => {
  // 'rn' renders almost identically to 'm' at small sizes — the classic
  // OCR confusion for chord overlays.
  const repairs = [
    ['Arn', 'Am'],
    ['Ern', 'Em'],
    ['C#rn7', 'C#m7'],
  ];

  for (const [broken, fixed] of repairs) {
    test(`repairs ${broken} -> ${fixed}`, () => {
      const result = classify(broken);
      assert.equal(result.chord, fixed);
      assert.equal(result.status, 'repaired');
    });
  }

  test('does not "repair" a token that is already valid', () => {
    assert.equal(classify('Am').status, 'exact');
  });

  test('does not invent a chord from pure noise', () => {
    assert.equal(classify('xyzzy').chord, null);
  });
});

describe('normalisation', () => {
  test('unifies unicode accidentals', () => {
    assert.equal(classify('C♯m').chord, 'C#m');
    assert.equal(classify('B♭').chord, 'Bb');
  });

  test('strips surrounding punctuation', () => {
    assert.equal(classify('  Em  ').chord, 'Em');
    assert.equal(classify('-G-').chord, 'G');
  });

  test('rejects over-long tokens', () => {
    assert.equal(classify('Gmaj7sus4add11b13').chord, null);
  });
});

describe('ambiguous tokens', () => {
  // 'A' and 'I' are ordinary English words and appear constantly in lyrics.
  // Excluding them costs us the A-major chord as a bare token, which is the
  // right trade: it will still be caught as 'A7', 'Am', 'Asus2' etc.
  test('rejects bare A (too common as a word)', () => {
    assert.equal(classify('A').chord, null);
  });

  test('still accepts qualified A chords', () => {
    assert.equal(classify('Am').chord, 'Am');
    assert.equal(classify('A7').chord, 'A7');
  });
});

describe('remote-config swappability', () => {
  // PROJECT_PLAN.md §11: the grammar must be tunable without a redeploy.
  // Proving the ruleset is data, not hardcoded, is what makes that possible.
  test('a custom ruleset changes behaviour', () => {
    const strict = compileGrammar({
      ...DEFAULT_RULES,
      ambiguous: [...DEFAULT_RULES.ambiguous, 'Em'],
    });
    assert.equal(strict.classify('Em').chord, null, 'Em now excluded');
    assert.equal(classify('Em').chord, 'Em', 'default grammar unaffected');
  });
});
