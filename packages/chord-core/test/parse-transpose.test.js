import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseChordPro,
  parseLine,
  transposeChord,
  transposeChordPro,
  buildChordPro,
} from '../src/index.js';

describe('parseLine', () => {
  test('splits chords and lyrics', () => {
    assert.deepEqual(parseLine('[G]Twinkle twinkle [C]little [G]star'), [
      { chord: 'G', text: 'Twinkle twinkle ' },
      { chord: 'C', text: 'little ' },
      { chord: 'G', text: 'star' },
    ]);
  });

  test('keeps text before the first chord', () => {
    assert.deepEqual(parseLine('Oh [Em]no'), [
      { chord: null, text: 'Oh ' },
      { chord: 'Em', text: 'no' },
    ]);
  });

  test('handles a chordless line', () => {
    assert.deepEqual(parseLine('just words'), [{ chord: null, text: 'just words' }]);
  });

  test('handles adjacent chords with no lyric between', () => {
    assert.deepEqual(parseLine('[Em][Am]go'), [
      { chord: 'Em', text: '' },
      { chord: 'Am', text: 'go' },
    ]);
  });
});

describe('parseChordPro', () => {
  const doc = [
    '{title: Twinkle Twinkle Little Star}',
    '{artist: Traditional}',
    '{key: G}',
    '{comment: source: test}',
    '',
    '[G]Twinkle twinkle [C]little [G]star',
    '{start_of_chorus}',
    '[C]How I [G]wonder',
    '{end_of_chorus}',
  ].join('\n');

  test('extracts metadata', () => {
    const sheet = parseChordPro(doc);
    assert.equal(sheet.title, 'Twinkle Twinkle Little Star');
    assert.equal(sheet.artist, 'Traditional');
    assert.equal(sheet.key, 'G');
  });

  test('separates sections', () => {
    const sheet = parseChordPro(doc);
    const names = sheet.sections.map((s) => s.name);
    assert.deepEqual(names, ['', 'chorus']);
    assert.equal(sheet.sections[1].items[0].type, 'line');
  });

  test('round-trips what buildChordPro emits', () => {
    const built = buildChordPro({
      title: 'Test Song',
      artist: 'Nobody',
      progression: ['Em', 'D6-9/F#'],
      source: 'unit-test',
    });
    const sheet = parseChordPro(built);
    assert.equal(sheet.title, 'Test Song');
    assert.equal(sheet.artist, 'Nobody');
    const chords = sheet.sections
      .flatMap((s) => s.items)
      .filter((i) => i.type === 'line')
      .flatMap((l) => l.segments)
      .map((seg) => seg.chord)
      .filter(Boolean);
    assert.deepEqual(chords, ['Em', 'D6-9/F#']);
  });
});

describe('transposeChord', () => {
  const cases = [
    ['G', 2, 'A'],
    ['C', -1, 'B'],
    ['Em', 2, 'F#m'],
    ['Bb', 2, 'C'],
    ['Am7/E', 2, 'Bm7/F#'],
    ['D/F#', -2, 'C/E'],
    // the traps: accidentals inside extensions are NOT notes
    ['F#m7b5', 1, 'Gm7b5'],
    ['E7#9', 1, 'F7#9'],
    // '/9' is an extension, not a bass note
    ['C6/9', 2, 'D6/9'],
    ['D6-9/F#', 2, 'E6-9/G#'],
    // wrap-around
    ['B', 1, 'C'],
    ['C', -1, 'B'],
  ];

  for (const [chord, n, expected] of cases) {
    test(`${chord} ${n > 0 ? '+' : ''}${n} -> ${expected}`, () => {
      assert.equal(transposeChord(chord, n), expected);
    });
  }

  test('preferFlat spells with flats', () => {
    assert.equal(transposeChord('A', 1, true), 'Bb');
    assert.equal(transposeChord('D', 1, true), 'Eb');
  });

  test('zero semitones is identity', () => {
    assert.equal(transposeChord('F#m7b5', 0), 'F#m7b5');
  });
});

describe('transposeChordPro', () => {
  test('moves every chord, touches nothing else', () => {
    const input = '{title: T}\n[G]la [C]la\n{comment: keep me}';
    const out = transposeChordPro(input, 2);
    assert.match(out, /\[A\]la \[D\]la/);
    assert.match(out, /\{title: T\}/);
    assert.match(out, /\{comment: keep me\}/);
  });

  test('round-trip up 3 then down 3 is identity', () => {
    const input = '[Em]x [D6-9/F#]y [Am7/E]z';
    assert.equal(transposeChordPro(transposeChordPro(input, 3), -3), input);
  });

  test('the {key:} directive transposes with the chords', () => {
    // Caught by a UI drive: chords moved but the key directive stayed put,
    // so the document disagreed with itself (and the UI showed the old key).
    const out = transposeChordPro('{key: G}\n[G]la [C]la', 2);
    assert.match(out, /\{key: A\}/);
    assert.match(out, /\[A\]la \[D\]la/);
  });

  test('minor keys transpose too', () => {
    assert.match(transposeChordPro('{key: Em}\n[Em]x', 2), /\{key: F#m\}/);
  });
});
