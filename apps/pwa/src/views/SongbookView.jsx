import { useState } from 'react';
import { listSongs, deleteSong } from '../songbook.js';

export default function SongbookView({ onOpen, onBack }) {
  const [songs, setSongs] = useState(listSongs);

  function onDelete(id) {
    deleteSong(id);
    setSongs(listSongs());
  }

  return (
    <div>
      <button className="linklike" onClick={onBack}>← back</button>
      <h2>Songbook</h2>

      {songs.length === 0 ? (
        <div className="card empty">
          <p>Nothing saved yet.</p>
          <p className="muted">Process a tutorial and hit “Save to songbook”.</p>
        </div>
      ) : (
        <ul className="songlist">
          {songs.map((song) => (
            <li key={song.id} className="card songrow">
              <button className="songmain" onClick={() => onOpen(song)}>
                <strong>{song.title}</strong>
                <span className="muted">
                  {song.artist}
                  {song.artist && ' · '}
                  {new Date(song.savedAt).toLocaleDateString()}
                </span>
              </button>
              <button
                className="danger"
                aria-label={`Delete ${song.title}`}
                onClick={() => onDelete(song.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
