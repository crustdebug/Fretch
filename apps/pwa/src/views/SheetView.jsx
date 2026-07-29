import { useMemo, useState } from 'react';
import { parseChordPro, transposeChordPro } from '@reelchords/chord-core';
import { saveSong, hasSong } from '../songbook.js';

/**
 * The money screen — a chord sheet on warm paper, chords in dark-amber mono
 * above their lyric. Transpose works on the raw ChordPro text, and the view
 * re-derives from it, so display / save / copy are always the same document.
 */
export default function SheetView({ result, onBack }) {
  const [semitones, setSemitones] = useState(0);
  const [saved, setSaved] = useState(() => hasSong(result.id));
  const [copied, setCopied] = useState(false);

  const chordpro = useMemo(
    () => transposeChordPro(result.chordpro, semitones),
    [result.chordpro, semitones],
  );
  const sheet = useMemo(() => parseChordPro(chordpro), [chordpro]);

  // stats.identified is authoritative when the pipeline produced it; saved
  // songs predate it, so fall back to whether a title exists.
  const identified = result.stats
    ? result.stats.identified
    : Boolean(sheet.title ?? result.title);
  const keyLabel = sheet.key
    ? sheet.key
    : semitones === 0
      ? '0'
      : semitones > 0
        ? `+${semitones}`
        : `${semitones}`;

  function onSave() {
    saveSong({ ...result, chordpro });
    setSaved(true);
  }

  async function onCopy() {
    await navigator.clipboard.writeText(chordpro);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <div className="sheet-top">
        <button className="linklike" onClick={onBack}>← Back</button>
      </div>

      <div className="sheet-head">
        {identified ? (
          <>
            <h2>{sheet.title ?? result.title}</h2>
            {(sheet.artist ?? result.artist) && (
              <div className="sub">{sheet.artist ?? result.artist}</div>
            )}
          </>
        ) : (
          <>
            <h2 className="unknown">Song not identified</h2>
            <div className="sub">The chords came through — add a title yourself</div>
          </>
        )}
        {result.stats && (
          <div className="sub">
            {result.stats.chords} chord{result.stats.chords === 1 ? '' : 's'} from{' '}
            {result.stats.frames} frames
          </div>
        )}
      </div>

      <div className="transpose-row">
        <span className="label">Transpose</span>
        <div className="transpose" role="group" aria-label="Transpose">
          <button onClick={() => setSemitones((s) => s - 1)} aria-label="Down a semitone">−</button>
          <span className="key">{keyLabel}</span>
          <button onClick={() => setSemitones((s) => s + 1)} aria-label="Up a semitone">+</button>
        </div>
      </div>

      <div className="sheet-body">
        {sheet.sections.map((section, si) => (
          <div key={si} className="section">
            {section.name && <div className="section-label">{section.name}</div>}
            {section.items.map((item, ii) => {
              if (item.type === 'comment') {
                return <p key={ii} className="sheet-comment">{item.text}</p>;
              }
              // A line whose segments carry no lyric text is a bare
              // progression (no song identified, or no lyrics found). Chord-
              // above-lyric layout collapses to illegible mush there, so
              // render those as spaced chord chips instead.
              const hasLyrics = item.segments.some((s) => s.text.trim());
              if (!hasLyrics) {
                return (
                  <div key={ii} className="chordrow">
                    {item.segments
                      .filter((s) => s.chord)
                      .map((seg, gi) => (
                        <span key={gi} className="chordchip">{seg.chord}</span>
                      ))}
                  </div>
                );
              }
              return (
                <div key={ii} className="chordline">
                  {item.segments.map((seg, gi) => (
                    <span key={gi} className="pair">
                      <span className="chord">{seg.chord ?? ' '}</span>
                      <span className="lyric">{seg.text || ' '}</span>
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="sheet-actions">
        <button className="pill pill--quiet" onClick={onCopy}>
          {copied ? 'Copied ✓' : 'Copy ChordPro'}
        </button>
        <button
          className={`pill ${saved ? 'pill--quiet' : 'pill--primary'}`}
          onClick={onSave}
          disabled={saved}
        >
          {saved ? 'Saved ✓' : 'Save to songbook'}
        </button>
      </div>
    </>
  );
}
