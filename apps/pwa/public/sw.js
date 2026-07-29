/**
 * ReelChords service worker.
 *
 * Two jobs:
 *
 * 1. SHARE-TARGET INBOX (the important one).
 *    When Android shares a video to the app, the OS issues a POST to
 *    /share-target with the file in multipart form data. Cloudflare Pages is
 *    static hosting and cannot receive a POST — but the service worker sits
 *    between the network and the page, so it intercepts the request, stashes
 *    the file in the Cache API, and redirects to the app, which picks the
 *    file up from the cache. The video never has to leave the device for the
 *    share itself to work.
 *
 * 2. APP-SHELL CACHING.
 *    Precache the built assets on install so the app opens offline
 *    (PROJECT_PLAN.md §9 Phase 4 milestone). Kept deliberately simple for
 *    now: network-first for navigations, cache-first for hashed assets.
 */

const SHELL_CACHE = 'shell-v1';
const SHARE_CACHE = 'share-inbox';

// The entry points worth having offline even before Vite's hashed assets are
// fetched. Hashed assets (/assets/*.js etc.) are cached on first use instead,
// because their names change every build.
const SHELL_URLS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)),
  );
  // Take over from any previous worker version without waiting for all tabs
  // to close — fine while the app is young.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older shell versions.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n !== SHELL_CACHE && n !== SHARE_CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // --- 1. The share-target inbox -----------------------------------------
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShare(event.request));
    return;
  }

  if (event.request.method !== 'GET') return;

  // --- 2. App shell -------------------------------------------------------
  // Navigations: try network, fall back to the cached shell (offline case).
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Same-origin static assets: cache-first, populate on first use.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ??
          fetch(event.request).then((res) => {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(event.request, copy));
            return res;
          }),
      ),
    );
  }
});

/**
 * Receive a share, stash its contents, bounce the user into the app.
 *
 * Two kinds of share arrive here (see manifest.webmanifest share_target):
 *   - a video FILE  -> the working path; store the bytes
 *   - a text/URL    -> probably an Instagram link; store it so the app can
 *                      show the "share the video instead" guidance
 */
async function handleShare(request) {
  try {
    const form = await request.formData();
    const video = form.get('video');
    const text = form.get('text') || form.get('url') || form.get('title') || '';
    const cache = await caches.open(SHARE_CACHE);

    if (video && video.size > 0) {
      await cache.put(
        '/shared/video',
        new Response(video, {
          headers: {
            'Content-Type': video.type || 'video/mp4',
            'X-File-Name': encodeURIComponent(video.name || 'shared-video'),
            'X-Shared-At': String(Date.now()),
          },
        }),
      );
      return Response.redirect('/?share=video', 303);
    }

    if (text) {
      await cache.put('/shared/text', new Response(String(text)));
      return Response.redirect('/?share=text', 303);
    }

    return Response.redirect('/?share=empty', 303);
  } catch (err) {
    // Never leave the user on a broken POST — always land in the app.
    return Response.redirect('/?share=error', 303);
  }
}
