/**
 * Per-IP rate limiting for the endpoints that spend money.
 *
 * /api/resolve consumes a metered third-party quota (a free tier can be as
 * small as 20 calls a month) and /api/identify consumes AudD credits. A
 * public URL with no limit means one bored visitor — or one crawler — can
 * exhaust both. PROJECT_PLAN.md §9 puts rate limiting in Phase 5; the small
 * quotas make it load-bearing now.
 *
 * Storage is Cloudflare KV when bound, with an in-memory fallback so the
 * limiter still works (per-isolate) before KV exists. The fallback is not
 * shared between edge locations — deliberately a floor, not a guarantee.
 */

const memory = new Map();

function memoryHit(key, windowMs, now) {
  const entry = memory.get(key);
  if (!entry || entry.reset <= now) {
    memory.set(key, { count: 1, reset: now + windowMs });
    // Opportunistic cleanup: without it this map grows forever.
    if (memory.size > 5000) {
      for (const [k, v] of memory) if (v.reset <= now) memory.delete(k);
    }
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/**
 * Count this request against a bucket and report whether it's over budget.
 *
 * @param {Request} request
 * @param {object} env
 * @param {object} opts
 * @param {string} opts.bucket    namespace, e.g. 'resolve'
 * @param {number} opts.limit     max requests per window
 * @param {number} opts.windowMs  window length
 * @returns {Promise<{ok: boolean, count: number, limit: number, retryAfter: number}>}
 */
export async function rateLimit(request, env, { bucket, limit, windowMs }) {
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for') ??
    'unknown';
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const key = `rl:${bucket}:${window}:${ip}`;
  const retryAfter = Math.ceil((((window + 1) * windowMs) - now) / 1000);

  if (!env.RATE_LIMIT_KV) {
    const count = memoryHit(key, windowMs, now);
    return { ok: count <= limit, count, limit, retryAfter };
  }

  const current = Number((await env.RATE_LIMIT_KV.get(key)) ?? 0);
  const count = current + 1;
  // TTL just past the window so keys expire on their own. KV's minimum is 60s.
  await env.RATE_LIMIT_KV.put(key, String(count), {
    expirationTtl: Math.max(60, Math.ceil(windowMs / 1000) + 60),
  });
  return { ok: count <= limit, count, limit, retryAfter };
}

/** Budgets chosen to be generous for a person, restrictive for a script. */
export const LIMITS = {
  // Metered third-party quota — the tightest thing we have.
  resolve: { bucket: 'resolve', limit: 5, windowMs: 60 * 60_000 },
  // AudD credits.
  identify: { bucket: 'identify', limit: 20, windowMs: 60 * 60_000 },
  // Free upstream, but proxying bandwidth still costs us.
  media: { bucket: 'media', limit: 30, windowMs: 60 * 60_000 },
};
