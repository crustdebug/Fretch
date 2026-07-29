/**
 * OCR stage — PROJECT_PLAN.md §6 step 3.
 *
 * Tesseract.js runs the same engine the spike used natively (Tesseract 5),
 * compiled to WebAssembly, in a web worker so the UI stays responsive.
 * Spike 2 measured 0.16 s/frame natively; in-browser is slower but still
 * comfortably within the interaction budget for ~20-40 frames.
 *
 * Two settings carried over from the spike, both load-bearing:
 *   - PSM 11 ("sparse text"): overlays are scattered words, not paragraphs.
 *     The default page-segmentation mode assumes a document and does badly.
 *   - a restricted character allowlist: chords only ever use these glyphs,
 *     so forbidding the rest removes whole classes of misreads up front.
 */

import { createWorker, PSM } from 'tesseract.js';

// Root notes, qualities, extensions, accidentals, slash — nothing else can
// appear in a chord symbol. Digits are needed for 7/9/11/13 and sus4/add9.
const CHORD_CHARSET = 'ABCDEFGabcdefgmMinjstuxdo0123456789#b/+°-';

let workerPromise = null;

/** Lazily create one shared Tesseract worker (startup costs ~1-2 s). */
async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        tessedit_char_whitelist: CHORD_CHARSET,
      });
      return worker;
    })();
  }
  return workerPromise;
}

/** Release the worker and its WASM memory. */
export async function disposeOcr() {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}

/**
 * OCR a list of frames into per-frame token lists, in the shape
 * chord-core's buildProgression() consumes.
 *
 * @param {{canvas: HTMLCanvasElement, timestamp: number}[]} frames
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{frame: number, timestamp: number, tokens: string[]}[]>}
 */
export async function ocrFrames(frames, onProgress) {
  const worker = await getWorker();
  const detections = [];

  for (let i = 0; i < frames.length; i++) {
    const { canvas, timestamp } = frames[i];
    let tokens = [];
    try {
      const { data } = await worker.recognize(canvas);
      tokens = (data.text ?? '').split(/\s+/).filter(Boolean);
    } catch {
      // A single unreadable frame shouldn't sink the run — the whole design
      // assumes most frames contribute nothing.
      tokens = [];
    }
    detections.push({ frame: i, timestamp, tokens });
    onProgress?.(i + 1, frames.length);
  }

  return detections;
}
