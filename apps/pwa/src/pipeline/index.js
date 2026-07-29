/**
 * The processing pipeline — PROJECT_PLAN.md §6, end to end.
 *
 * Runs client-side (the plan's "fast path"): the browser decodes the video,
 * samples frames, OCRs them in WebAssembly, and only calls our Worker for
 * the two things that need a server — the AudD token and LRCLIB's missing
 * CORS headers. No AWS, no queue, nothing per-request to pay for.
 *
 * Stage ids match PIPELINE_STAGES so the UI can report progress, and the
 * result shape matches the mock, so nothing downstream changed.
 */

import { buildProgression, buildChordPro } from '@reelchords/chord-core';
import { extractFrames } from './frames.js';
import { ocrFrames, disposeOcr } from './ocr.js';
import { extractAudioClip } from './audio.js';

/**
 * @param {{blob: Blob, blobUrl: string, label: string, id: string}} input
 * @param {(stageId: string, detail?: string) => void} onStage
 * @returns {Promise<object>} result in MOCK_RESULT's shape
 */
export async function runPipeline(input, onStage) {
  const { blob, blobUrl, label, id } = input;

  // --- 1. acquire -------------------------------------------------------
  onStage('acquire');

  // Song ID runs in parallel with the visual work: it needs no frames, and
  // §6's latency target depends on not serialising these.
  const songPromise = identifyInBackground(blob).catch(() => null);

  // --- 2. frames --------------------------------------------------------
  onStage('frames');
  const { frames, duration } = await extractFrames(blobUrl, {
    fps: 1,
    maxFrames: 40,
    onProgress: (done, total) => onStage('frames', `${done}/${total}`),
  });
  if (!frames.length) throw new PipelineError('no-frames', 'Could not read any frames from this video.');

  // --- 3. ocr -----------------------------------------------------------
  onStage('ocr');
  const detections = await ocrFrames(frames, (done, total) =>
    onStage('ocr', `${done}/${total}`),
  );

  // --- 4. chord grammar -------------------------------------------------
  onStage('filter');
  const { progression, events, counts, repairs } = buildProgression(detections, {
    minOccurrences: 2,
  });

  if (!progression.length) {
    throw new PipelineError(
      'no-chords',
      'No chord text was found on screen. This works best on tutorials where the chord names are written over the video.',
    );
  }

  // --- 5. song id (awaited here; started at step 1) ----------------------
  onStage('songid');
  const song = await songPromise;

  // --- 6. lyrics --------------------------------------------------------
  onStage('lyrics');
  let lyrics = null;
  if (song?.title) {
    lyrics = await fetchLyricsFor(song).catch(() => null);
  }

  // --- 7. assemble ------------------------------------------------------
  onStage('assemble');
  const chordpro = buildChordPro({
    title: song?.title,
    artist: song?.artist,
    key: progression[0]?.split('|')[0],
    source: label,
    progression,
    events,
    lyrics: lyrics?.lines,
  });

  return {
    id,
    title: song?.title ?? 'Untitled sheet',
    artist: song?.artist ?? '',
    key: progression[0]?.split('|')[0] ?? null,
    source: label,
    // Confidence is deliberately simple and honest: the share of sampled
    // frames that produced a trusted chord. It is a legibility signal, not
    // a claim about musical correctness.
    confidence: Math.min(1, events.reduce((n, e) => n + e.frames, 0) / Math.max(frames.length, 1)),
    chordpro,
    stats: {
      frames: frames.length,
      duration,
      chords: Object.keys(counts).length,
      repairs: Object.keys(repairs).length,
      identified: Boolean(song),
      lyrics: lyrics ? (lyrics.synced ? 'synced' : 'plain') : 'none',
    },
  };
}

async function identifyInBackground(blob) {
  const clip = await extractAudioClip(blob);
  if (!clip) return null;
  const res = await fetch('/api/identify', {
    method: 'POST',
    headers: { 'content-type': 'audio/wav' },
    body: clip,
  });
  if (!res.ok) return null;
  const { song } = await res.json();
  return song ?? null;
}

async function fetchLyricsFor(song) {
  const url = new URL('/api/lyrics', window.location.origin);
  url.searchParams.set('title', song.title);
  if (song.artist) url.searchParams.set('artist', song.artist);
  const res = await fetch(url);
  if (!res.ok) return null;
  const { lyrics } = await res.json();
  return lyrics ?? null;
}

export class PipelineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export { disposeOcr };
