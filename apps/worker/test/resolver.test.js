import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractVideoUrl, INSTAGRAM_URL_RE, resolveInstagram, ResolverError } from '../src/resolver.js';

describe('INSTAGRAM_URL_RE', () => {
  test('matches reel, reels and p URLs', () => {
    assert.ok(INSTAGRAM_URL_RE.test('https://www.instagram.com/reel/DAhKpJqSxNM/'));
    assert.ok(INSTAGRAM_URL_RE.test('https://instagram.com/reels/Abc_123-x/'));
    assert.ok(INSTAGRAM_URL_RE.test('https://www.instagram.com/p/Xyz789/'));
  });
  test('rejects other hosts and paths', () => {
    assert.ok(!INSTAGRAM_URL_RE.test('https://www.youtube.com/shorts/abc'));
    assert.ok(!INSTAGRAM_URL_RE.test('https://evil.com/https://instagram.com/reel/x'));
    assert.ok(!INSTAGRAM_URL_RE.test('https://www.instagram.com/someuser/'));
  });
});

describe('extractVideoUrl — provider shape tolerance', () => {
  // Three shapes modeled on real downloader-API responses.
  test('flat shape', () => {
    const r = { status: 'ok', video: 'https://cdn.example.com/v/abc123.mp4?sig=x' };
    assert.equal(extractVideoUrl(r), 'https://cdn.example.com/v/abc123.mp4?sig=x');
  });

  test('nested media list, prefers mp4 over thumbnail', () => {
    const r = {
      data: {
        thumbnail: 'https://cdn.example.com/thumb/abc.jpg',
        medias: [
          { quality: 'hd', url: 'https://cdn.example.com/v/hd.mp4' },
          { quality: 'sd', url: 'https://cdn.example.com/v/sd.mp4' },
        ],
      },
    };
    assert.match(extractVideoUrl(r), /\.mp4$/);
  });

  test('video-named key without .mp4 extension still wins over jpg', () => {
    const r = {
      video_url: 'https://scontent.example.com/o1/v/t2/f2/m86?efg=abc&_nc_ht=x',
      display_url: 'https://scontent.example.com/p/photo.jpg',
    };
    assert.equal(extractVideoUrl(r), 'https://scontent.example.com/o1/v/t2/f2/m86?efg=abc&_nc_ht=x');
  });

  test('returns null when there is nothing video-like', () => {
    assert.equal(extractVideoUrl({ error: 'private post', code: 403 }), null);
    assert.equal(extractVideoUrl(null), null);
    assert.equal(extractVideoUrl({ thumb: 'https://x.example.com/a.jpg' }), null);
  });
});

describe('resolveInstagram', () => {
  const env = { RESOLVER_HOST: 'api.example.com', RESOLVER_PATH: '/dl', RESOLVER_API_KEY: 'k' };

  test('calls provider with RapidAPI headers and extracts the video', async () => {
    let captured;
    const fakeFetch = async (url, init) => {
      captured = { url: String(url), init };
      return new Response(JSON.stringify({ video: 'https://cdn.example.com/x.mp4' }), {
        headers: { 'content-type': 'application/json' },
      });
    };
    const out = await resolveInstagram('https://www.instagram.com/reel/abc/', env, fakeFetch);
    assert.equal(out, 'https://cdn.example.com/x.mp4');
    assert.match(captured.url, /^https:\/\/api\.example\.com\/dl\?url=/);
    assert.equal(captured.init.headers['x-rapidapi-key'], 'k');
    assert.equal(captured.init.headers['x-rapidapi-host'], 'api.example.com');
  });

  test('unconfigured env throws resolver-not-configured', async () => {
    await assert.rejects(
      () => resolveInstagram('https://www.instagram.com/reel/abc/', {}),
      (e) => e instanceof ResolverError && e.reason === 'resolver-not-configured',
    );
  });

  test('provider HTTP error surfaces as ResolverError', async () => {
    const fakeFetch = async () => new Response('nope', { status: 429 });
    await assert.rejects(
      () => resolveInstagram('https://www.instagram.com/reel/abc/', env, fakeFetch),
      (e) => e.reason === 'provider-http-429',
    );
  });

  test('response with no video throws no-video-in-response', async () => {
    const fakeFetch = async () =>
      new Response(JSON.stringify({ error: 'private' }), {
        headers: { 'content-type': 'application/json' },
      });
    await assert.rejects(
      () => resolveInstagram('https://www.instagram.com/reel/abc/', env, fakeFetch),
      (e) => e.reason === 'no-video-in-response',
    );
  });
});
