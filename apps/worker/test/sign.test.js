import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { signMediaUrl, verifyMediaUrl } from '../src/sign.js';

const SECRET = 'test-secret';
const URL_ = 'https://cdn.example.com/v/abc.mp4?token=xyz';

describe('media URL signing', () => {
  test('sign → verify round-trip', async () => {
    const { src, exp, sig } = await signMediaUrl(URL_, SECRET);
    assert.equal(src, URL_);
    assert.equal(await verifyMediaUrl(src, exp, sig, SECRET), true);
  });

  test('tampered src is rejected (no open proxy)', async () => {
    const { exp, sig } = await signMediaUrl(URL_, SECRET);
    assert.equal(await verifyMediaUrl('https://evil.example.com/x', exp, sig, SECRET), false);
  });

  test('tampered expiry is rejected', async () => {
    const { src, sig } = await signMediaUrl(URL_, SECRET);
    assert.equal(await verifyMediaUrl(src, Date.now() + 999_999_999, sig, SECRET), false);
  });

  test('expired grant is rejected', async () => {
    const past = Date.now() - 60_000;
    const { src, exp, sig } = await signMediaUrl(URL_, SECRET, 1000, past);
    assert.equal(await verifyMediaUrl(src, exp, sig, SECRET), false);
  });

  test('wrong secret is rejected', async () => {
    const { src, exp, sig } = await signMediaUrl(URL_, SECRET);
    assert.equal(await verifyMediaUrl(src, exp, sig, 'other-secret'), false);
  });

  test('garbage inputs are rejected, not thrown', async () => {
    assert.equal(await verifyMediaUrl(null, 'x', 'y', SECRET), false);
    assert.equal(await verifyMediaUrl(URL_, 'not-a-number', 'y', SECRET), false);
  });
});
