import { useEffect, useMemo, useState } from 'react';
import { classify } from '@reelchords/chord-core';

/**
 * The three entry points from PROJECT_PLAN.md §4, in priority order:
 *   1. shared/uploaded video file  — primary, works for everything
 *   2. YouTube Shorts URL          — fetchable server-side (verified in spike)
 *   3. Instagram URL               — can't be fetched; guide user to share the file
 */

const YOUTUBE_RE = /(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([\w-]{6,})/;
const INSTAGRAM_RE = /instagram\.com\/(?:reel|reels|p)\//;

function classifyLink(raw) {
  const url = raw.trim();
  if (!url) return { kind: 'empty' };
  if (INSTAGRAM_RE.test(url)) return { kind: 'instagram', url };
  if (YOUTUBE_RE.test(url)) return { kind: 'youtube', url };
  try {
    new URL(url);
    return { kind: 'unknown-url', url };
  } catch {
    return { kind: 'not-a-url' };
  }
}

export default function App() {
  const [link, setLink] = useState('');
  const [video, setVideo] = useState(null); // { name, size, type, blobUrl }
  const [sharedText, setSharedText] = useState('');

  // On launch, check whether the service worker left something in the share
  // inbox (i.e. the app was opened via the Android share sheet).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const share = params.get('share');
    if (!share) return;
    // Clean the URL so a reload doesn't re-trigger.
    window.history.replaceState(null, '', '/');

    (async () => {
      const cache = await caches.open('share-inbox');
      if (share === 'video') {
        const res = await cache.match('/shared/video');
        if (res) {
          const blob = await res.blob();
          const name = decodeURIComponent(res.headers.get('X-File-Name') || 'shared-video');
          setVideo({
            name,
            size: blob.size,
            type: blob.type,
            blobUrl: URL.createObjectURL(blob),
          });
          await cache.delete('/shared/video');
        }
      } else if (share === 'text') {
        const res = await cache.match('/shared/text');
        if (res) {
          const text = await res.text();
          setSharedText(text);
          setLink(text);
          await cache.delete('/shared/text');
        }
      }
    })();
  }, []);

  const linkInfo = useMemo(() => classifyLink(link), [link]);

  function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideo({
      name: file.name,
      size: file.size,
      type: file.type,
      blobUrl: URL.createObjectURL(file),
    });
  }

  return (
    <main className="wrap">
      <header>
        <h1>ReelChords</h1>
        <p className="tagline">
          Reel in, chord sheet out — reads the chords the creator put on screen.
        </p>
      </header>

      {/* ---- entry point 1: video file ---------------------------------- */}
      <section className="card">
        <h2>Add a tutorial</h2>

        <label className="dropzone">
          <input type="file" accept="video/*" onChange={onPickFile} hidden />
          <strong>Choose a video</strong>
          <span>
            or share one here from another app — on Android, tap Share on the
            reel and pick ReelChords
          </span>
        </label>

        {video && (
          <div className="picked">
            <video src={video.blobUrl} controls playsInline />
            <p>
              <strong>{video.name}</strong> · {(video.size / 1024 / 1024).toFixed(1)} MB
            </p>
            <p className="pending">
              Processing pipeline lands in Phase 2 — this proves the intake path.
            </p>
          </div>
        )}

        {/* ---- entry points 2 + 3: pasted link -------------------------- */}
        <div className="linkrow">
          <input
            type="url"
            placeholder="…or paste a YouTube Shorts link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            spellCheck={false}
          />
        </div>

        {linkInfo.kind === 'youtube' && (
          <p className="ok">
            YouTube link recognised — server-side fetch is supported for these.
            (Pipeline lands in Phase 1.)
          </p>
        )}
        {linkInfo.kind === 'instagram' && (
          <div className="notice">
            <strong>Instagram links can't be fetched directly.</strong>
            <p>
              Instagram blocks automated access — but there's a path that works
              just as well: open the reel, tap <em>Share</em>, and choose{' '}
              <em>ReelChords</em> to send the video itself. Same result, no login
              needed.
            </p>
          </div>
        )}
        {linkInfo.kind === 'unknown-url' && (
          <p className="warn">That link isn't a source we recognise yet.</p>
        )}
        {sharedText && linkInfo.kind === 'empty' && (
          <p className="warn">Shared text wasn't a usable link: “{sharedText.slice(0, 80)}”</p>
        )}
      </section>

      {/* ---- live chord-core demo --------------------------------------- */}
      <GrammarDemo />

      <footer>
        <a href="https://github.com/" aria-disabled="true">
          portfolio project · phase 0
        </a>
      </footer>
    </main>
  );
}

/**
 * A live window into @reelchords/chord-core — the same code that will filter
 * OCR output in the real pipeline. Doubles as proof that the monorepo package
 * bundles into the browser correctly.
 */
function GrammarDemo() {
  const [input, setInput] = useState('Em  D6-9/F#  Arn  FOLLOW  1002  Cadd9');

  const results = useMemo(
    () =>
      input
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => ({ token, ...classify(token) })),
    [input],
  );

  return (
    <section className="card">
      <h2>Chord grammar, live</h2>
      <p className="muted">
        This is the actual filter that separates chords from OCR noise. Try
        mangling a chord the way OCR would — <code>Arn</code>, <code>Ern</code> —
        and watch it get repaired.
      </p>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
      />
      <div className="tokens">
        {results.map(({ token, chord, status }, i) => (
          <span key={i} className={`token ${status}`} title={status}>
            {chord ? (status === 'repaired' ? `${token}→${chord}` : chord) : token}
          </span>
        ))}
      </div>
      <p className="legend">
        <span className="token exact">chord</span>
        <span className="token repaired">repaired</span>
        <span className="token rejected">rejected</span>
      </p>
    </section>
  );
}
