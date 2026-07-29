/**
 * Songbook persistence — localStorage for now.
 *
 * This is a stand-in with the same shape as the eventual DynamoDB records
 * (PROJECT_PLAN.md §7: USER#id / SONG#songId with title, artist, chordpro,
 * source, saved_at). When accounts land in Phase 4, this module's interface
 * stays and its storage moves behind the Worker API.
 */

const KEY = 'reelchords:songbook:v1';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

function write(songs) {
  localStorage.setItem(KEY, JSON.stringify(songs));
}

/** @returns {Array<{id:string,title:string,artist:string,chordpro:string,source:string,savedAt:number}>} */
export function listSongs() {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

export function saveSong({ id, title, artist, chordpro, source }) {
  const songs = read().filter((s) => s.id !== id);
  songs.push({
    id: id || `song-${Date.now()}`,
    title: title || 'Untitled',
    artist: artist || '',
    chordpro,
    source: source || '',
    savedAt: Date.now(),
  });
  write(songs);
}

export function deleteSong(id) {
  write(read().filter((s) => s.id !== id));
}

export function hasSong(id) {
  return read().some((s) => s.id === id);
}
