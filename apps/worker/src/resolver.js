/**
 * Third-party Instagram resolver — the pluggable part.
 *
 * Reality (spike/FINDINGS.md addendum): Instagram blocks anonymous server
 * fetching and its share sheet only shares URLs. Commercial scraper APIs
 * exist that resolve a reel URL to a direct CDN video URL; they churn
 * often, so everything provider-specific here is (a) driven by env config
 * and (b) defensive about response shape.
 */

export const INSTAGRAM_URL_RE = /^https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\/[\w-]+/;
export const YOUTUBE_URL_RE =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)[\w-]{6,}/;

/** Any source we can attempt to resolve server-side. */
export function isSupportedUrl(url) {
  return INSTAGRAM_URL_RE.test(url) || YOUTUBE_URL_RE.test(url);
}

/**
 * Find a video URL in an arbitrary provider response.
 *
 * Different providers wrap the answer differently ({video: url},
 * {data: {links: [{url}]}}, arrays of qualities, …). Rather than code to
 * one provider's shape, walk the JSON and pick the most video-looking URL.
 * Preference order: explicit .mp4 in the path > video-ish key names.
 *
 * @param {unknown} json
 * @returns {string|null}
 */
export function extractVideoUrl(json) {
  /** @type {{url: string, score: number}[]} */
  const found = [];

  const VIDEO_KEY = /video|download|media|url|link|src/i;

  function visit(node, keyHint) {
    if (typeof node === 'string') {
      if (!/^https?:\/\//.test(node)) return;
      let path = '';
      try {
        path = new URL(node).pathname.toLowerCase();
      } catch {
        return;
      }
      let score = 0;
      if (path.endsWith('.mp4') || path.includes('.mp4')) score += 10;
      if (/\.(m3u8|webm|mov)(\b|$)/.test(path)) score += 6;
      if (keyHint && /video/i.test(keyHint)) score += 4;
      if (keyHint && VIDEO_KEY.test(keyHint)) score += 1;
      // Thumbnails masquerade as media; push them down hard.
      if (/\.(jpe?g|png|webp|gif)(\b|$)/.test(path)) score -= 20;
      if (score > 0) found.push({ url: node, score });
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, keyHint);
      return;
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) visit(v, k);
    }
  }

  visit(json, '');
  found.sort((a, b) => b.score - a.score);
  return found[0]?.url ?? null;
}

/**
 * Call the configured provider. RapidAPI convention: GET with the target
 * URL as a query parameter and key/host headers.
 *
 * @param {string} reelUrl
 * @param {{RESOLVER_HOST?: string, RESOLVER_PATH?: string, RESOLVER_API_KEY?: string}} env
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>} direct video URL
 */
export async function resolveInstagram(reelUrl, env, fetchImpl = fetch) {
  if (!env.RESOLVER_HOST || !env.RESOLVER_API_KEY) {
    throw new ResolverError('resolver-not-configured');
  }

  const endpoint = new URL(`https://${env.RESOLVER_HOST}${env.RESOLVER_PATH || '/'}`);
  endpoint.searchParams.set('url', reelUrl);

  const res = await fetchImpl(endpoint, {
    headers: {
      'x-rapidapi-key': env.RESOLVER_API_KEY,
      'x-rapidapi-host': env.RESOLVER_HOST,
      accept: 'application/json',
    },
  });

  if (!res.ok) throw new ResolverError(`provider-http-${res.status}`);

  let json;
  try {
    json = await res.json();
  } catch {
    throw new ResolverError('provider-not-json');
  }

  const videoUrl = extractVideoUrl(json);
  if (!videoUrl) {
    // Carry a trimmed copy of the payload: with a tight monthly quota, one
    // failed call has to be enough to diagnose the provider's actual shape.
    throw new ResolverError('no-video-in-response', summarise(json));
  }
  return videoUrl;
}

/** Compact preview of an unexpected payload, safe to surface in an error. */
function summarise(json, limit = 600) {
  try {
    const s = JSON.stringify(json);
    return s.length > limit ? `${s.slice(0, limit)}…` : s;
  } catch {
    return String(json).slice(0, limit);
  }
}

export class ResolverError extends Error {
  constructor(reason, detail) {
    super(reason);
    this.reason = reason;
    this.detail = detail;
  }
}
