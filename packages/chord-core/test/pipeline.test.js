import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildProgression, buildChordPro } from '../src/index.js';

/**
 * Frames captured verbatim from the Spike 2 run against
 * https://www.youtube.com/shorts/wputiDZGBg4 ("Easiest 2 Chord Beginner Song").
 *
 * The video teaches exactly two chords: Em and D6-9/F#. OCR also produced
 * transient partial reads ('E', 'F') while the overlay was fading, plus fret
 * number rows and background noise. This fixture is the ground truth the
 * pipeline must reproduce.
 */
const SPIKE_FRAMES = [
  { frame: 0, timestamp: 0, tokens: ['~~', '5', 'a', 'Tt', '&', 'ORD,SON', 'Ge', 'EL'] },
  { frame: 1, timestamp: 1, tokens: ['<', '=', 'Fe', 'Pree!', '2', 'rey', '2a'] },
  { frame: 2, timestamp: 2, tokens: ['2', 'al', 'aa', 'Pree!', 'i', 'rey'] },
  { frame: 3, timestamp: 3, tokens: ['a', 'Pree!', '=,', '=', 'Sie', 'mi)', 'Tl'] },
  { frame: 4, timestamp: 4, tokens: ['Em', '2000', 'te', 'Ten', '>', '1', 'e'] },
  { frame: 5, timestamp: 5, tokens: ['Em', '012', '000', 'a', 'oli', '1', 'ase'] },
  { frame: 6, timestamp: 6, tokens: ['Em', '012', '000', '6', 'ies', 'aS', '1'] },
  { frame: 7, timestamp: 7, tokens: ['Em', '012', '000', 'a=', 'x', 'oO', 'om'] },
  { frame: 8, timestamp: 8, tokens: ['D6-9/F#', '1002', '00', 'o}1F', '1', '-'] },
  { frame: 9, timestamp: 9, tokens: ['D6-9/F#', '1002', '00', 'olf', '1'] },
  { frame: 10, timestamp: 10, tokens: ['D6-9/F#', '1002', '00', 'ee'] },
  { frame: 11, timestamp: 11, tokens: ['D6-9/F#', '1002', 'Pr'] },
  { frame: 12, timestamp: 12, tokens: ['D6-9/F#', '00', 'ee'] },
  { frame: 13, timestamp: 13, tokens: ['D6-9/F#', 'ii'] },
  { frame: 14, timestamp: 14, tokens: ['D6-9/F#', 'Se'] },
  { frame: 15, timestamp: 15, tokens: ['D6-9/F#', '=='] },
  { frame: 16, timestamp: 16, tokens: ['D6-9/F#'] },
  { frame: 17, timestamp: 17, tokens: ['D6-9/F#'] },
  { frame: 18, timestamp: 18, tokens: ['D6-9/F#'] },
  // transient misreads of Em during overlay fade — must be filtered out
  { frame: 19, timestamp: 19, tokens: ['E', 'blur'] },
  { frame: 20, timestamp: 20, tokens: ['F', 'blur'] },
];

describe('pipeline — Spike 2 regression', () => {
  test('recovers the two real chords and drops transient misreads', () => {
    const { counts, progression } = buildProgression(SPIKE_FRAMES);

    assert.equal(counts['Em'], 4, 'Em seen in 4 frames');
    assert.equal(counts['D6-9/F#'], 11, 'D6-9/F# seen in 11 frames');

    // The whole point of the minOccurrences threshold:
    assert.ok(!progression.includes('E'), 'transient E filtered out');
    assert.ok(!progression.includes('F'), 'transient F filtered out');

    assert.deepEqual(progression, ['Em', 'D6-9/F#']);
  });

  test('D6-9/F# survives the grammar — the exact bug Spike 2 found', () => {
    // Before the fix, the '-' extension separator was unsupported and this
    // chord — read perfectly by OCR in 11 frames — was silently discarded.
    const { counts } = buildProgression(SPIKE_FRAMES);
    assert.ok(counts['D6-9/F#'] > 0, 'D6-9/F# must not be rejected');
  });

  test('produces timed events with start and end', () => {
    const { events } = buildProgression(SPIKE_FRAMES);
    assert.equal(events.length, 2);
    assert.equal(events[0].chord, 'Em');
    assert.equal(events[0].start, 4);
    assert.equal(events[0].end, 7);
    assert.equal(events[1].chord, 'D6-9/F#');
    assert.equal(events[1].start, 8);
  });

  test('minOccurrences is tunable', () => {
    const loose = buildProgression(SPIKE_FRAMES, { minOccurrences: 1 });
    assert.ok(loose.progression.includes('E'), 'threshold of 1 keeps noise');
  });

  test('handles an empty input safely', () => {
    const result = buildProgression([]);
    assert.deepEqual(result.progression, []);
    assert.deepEqual(result.events, []);
  });

  test('reports OCR repairs it made', () => {
    const { repairs, counts } = buildProgression(
      [
        { frame: 0, timestamp: 0, tokens: ['Arn'] },
        { frame: 1, timestamp: 1, tokens: ['Arn'] },
        { frame: 2, timestamp: 2, tokens: ['Arn'] },
      ],
    );
    assert.equal(counts['Am'], 3);
    assert.ok(Object.keys(repairs).some((k) => k.includes('Arn -> Am')));
  });
});

describe('ChordPro output', () => {
  test('renders a chords-only sheet', () => {
    const { progression } = buildProgression(SPIKE_FRAMES);
    const sheet = buildChordPro({
      title: 'A Horse With No Name',
      artist: 'America',
      progression,
      source: 'https://www.youtube.com/shorts/wputiDZGBg4',
    });

    assert.match(sheet, /\{title: A Horse With No Name\}/);
    assert.match(sheet, /\{artist: America\}/);
    assert.match(sheet, /\[Em\]/);
    assert.match(sheet, /\[D6-9\/F#\]/);
  });

  test('interleaves chords with timed lyrics', () => {
    const { events } = buildProgression(SPIKE_FRAMES);
    const sheet = buildChordPro({
      title: 'Test',
      events,
      lyrics: [
        { time: 4, text: 'On the first part of the journey' },
        { time: 8, text: 'I was looking at all the life' },
      ],
    });

    assert.match(sheet, /\[Em\]On the first part/);
    assert.match(sheet, /\[D6-9\/F#\]I was looking/);
  });

  test('says so plainly when nothing was detected', () => {
    const sheet = buildChordPro({ title: 'Empty' });
    assert.match(sheet, /no chords detected/);
  });

  test('escapes braces that would corrupt a directive', () => {
    const sheet = buildChordPro({ title: 'Bad}Title', progression: ['G'] });
    assert.ok(!sheet.includes('Bad}Title'));
    assert.match(sheet, /\{title: Bad\)Title\}/);
  });
});
