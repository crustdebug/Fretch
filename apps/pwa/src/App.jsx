import { useEffect, useMemo, useState } from 'react';
import { classify } from '@reelchords/chord-core';
import ProcessingView from './views/ProcessingView.jsx';
import SheetView from './views/SheetView.jsx';
import SongbookView from './views/SongbookView.jsx';

/**
 * View flow:  home → processing → sheet
 *                └→ songbook ────→ sheet (saved copy)
 *
 * Minimal visual system: one light ground, ink text, single teal accent.
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

function truncateUrl(url, max = 34) {
  return url.length > max ? url.slice(0, max) + '…' : url;
}

/**
 * PWA install affordance.
 *
 * Browsers hide their install entry deep in menus, so we surface our own:
 * Chrome/Edge fire `beforeinstallprompt` when the app is installable — we
 * stash the event and offer an Install button that triggers the native
 * dialog. iOS Safari has no such event (or share-target support), so it
 * gets a one-line Add-to-Home-Screen hint instead.
 */
function useInstall() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [standalone, setStandalone] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches,
  );

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setPromptEvent(e);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return {
    canInstall: Boolean(promptEvent),
    install: () => promptEvent?.prompt(),
    showIosHint: isIos && !standalone,
    standalone,
  };
}

export default function App() {
  const [view, setView] = useState('home'); // home | processing | sheet | songbook
  const [link, setLink] = useState('');
  const [video, setVideo] = useState(null); // { name, size, type, blobUrl }
  const [shareState, setShareState] = useState(null); // null | 'failed'
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const { canInstall, install, showIosHint } = useInstall();

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
        if (!res) return setShareState('failed');
        const blob = await res.blob();
        const name = decodeURIComponent(res.headers.get('X-File-Name') || 'shared-video');
        setVideo({ name, size: blob.size, type: blob.type, blobUrl: URL.createObjectURL(blob) });
        await cache.delete('/shared/video');
      } else if (share === 'text') {
        const res = await cache.match('/shared/text');
        if (!res) return setShareState('failed');
        setLink(await res.text());
        await cache.delete('/shared/text');
      } else {
        setShareState('failed');
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
    setShareState(null);
    setVideo({ name: file.name, size: file.size, type: file.type, blobUrl: URL.createObjectURL(file) });
  }

  const topbar = (
    <header className="topbar">
      <span className="wordmark">
        ReelChords<span className="dot">.</span>
      </span>
      {canInstall && (
        <button className="installbtn" onClick={install}>
          Install app
        </button>
      )}
    </header>
  );

  const nav = (
    <nav className="bottomnav">
      <button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>
        <span className="navicon">⌂</span>
        Home
      </button>
      <button className={view === 'songbook' ? 'active' : ''} onClick={() => setView('songbook')}>
        <span className="navicon">♫</span>
        Songbook
      </button>
    </nav>
  );

  if (view === 'processing') {
    return (
      <div className="app">
        <div className="screen">
          <ProcessingView
            input={job}
            onDone={(res) => { setResult(res); setView('sheet'); }}
            onCancel={() => setView('home')}
          />
        </div>
      </div>
    );
  }

  if (view === 'sheet' && result) {
    return (
      <div className="app">
        <div className="screen">
          <SheetView result={result} onBack={() => setView('home')} />
        </div>
      </div>
    );
  }

  if (view === 'songbook') {
    return (
      <div className="app">
        {topbar}
        <div className="screen">
          <SongbookView
            onOpen={(song) => { setResult(song); setView('sheet'); }}
            onAdd={() => setView('home')}
          />
        </div>
        {nav}
      </div>
    );
  }

  return (
    <div className="app">
      {topbar}
      <div className="screen">
        <div className="home-hero">
          <h1>Turn any guitar reel into a chord sheet.</h1>
          <p className="sub">Reads the chords the creator put on screen.</p>
        </div>

        {showIosHint && (
          <p className="ios-hint">
            To install on iPhone: tap Share, then “Add to Home Screen”.
          </p>
        )}

        <div className="home-body">
          {video ? (
            <div className="videocard">
              <div className="thumb">
                <video src={video.blobUrl} muted playsInline />
              </div>
              <div className="meta">
                <strong>{video.name}</strong>
                <span>{(video.size / 1024 / 1024).toFixed(1)} MB · ready</span>
              </div>
            </div>
          ) : (
            <label className="dropzone">
              <input type="file" accept="video/*" onChange={onPickFile} hidden />
              <div className="note-icon">♪</div>
              <strong>Choose a video</strong>
              <span>or share one here from another app</span>
            </label>
          )}

          {shareState === 'failed' && (
            <div className="panel panel--err">
              <strong>That share didn't come through</strong>
              <span>Try sharing the video to ReelChords again.</span>
            </div>
          )}

          {linkInfo.kind === 'youtube' && (
            <div className="panel panel--ok">
              <strong>✓ YouTube Shorts link recognized</strong>
              <span>{truncateUrl(link.trim())}</span>
            </div>
          )}
          {linkInfo.kind === 'instagram' && (
            <div className="panel panel--guide">
              <div className="url">{truncateUrl(link.trim())}</div>
              <p>Instagram links can't be fetched directly.</p>
              <p>Open the reel, tap Share, then choose ReelChords to send the video itself.</p>
            </div>
          )}
          {linkInfo.kind === 'unknown-url' && (
            <div className="panel panel--dim">
              <strong>This link isn't supported yet</strong>
              <span>Try a YouTube Shorts link, or share the video file directly.</span>
            </div>
          )}

          <div className="orlabel">or paste a YouTube Shorts link</div>
          <input
            type="url"
            placeholder="youtube.com/shorts/..."
            value={link}
            onChange={(e) => setLink(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="home-cta">
          <button className="pill pill--primary" disabled={!canProcess} onClick={startProcessing}>
            Get the chords
          </button>
        </div>

        <GrammarDemo />
      </div>
      {nav}
    </div>
  );
}

/**
 * Live window into @reelchords/chord-core — the same filter the pipeline
 * uses. A quiet disclosure so it reads as "how it works", not main flow.
 */
function GrammarDemo() {
  const [input, setInput] = useState('Em  D6-9/F#  Arn  FOLLOW  1002  Cadd9');

  const results = useMemo(
    () => input.split(/\s+/).filter(Boolean).map((token) => ({ token, ...classify(token) })),
    [input],
  );

  return (
    <details className="grammar">
      <summary>How it reads chords</summary>
      <div className="inner">
        <p>
          Every word OCR sees goes through a chord grammar. Real chords pass,
          noise is rejected, and near-misses get repaired — try <code>Arn</code>.
        </p>
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} />
        <div className="tokens">
          {results.map(({ token, chord, status }, i) => (
            <span key={i} className={`token ${status}`} title={status}>
              {chord ? (status === 'repaired' ? `${token}→${chord}` : chord) : token}
            </span>
          ))}
        </div>
      </div>
    </details>
  );
}
