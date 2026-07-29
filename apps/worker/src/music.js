/**
 * Song identification (AudD) and lyrics (LRCLIB) — PROJECT_PLAN.md §6 step 7.
 *
 * Both run server-side rather than from the browser:
 *   - AudD needs an API token that must not ship to clients;
 *   - LRCLIB sends no CORS headers, so a browser can't call it directly.
 */

/**
 * Identify a song from a short audio clip.
 *
 * @param {Blob|ArrayBuffer} audio  WAV excerpt
 * @param {{AUDD_API_TOKEN?: string}} env
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{title: string, artist: string, album?: string, releaseDate?: string}|null>}
 */
export async function identifySong(audio, env, fetchImpl = fetch) {
  if (!env.AUDD_API_TOKEN) return null; // not configured — chords-only result

  const form = new FormData();
  form.set('api_token', env.AUDD_API_TOKEN);
  form.set('file', audio instanceof Blob ? audio : new Blob([audio]), 'clip.wav');

  const res = await fetchImpl('https://api.audd.io/', { method: 'POST', body: form });
  if (!res.ok) return null;

  const json = await res.json().catch(() => null);
  // AudD answers {status:'success', result:null} when it recognises nothing.
  const r = json?.result;
  if (!r?.title) return null;

  return {
    title: r.title,
    artist: r.artist ?? '',
    album: r.album ?? undefined,
    releaseDate: r.release_date ?? undefined,
  };
}

/**
 * Fetch lyrics from LRCLIB (free, no key).
 *
 * Prefers synced lyrics: they carry timestamps, which is what lets chords be
 * placed against the right line (§6 step 8). Falls back to plain lyrics.
 *
 * @returns {Promise<{lines: {time: number, text: string}[], synced: boolean}|null>}
 */
export async function fetchLyrics(title, artist, fetchImpl = fetch) {
  if (!title) return null;

  const url = new URL('https://lrclib.net/api/get');
  url.searchParams.set('track_name', title);
  if (artist) url.searchParams.set('artist_name', artist);

  const res = await fetchImpl(url, {
    headers: { 'user-agent': 'ReelChords (https://github.com/crustdebug/Fretch)' },
  });
  if (!res.ok) return null;

  const json = await res.json().catch(() => null);
  if (!json) return null;

  if (json.syncedLyrics) {
    const lines = parseLrc(json.syncedLyrics);
    if (lines.length) return { lines, synced: true };
  }
  if (json.plainLyrics) {
    const lines = String(json.plainLyrics)
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((text) => ({ time: 0, text }));
    if (lines.length) return { lines, synced: false };
  }
  return null;
}

/**
 * Parse LRC format: `[mm:ss.xx] lyric text`.
 * @returns {{time: number, text: string}[]}
 */
export function parseLrc(lrc) {
  const out = [];
  for (const raw of String(lrc).split(/\r?\n/)) {
    const m = raw.match(/^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/);
    if (!m) continue;
    const [, mm, ss, frac = '0', text] = m;
    if (!text.trim()) continue; // skip empty timing markers
    const time =
      Number(mm) * 60 + Number(ss) + Number(`0.${frac}`);
    out.push({ time, text: text.trim() });
  }
  return out;
}
