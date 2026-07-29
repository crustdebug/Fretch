import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractVideoUrl,
  extractSupportedUrl,
  INSTAGRAM_URL_RE,
  resolveInstagram,
  ResolverError,
} from '../src/resolver.js';

describe('INSTAGRAM_URL_RE', () => {
  test('matches reel, reels, p and tv URLs', () => {
    assert.ok(INSTAGRAM_URL_RE.test('https://www.instagram.com/reel/DAhKpJqSxNM/'));
    assert.ok(INSTAGRAM_URL_RE.test('https://instagram.com/reels/Abc_123-x/'));
    assert.ok(INSTAGRAM_URL_RE.test('https://www.instagram.com/p/Xyz789/'));
    assert.ok(INSTAGRAM_URL_RE.test('https://www.instagram.com/tv/Xyz789/'));
  });

  test("matches Instagram's /share/ short links", () => {
    assert.ok(INSTAGRAM_URL_RE.test('https://www.instagram.com/share/reel/_abc123XY'));
  });

  test('rejects other hosts and non-post paths', () => {
    assert.ok(!INSTAGRAM_URL_RE.test('https://www.youtube.com/shorts/abc'));
    assert.ok(!INSTAGRAM_URL_RE.test('https://www.instagram.com/someuser/'));
  });
});

describe('extractSupportedUrl — shared text, not just bare URLs', () => {
  // Regression: the share sheet sends a sentence, the client's loose match
  // recognised it, and the server's anchored match rejected it — surfacing
  // as "recognized, but automatic fetch didn't work".
  test('pulls the URL out of surrounding text', () => {
    assert.equal(
      extractSupportedUrl('Check this out https://www.instagram.com/reel/DAhKpJqSxNM/ 🔥'),
      'https://www.instagram.com/reel/DAhKpJqSxNM/',
    );
  });

  test('handles a bare URL unchanged', () => {
    const u = 'https://www.instagram.com/reel/DAhKpJqSxNM/';
    assert.equal(extractSupportedUrl(u), u);
  });

  test('keeps tracking query strings the CDN may need', () => {
    assert.match(
      extractSupportedUrl('https://instagram.com/reel/ABC123/?igsh=xyz'),
      /^https:\/\/instagram\.com\/reel\/ABC123/,
    );
  });

  test('finds YouTube links too', () => {
    assert.equal(
      extractSupportedUrl('watch https://www.youtube.com/shorts/wputiDZGBg4 now'),
      'https://www.youtube.com/shorts/wputiDZGBg4',
    );
  });

  test('returns null when there is no supported URL', () => {
    assert.equal(extractSupportedUrl('just some text'), null);
    assert.equal(extractSupportedUrl('https://example.com/video.mp4'), null);
    assert.equal(extractSupportedUrl(null), null);
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
