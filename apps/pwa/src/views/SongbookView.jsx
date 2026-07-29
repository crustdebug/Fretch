import { useState } from 'react';
import { parseChordPro } from '@reelchords/chord-core';
import { listSongs, deleteSong } from '../songbook.js';

/**
 * The library — paper ground, key-letter badges on dark tiles (from the
 * design prototype: no cover art exists, the musical key is the identity).
 */
export default function SongbookView({ onOpen, onAdd }) {
  const [songs, setSongs] = useState(listSongs);

  function onDelete(id) {
    deleteSong(id);
    setSongs(listSongs());
  }

  return (
    <>
      <div className="songbook-head">
        <h2>Songbook</h2>
      </div>

      {songs.length === 0 ? (
        <div className="songbook-empty">
          <div className="glyph" aria-hidden="true">♫</div>
          <h3>Nothing saved yet</h3>
          <p>Process a tutorial and hit save — this is where every chord sheet lives.</p>
          <button className="pill pill--primary" onClick={onAdd}>Add your first tutorial</button>
        </div>
      ) : (
        <div className="songlist">
          {songs.map((song) => (
            <div key={song.id} className="songrow">
              <button className="main" onClick={() => onOpen(song)}>
                <span className="keybadge">{parseChordPro(song.chordpro).key ?? '♪'}</span>
                <span className="info">
                  <strong>{song.title}</strong>
                  <span>
                    {song.artist || 'Unknown artist'} ·{' '}
                    {new Date(song.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </span>
              </button>
              <button
                className="remove"
                aria-label={`Delete ${song.title}`}
                onClick={() => onDelete(song.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
