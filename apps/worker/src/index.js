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

import { INSTAGRAM_URL_RE, resolveInstagram, ResolverError } from './resolver.js';
import { signMediaUrl, verifyMediaUrl } from './sign.js';

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/resolve' && request.method === 'POST') {
      return handleResolve(request, env);
    }
    if (url.pathname === '/api/media' && request.method === 'GET') {
      return handleMedia(url, env);
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

  if (typeof reelUrl !== 'string' || !INSTAGRAM_URL_RE.test(reelUrl.trim())) {
    return json({ error: 'not-an-instagram-url' }, 400);
  }

  // Dev shortcut: serve a known same-origin file as the "video".
  if (env.RESOLVER_MOCK_URL) {
    return json({ proxyUrl: env.RESOLVER_MOCK_URL, mock: true });
  }

  try {
    const videoUrl = await resolveInstagram(reelUrl.trim(), env);
    const { src, exp, sig } = await signMediaUrl(videoUrl, requireSigningKey(env));
    const proxyUrl =
      `/api/media?src=${encodeURIComponent(src)}&exp=${exp}&sig=${encodeURIComponent(sig)}`;
    return json({ proxyUrl });
  } catch (err) {
    const reason = err instanceof ResolverError ? err.reason : 'resolver-failed';
    // 502: upstream problem, the client should fall back to manual guidance.
    return json({ error: reason }, 502);
  }
}

async function handleMedia(url, env) {
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

function requireSigningKey(env) {
  // A dedicated secret in production; a dev default keeps `wrangler dev`
  // frictionless. The mock path never reaches signing anyway.
  return env.SIGNING_KEY || 'dev-only-signing-key';
}
