/**
 * Audio extraction for song identification — PROJECT_PLAN.md §6 step 7.
 *
 * AudD fingerprints a short audio clip. The plan had ffmpeg produce it;
 * the browser can do the same job with Web Audio: decode the video's audio
 * track, take a slice, downmix to mono, resample, and encode WAV.
 *
 * We deliberately send a SHORT, LOW-RATE, MONO clip:
 *   - fingerprinting needs ~10 s, not the whole track;
 *   - 16 kHz mono is plenty for the fingerprint and keeps the upload small;
 *   - and per PROJECT_PLAN.md §11, we never store or forward full audio —
 *     a fingerprint-sized excerpt is the point.
 */

const TARGET_RATE = 16000;
const CLIP_SECONDS = 10;
/** Skip the very start: reels often open on speech or silence. */
const SKIP_SECONDS = 3;

/**
 * Decode a video/audio blob and return a mono 16 kHz WAV excerpt.
 *
 * @param {Blob} mediaBlob
 * @returns {Promise<Blob|null>} WAV blob, or null when there's no usable audio
 */
export async function extractAudioClip(mediaBlob) {
  const bytes = await mediaBlob.arrayBuffer();

  // OfflineAudioContext both decodes and resamples for us.
  const probeCtx = new (window.AudioContext || window.webkitAudioContext)();
  let decoded;
  try {
    decoded = await probeCtx.decodeAudioData(bytes.slice(0));
  } catch {
    return null; // no audio track, or a codec the browser can't decode
  } finally {
    probeCtx.close();
  }

  if (!decoded || decoded.duration < 1) return null;

  const start = Math.min(SKIP_SECONDS, Math.max(0, decoded.duration - CLIP_SECONDS));
  const length = Math.min(CLIP_SECONDS, decoded.duration - start);
  if (length <= 0.5) return null;

  const offline = new OfflineAudioContext(
    1, // mono
    Math.ceil(length * TARGET_RATE),
    TARGET_RATE,
  );
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0, start, length);

  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), TARGET_RATE);
}

/**
 * Encode mono float samples as 16-bit PCM WAV.
 * AudD accepts WAV directly, and writing the 44-byte header by hand avoids
 * pulling in an encoder dependency.
 */
function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
