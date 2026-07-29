/**
 * Frame sampling — PROJECT_PLAN.md §6 steps 2 and 2b.
 *
 * The plan calls for ffmpeg.wasm. This uses a plain <video> element plus
 * <canvas> instead: seek to a timestamp, draw the frame, read the pixels.
 * The reasons are practical rather than aesthetic —
 *
 *   - ffmpeg.wasm is ~30 MB and needs SharedArrayBuffer, which requires
 *     COOP/COEP headers that break other things (and are awkward on
 *     Cloudflare's asset serving);
 *   - the browser already has a hardware-accelerated video decoder, and
 *     this uses it;
 *   - we only need still frames at ~1 fps, which is exactly what seeking
 *     gives us.
 *
 * Spike 2 (spike/FINDINGS_OCR.md) also found chord overlays live in the
 * top portion of the frame, with the player and their room below as pure
 * OCR noise — so we crop before handing anything to Tesseract.
 */

/** Load a video element from a blob URL and wait for its metadata. */
function loadVideo(src) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = src;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error('video-decode-failed'));
  });
}

/** Seek precisely and wait for the frame to be ready to draw. */
function seekTo(video, time) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', () => reject(new Error('seek-failed')), { once: true });
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05));
  });
}

/**
 * Extract frames as canvases, cropped to the region where chord overlays
 * live and upscaled — both materially improve OCR accuracy.
 *
 * @param {string} blobUrl              object URL for the video
 * @param {object} [opts]
 * @param {number} [opts.fps=1]         samples per second
 * @param {number} [opts.maxFrames=40]  cap, so a long video can't hang the tab
 * @param {number} [opts.cropTop=0]     fraction of height to start the crop
 * @param {number} [opts.cropBottom=0.45] fraction of height to end the crop
 * @param {number} [opts.scale=2]       upscale factor for small overlay text
 * @param {(done: number, total: number) => void} [opts.onProgress]
 * @returns {Promise<{frames: {canvas: HTMLCanvasElement, timestamp: number}[], duration: number}>}
 */
export async function extractFrames(blobUrl, opts = {}) {
  const {
    fps = 1,
    maxFrames = 40,
    cropTop = 0,
    cropBottom = 0.45,
    scale = 2,
    onProgress,
  } = opts;

  const video = await loadVideo(blobUrl);
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (!duration) throw new Error('video-has-no-duration');

  const step = 1 / fps;
  const times = [];
  for (let t = 0; t < duration && times.length < maxFrames; t += step) times.push(t);

  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (!srcW || !srcH) throw new Error('video-has-no-dimensions');

  const sy = Math.floor(srcH * cropTop);
  const sh = Math.max(1, Math.floor(srcH * (cropBottom - cropTop)));

  const frames = [];
  for (let i = 0; i < times.length; i++) {
    await seekTo(video, times[i]);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(srcW * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, sy, srcW, sh, 0, 0, canvas.width, canvas.height);

    toHighContrastGrayscale(ctx, canvas.width, canvas.height);
    frames.push({ canvas, timestamp: times[i] });
    onProgress?.(i + 1, times.length);
  }

  video.src = '';
  return { frames, duration };
}

/**
 * Grayscale + contrast stretch in place.
 *
 * Overlay text is usually white or black on a busy photographic background;
 * pushing mid-tones apart makes the glyph edges much cleaner for Tesseract
 * than the raw frame.
 */
function toHighContrastGrayscale(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Rec. 601 luma — matches how ffmpeg's `format=gray` converts.
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // Stretch around mid-grey; clamp keeps it in range.
    const v = Math.max(0, Math.min(255, (y - 128) * 1.6 + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}
