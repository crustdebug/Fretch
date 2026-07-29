/**
 * HMAC signing for the media proxy.
 *
 * /api/media streams third-party bytes through our origin (Instagram's CDN
 * sends no CORS headers, so the browser can't fetch it directly). Without
 * a signature that endpoint would be an open proxy for anyone to relay
 * arbitrary traffic through — so only URLs the resolver itself produced,
 * signed with a server-side secret and a short expiry, are accepted.
 */

const enc = new TextEncoder();

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * @param {string} url     upstream media URL
 * @param {string} secret  SIGNING_KEY
 * @param {number} [ttlMs] validity window (default 10 min — enough for the
 *                         browser to start and finish the download)
 * @returns {Promise<{src: string, exp: number, sig: string}>}
 */
export async function signMediaUrl(url, secret, ttlMs = 10 * 60_000, now = Date.now()) {
  const exp = now + ttlMs;
  const key = await hmacKey(secret);
  const sig = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`${url}|${exp}`)));
  return { src: url, exp, sig };
}

/**
 * @returns {Promise<boolean>} whether src/exp/sig form a valid, unexpired grant
 */
export async function verifyMediaUrl(src, exp, sig, secret, now = Date.now()) {
  const expNum = Number(exp);
  if (!src || !sig || !Number.isFinite(expNum) || expNum < now) return false;

  const key = await hmacKey(secret);
  const expected = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`${src}|${expNum}`)));

  // Constant-time-ish compare; both are short fixed-length digests.
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
