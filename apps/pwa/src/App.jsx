import { useEffect, useMemo, useState } from 'react';
import { classify } from '@reelchords/chord-core';
import ProcessingView from './views/ProcessingView.jsx';
import SheetView from './views/SheetView.jsx';
import SongbookView from './views/SongbookView.jsx';

/**
 * View flow:  home → processing → sheet
 *                └→ songbook ────→ sheet (saved copy)
 *
 * Simple state-based navigation; a router would be overkill for four screens
 * and would complicate the share-target redirect handling.
 */

const YOUTUBE_RE = /(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([\w-]{6,})/;
const INSTAGRAM_RE = /instagram\.com\/(?:reel|reels|p)\//;

function classifyLink(raw) {
  const url = raw.trim();
  if (!url) return { kind: 'empty' };
  if (INSTAGRAM_RE.test(url)) return { kind: 'instagram', url };
  const yt = url.match(YOUTUBE_RE);
  if (yt) return { kind: 'youtube', url, id: `yt-${yt[1]}` };
  try {
    new URL(url);
    return { kind: 'unknown-url', url };
  } catch {
    return { kind: 'not-a-url' };
  }
}

export default function App() {
  const [view, setView] = useState('home'); // home | processing | sheet | songbook
  const [link, setLink] = useState('');
  const [video, setVideo] = useState(null); // { name, size, type, blobUrl }
  const [sharedText, setSharedText] = useState('');
  const [job, setJob] = useState(null); // { id, label }
  const [result, setResult] = useState(null);

  // Collect anything the service worker left in the share inbox
  // (i.e. the app was opened from the Android share sheet).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const share = params.get('share');
    if (!share) return;
    window.history.replaceState(null, '', '/');

    (async () => {
      const cache = await caches.open('share-inbox');
      if (share === 'video') {
        const res = await cache.match('/shared/video');
        if (res) {
          const blob = await res.blob();
          const name = decodeURIComponent(res.headers.get('X-File-Name') || 'shared-video');
          setVideo({ name, size: blob.size, type: blob.type, blobUrl: URL.createObjectURL(blob) });
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
  const canProcess = Boolean(video) || linkInfo.kind === 'youtube';

  function startProcessing() {
    const input = video
      ? { id: `file-${video.name}-${video.size}`, label: video.name }
      : { id: linkInfo.id, label: link.trim() };
    setJob(input);
    setView('processing');
  }

  function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideo({ name: file.name, size: file.size, type: file.type, blobUrl: URL.createObjectURL(file) });
  }

  if (view === 'processing') {
    return (
      <Shell onSongbook={() => setView('songbook')}>
        <ProcessingView
          input={job}
          onDone={(res) => { setResult(res); setView('sheet'); }}
          onCancel={() => setView('home')}
        />
      </Shell>
    );
  }

  if (view === 'sheet' && result) {
    return (
      <Shell onSongbook={() => setView('songbook')}>
        <SheetView result={result} onBack={() => setView('home')} />
      </Shell>
    );
  }

  if (view === 'songbook') {
    return (
      <Shell onSongbook={null}>
        <SongbookView
          onOpen={(song) => { setResult(song); setView('sheet'); }}
          onBack={() => setView('home')}
        />
      </Shell>
    );
  }

  return (
    <Shell onSongbook={() => setView('songbook')}>
      <section className="card">
        <h2>Add a tutorial</h2>

        <label className="dropzone">
          <input type="file" accept="video/*" onChange={onPickFile} hidden />
          <strong>{video ? 'Choose a different video' : 'Choose a video'}</strong>
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
          </div>
        )}

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
          <p className="ok">YouTube link recognised — ready to process.</p>
        )}
        {linkInfo.kind === 'instagram' && (
          <div className="notice">
            <strong>Instagram links can't be fetched directly.</strong>
            <p>
              Instagram blocks automated access — but there's a path that works
              just as well: open the reel, tap <em>Share</em>, and choose{' '}
              <em>ReelChords</em> to send the video itself. Same result, no
              login needed.
            </p>
          </div>
        )}
        {linkInfo.kind === 'unknown-url' && (
          <p className="warn">That link isn't a source we recognise yet.</p>
        )}
        {sharedText && linkInfo.kind === 'empty' && (
          <p className="warn">Shared text wasn't a usable link: “{sharedText.slice(0, 80)}”</p>
        )}

        <button className="primary big" disabled={!canProcess} onClick={startProcessing}>
          Get the chords
        </button>
      </section>

      <GrammarDemo />
    </Shell>
  );
}

function Shell({ children, onSongbook }) {
  return (
    <main className="wrap">
      <header className="topbar">
        <div>
          <h1>ReelChords</h1>
          <p className="tagline">Reel in, chord sheet out.</p>
        </div>
        {onSongbook && (
          <button className="ghost" onClick={onSongbook}>Songbook</button>
        )}
      </header>
      {children}
      <footer>
        <span className="muted small">portfolio project · phase 0 · pipeline mocked</span>
      </footer>
    </main>
  );
}

/**
 * Live window into @reelchords/chord-core — the same filter the pipeline
 * uses. Doubles as proof the workspace package bundles for the browser.
 */
function GrammarDemo() {
  const [input, setInput] = useState('Em  D6-9/F#  Arn  FOLLOW  1002  Cadd9');

  const results = useMemo(
    () => input.split(/\s+/).filter(Boolean).map((token) => ({ token, ...classify(token) })),
    [input],
  );

  return (
    <section className="card">
      <h2>Chord grammar, live</h2>
      <p className="muted">
        The actual filter that separates chords from OCR noise. Try mangling a
        chord the way OCR would — <code>Arn</code>, <code>Ern</code> — and
        watch it get repaired.
      </p>
      <input type="text" value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} />
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
