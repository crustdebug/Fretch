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
const INSTAGRAM_RE = /instagram\.com\/(?:reel|reels|p)\/([\w-]+)/;

function classifyLink(raw) {
  const url = raw.trim();
  if (!url) return { kind: 'empty' };
  const ig = url.match(INSTAGRAM_RE);
  if (ig) return { kind: 'instagram', url, id: `ig-${ig[1]}` };
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
    nativePrompt: promptEvent ? () => promptEvent.prompt() : null,
    isIos,
    standalone,
  };
}

/**
 * Fallback install instructions, shown when the browser hasn't offered the
 * native prompt (Firefox/Safari never do; Chrome only on the installed-and-
 * eligible HTTPS origin).
 */
function InstallHelp({ onClose }) {
  return (
    <div className="install-help">
      <div className="install-help-head">
        <strong>Install ReelChords</strong>
        <button className="linklike" onClick={onClose}>Close</button>
      </div>
      <ul>
        <li><strong>Android (Chrome):</strong> tap ⋮ → “Add to Home screen” → Install.</li>
        <li><strong>iPhone (Safari):</strong> tap Share → “Add to Home Screen”.</li>
        <li><strong>Desktop (Chrome/Edge):</strong> install icon at the right of the address bar, or ⋮ → “Cast, save and share” → “Install page as app”.</li>
      </ul>
      <p>Installing on Android is what makes ReelChords appear in the share sheet.</p>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('home'); // home | processing | sheet | songbook
  const [link, setLink] = useState('');
  const [video, setVideo] = useState(null); // { name, size, type, blobUrl }
  const [shareState, setShareState] = useState(null); // null | 'failed'
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const { nativePrompt, standalone } = useInstall();

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
        setVideo({ name, blob, size: blob.size, type: blob.type, blobUrl: URL.createObjectURL(blob) });
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
  const [igFetch, setIgFetch] = useState('idle'); // idle | fetching | failed
  const canProcess =
    igFetch !== 'fetching' &&
    (Boolean(video) || linkInfo.kind === 'youtube' || linkInfo.kind === 'instagram');

  async function startProcessing() {
    if (!video && linkInfo.kind === 'instagram') {
      // Try the server-side resolver first; the manual download guidance is
      // the fallback, not the default (see spike/FINDINGS.md addendum).
      setIgFetch('fetching');
      try {
        const res = await fetch('/api/resolve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: linkInfo.url }),
        });
        if (!res.ok) throw new Error(`resolve ${res.status}`);
        const { proxyUrl } = await res.json();
        const media = await fetch(proxyUrl);
        if (!media.ok) throw new Error(`media ${media.status}`);
        const blob = await media.blob();
        const fetched = {
          name: 'instagram-reel.mp4',
          blob,
          size: blob.size,
          type: blob.type || 'video/mp4',
          blobUrl: URL.createObjectURL(blob),
        };
        setVideo(fetched);
        setIgFetch('idle');
        setJob({ id: linkInfo.id, label: linkInfo.url, blob, blobUrl: fetched.blobUrl });
        setView('processing');
      } catch {
        setIgFetch('failed');
      }
      return;
    }

    if (video) {
      setJob({
        id: `file-${video.name}-${video.size}`,
        label: video.name,
        blob: video.blob,
        blobUrl: video.blobUrl,
      });
      setView('processing');
      return;
    }

    // YouTube: resolve server-side to a playable URL, then process the bytes
    // exactly like any other video.
    setIgFetch('fetching');
    try {
      const res = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: linkInfo.url }),
      });
      if (!res.ok) throw new Error(`resolve ${res.status}`);
      const { proxyUrl } = await res.json();
      const media = await fetch(proxyUrl);
      if (!media.ok) throw new Error(`media ${media.status}`);
      const blob = await media.blob();
      setIgFetch('idle');
      setJob({
        id: linkInfo.id,
        label: link.trim(),
        blob,
        blobUrl: URL.createObjectURL(blob),
      });
      setView('processing');
    } catch {
      setIgFetch('failed');
    }
  }

  function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setShareState(null);
    setVideo({ name: file.name, blob: file, size: file.size, type: file.type, blobUrl: URL.createObjectURL(file) });
  }

  const topbar = (
    <>
      <header className="topbar">
        <span className="wordmark">
          ReelChords<span className="dot">.</span>
        </span>
        {!standalone && (
          <button
            className="installbtn"
            onClick={() => (nativePrompt ? nativePrompt() : setShowInstallHelp((s) => !s))}
          >
            Install app
          </button>
        )}
      </header>
      {showInstallHelp && <InstallHelp onClose={() => setShowInstallHelp(false)} />}
    </>
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
          {linkInfo.kind === 'instagram' && igFetch !== 'failed' && (
            <div className="panel panel--ok">
              <strong>✓ Instagram reel recognized</strong>
              <span>
                {igFetch === 'fetching'
                  ? 'Fetching the video…'
                  : 'We’ll fetch the video automatically. Private reels may not work.'}
              </span>
            </div>
          )}
          {linkInfo.kind === 'instagram' && igFetch === 'failed' && (
            <div className="panel panel--guide">
              <div className="url">{truncateUrl(link.trim())}</div>
              <p><strong>Automatic fetch didn't work for this reel.</strong></p>
              <ol>
                <li>In Instagram, tap <strong>Share → Download</strong> to save the reel to your gallery.</li>
                <li>Come back here and <strong>Choose a video</strong> — or share the saved video from your gallery to ReelChords.</li>
              </ol>
              <p className="fine">No Download button on that reel? A screen recording works too — the chords just need to be visible.</p>
            </div>
          )}
          {linkInfo.kind === 'unknown-url' && (
            <div className="panel panel--dim">
              <strong>This link isn't supported yet</strong>
              <span>Try a YouTube Shorts link, or share the video file directly.</span>
            </div>
          )}

          <div className="orlabel">or paste a YouTube Shorts / Instagram reel link</div>
          <input
            type="url"
            placeholder="youtube.com/shorts/... or instagram.com/reel/..."
            value={link}
            onChange={(e) => { setLink(e.target.value); setIgFetch('idle'); }}
            spellCheck={false}
          />

          <button className="pill pill--primary" disabled={!canProcess} onClick={startProcessing}>
            {igFetch === 'fetching' ? 'Fetching reel…' : 'Get the chords'}
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
