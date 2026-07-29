import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, LIMITS } from '../src/ratelimit.js';

/** Minimal KV stand-in with the two methods the limiter uses. */
function fakeKv() {
  const store = new Map();
  return {
    store,
    async get(k) {
      return store.has(k) ? store.get(k) : null;
    },
    async put(k, v) {
      store.set(k, v);
    },
  };
}

const req = (ip = '1.2.3.4') =>
  new Request('https://example.com/api/resolve', {
    method: 'POST',
    headers: { 'cf-connecting-ip': ip },
  });

describe('rateLimit (KV-backed)', () => {
  let env;
  beforeEach(() => {
    env = { RATE_LIMIT_KV: fakeKv() };
  });

  const opts = { bucket: 'test', limit: 3, windowMs: 60_000 };

  test('allows up to the limit, then blocks', async () => {
    for (let i = 1; i <= 3; i++) {
      const r = await rateLimit(req(), env, opts);
      assert.equal(r.ok, true, `request ${i} should pass`);
      assert.equal(r.count, i);
    }
    const over = await rateLimit(req(), env, opts);
    assert.equal(over.ok, false);
    assert.equal(over.count, 4);
  });

  test('separate IPs get separate budgets', async () => {
    for (let i = 0; i < 3; i++) await rateLimit(req('1.1.1.1'), env, opts);
    const other = await rateLimit(req('2.2.2.2'), env, opts);
    assert.equal(other.ok, true, 'a different IP must not inherit the block');
  });

  test('separate buckets do not share a budget', async () => {
    for (let i = 0; i < 3; i++) await rateLimit(req(), env, { ...opts, bucket: 'a' });
    const b = await rateLimit(req(), env, { ...opts, bucket: 'b' });
    assert.equal(b.ok, true);
  });

  test('reports a sane retry-after', async () => {
    const r = await rateLimit(req(), env, opts);
    assert.ok(r.retryAfter > 0 && r.retryAfter <= 60, `got ${r.retryAfter}`);
  });

  test('a request with no IP header still gets bucketed', async () => {
    const anon = new Request('https://example.com/api/resolve', { method: 'POST' });
    const r = await rateLimit(anon, env, opts);
    assert.equal(r.ok, true);
    assert.equal(r.count, 1);
  });
});

describe('rateLimit (no KV bound)', () => {
  test('falls back to in-memory counting rather than failing open', async () => {
    const env = {};
    const opts = { bucket: `mem-${Math.random()}`, limit: 2, windowMs: 60_000 };
    assert.equal((await rateLimit(req('9.9.9.9'), env, opts)).ok, true);
    assert.equal((await rateLimit(req('9.9.9.9'), env, opts)).ok, true);
    assert.equal((await rateLimit(req('9.9.9.9'), env, opts)).ok, false);
  });
});

describe('configured budgets', () => {
  test('resolve is the tightest — it spends metered quota', () => {
    assert.ok(LIMITS.resolve.limit < LIMITS.identify.limit);
    assert.ok(LIMITS.resolve.limit < LIMITS.media.limit);
  });

  test('every budget names a bucket and a window', () => {
    for (const [name, l] of Object.entries(LIMITS)) {
      assert.ok(l.bucket, `${name} needs a bucket`);
      assert.ok(l.limit > 0, `${name} needs a positive limit`);
      assert.ok(l.windowMs > 0, `${name} needs a window`);
    }
  });
});
