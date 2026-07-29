/**
 * ReelChords edge worker.
 *
 * Routes:
 *   POST /api/resolve   {url} → {proxyUrl}   resolve an Instagram reel via
 *                       the configured third-party provider; the returned
 *                       proxyUrl is same-origin and HMAC-signed.
 *   GET  /api/media     stream the upstream video through our origin
 *                       (Instagram's CDN has no CORS; browsers can only
 *                       fetch it via us). Signature-gated — see sign.js.
 *   *                   static PWA assets (SPA fallback), via the assets
 *                       binding; /api/* is forced to the script by
 *                       run_worker_first in wrangler.jsonc.
 *
 * Dev mode: set RESOLVER_MOCK_URL to any same-origin path (e.g.
 * /icons/icon-512.png) to exercise the whole resolve→fetch→process flow
 * without a provider account.
 */

import {
  INSTAGRAM_URL_RE,
  YOUTUBE_URL_RE,
  isSupportedUrl,
  extractVideoUrl,
  resolveInstagram,
  ResolverError,
} from './resolver.js';
import { signMediaUrl, verifyMediaUrl } from './sign.js';
import { identifySong, fetchLyrics } from './music.js';
import { rateLimit, LIMITS } from './ratelimit.js';

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(body, status = 200, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: extraHeaders ? { ...JSON_HEADERS, ...extraHeaders } : JSON_HEADERS,
  });
}

/** Apply a rate-limit budget; returns a 429 Response when over, else null. */
async function enforceLimit(request, env, limit) {
  const { ok, retryAfter } = await rateLimit(request, env, limit);
  if (ok) return null;
  return json({ error: 'rate-limited', retryAfter }, 429, {
    'retry-after': String(retryAfter),
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/resolve' && request.method === 'POST') {
      return handleResolve(request, env);
    }
    if (url.pathname === '/api/media' && request.method === 'GET') {
      return handleMedia(url, env, request);
    }
    if (url.pathname === '/api/debug-resolve' && request.method === 'GET') {
      return handleDebugResolve(url, env);
    }
    if (url.pathname === '/api/identify' && request.method === 'POST') {
      return handleIdentify(request, env);
    }
    if (url.pathname === '/api/lyrics' && request.method === 'GET') {
      return handleLyrics(url);
    }
    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not-found' }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleResolve(request, env) {
  let reelUrl;
  try {
    ({ url: reelUrl } = await request.json());
  } catch {
    return json({ error: 'bad-request' }, 400);
  }

  if (typeof reelUrl !== 'string' || !isSupportedUrl(reelUrl.trim())) {
    return json({ error: 'unsupported-url' }, 400);
  }
  reelUrl = reelUrl.trim();

  // Dev shortcut: serve a known same-origin file as the "video".
  if (env.RESOLVER_MOCK_URL) {
    return json({ proxyUrl: env.RESOLVER_MOCK_URL, mock: true });
  }

  // YouTube needs a different provider than the Instagram one; until that's
  // configured, say so plainly rather than sending it to the wrong API.
  if (YOUTUBE_URL_RE.test(reelUrl) && !env.YOUTUBE_RESOLVER_HOST) {
    return json({ error: 'youtube-resolver-not-configured' }, 502);
  }

  // Cache before rate-limiting: a repeat of an already-resolved reel costs
  // no provider quota, so it shouldn't count against the caller's budget.
  // Resolved CDN URLs are short-lived, so the TTL stays well under the
  // signature's own expiry.
  const cacheKey = `resolved:${reelUrl}`;
  if (env.RATE_LIMIT_KV) {
    const hit = await env.RATE_LIMIT_KV.get(cacheKey);
    if (hit) {
      const { src, exp, sig } = await signMediaUrl(hit, requireSigningKey(env));
      return json({
        proxyUrl: `/api/media?src=${encodeURIComponent(src)}&exp=${exp}&sig=${encodeURIComponent(sig)}`,
        cached: true,
      });
    }
  }

  const limited = await enforceLimit(request, env, LIMITS.resolve);
  if (limited) return limited;

  try {
    const videoUrl = await resolveInstagram(reelUrl, env);
    if (env.RATE_LIMIT_KV) {
      await env.RATE_LIMIT_KV.put(cacheKey, videoUrl, { expirationTtl: 300 });
    }
    const { src, exp, sig } = await signMediaUrl(videoUrl, requireSigningKey(env));
    const proxyUrl =
      `/api/media?src=${encodeURIComponent(src)}&exp=${exp}&sig=${encodeURIComponent(sig)}`;
    return json({ proxyUrl });
  } catch (err) {
    const reason = err instanceof ResolverError ? err.reason : 'resolver-failed';
    const detail = err instanceof ResolverError ? err.detail : String(err?.message ?? err);
    // Logged so `wrangler tail` shows what the provider actually returned —
    // the quota is small, so one failed call must be enough to diagnose.
    console.error('resolve failed:', reason, detail ?? '');
    // 502: upstream problem, the client should fall back to manual guidance.
    return json({ error: reason, detail }, 502);
  }
}

/**
 * Return the provider's raw JSON alongside what the extractor made of it.
 *
 * Exists because the provider quota is small: rather than burn several
 * calls guessing at an unknown response shape, one call to this endpoint
 * shows the payload and whether extraction worked.
 *
 * Guarded by DEBUG_KEY so it can't be used to spend quota anonymously;
 * unset means disabled.
 *   /api/debug-resolve?key=<DEBUG_KEY>&url=<reel-url>
 */
async function handleDebugResolve(url, env) {
  if (!env.DEBUG_KEY || url.searchParams.get('key') !== env.DEBUG_KEY) {
    return json({ error: 'not-found' }, 404);
  }
  const reelUrl = url.searchParams.get('url') ?? '';
  if (!INSTAGRAM_URL_RE.test(reelUrl)) return json({ error: 'not-an-instagram-url' }, 400);
  if (!env.RESOLVER_HOST || !env.RESOLVER_API_KEY) {
    return json({ error: 'resolver-not-configured' }, 500);
  }

  const endpoint = new URL(`https://${env.RESOLVER_HOST}${env.RESOLVER_PATH || '/'}`);
  endpoint.searchParams.set('url', reelUrl);
  const res = await fetch(endpoint, {
    headers: {
      'x-rapidapi-key': env.RESOLVER_API_KEY,
      'x-rapidapi-host': env.RESOLVER_HOST,
      accept: 'application/json',
    },
  });

  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* leave null; raw text is returned below */
  }

  return json({
    status: res.status,
    extracted: parsed ? extractVideoUrl(parsed) : null,
    body: parsed ?? text.slice(0, 4000),
  });
}

async function handleMedia(url, env, request) {
  const limited = await enforceLimit(request, env, LIMITS.media);
  if (limited) return limited;

  const src = url.searchParams.get('src');
  const exp = url.searchParams.get('exp');
  const sig = url.searchParams.get('sig');

  const valid = await verifyMediaUrl(src, exp, sig, requireSigningKey(env));
  if (!valid) return json({ error: 'invalid-or-expired-signature' }, 403);

  const upstream = await fetch(src, {
    headers: {
      // CDNs sometimes refuse requests with no browser-ish UA.
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    },
  });
  if (!upstream.ok) return json({ error: `upstream-${upstream.status}` }, 502);

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'video/mp4',
      'cache-control': 'private, max-age=600',
    },
  });
}

/**
 * Identify a song from an uploaded audio clip.
 *
 * Never fails the request: an unidentified song is a normal outcome (the
 * chords are still the product), so this answers 200 with song:null rather
 * than an error the client has to special-case.
 */
async function handleIdentify(request, env) {
  const limited = await enforceLimit(request, env, LIMITS.identify);
  if (limited) return limited;

  try {
    const audio = await request.blob();
    if (!audio || audio.size === 0) return json({ song: null, reason: 'no-audio' });
    // AudD's own limit is generous; this guards against a runaway upload.
    if (audio.size > 5_000_000) return json({ song: null, reason: 'audio-too-large' });

    const song = await identifySong(audio, env);
    return json({ song, reason: song ? undefined : 'no-match' });
  } catch (err) {
    console.error('identify failed:', err?.message ?? err);
    return json({ song: null, reason: 'identify-failed' });
  }
}

/** Proxy LRCLIB (no CORS headers of its own, so browsers need us). */
async function handleLyrics(url) {
  const title = url.searchParams.get('title') ?? '';
  const artist = url.searchParams.get('artist') ?? '';
  if (!title) return json({ lyrics: null, reason: 'no-title' }, 400);

  try {
    const lyrics = await fetchLyrics(title, artist);
    return json({ lyrics, reason: lyrics ? undefined : 'not-found' });
  } catch (err) {
    console.error('lyrics failed:', err?.message ?? err);
    return json({ lyrics: null, reason: 'lyrics-failed' });
  }
}

function requireSigningKey(env) {
  // A dedicated secret in production; a dev default keeps `wrangler dev`
  // frictionless. The mock path never reaches signing anyway.
  return env.SIGNING_KEY || 'dev-only-signing-key';
}
