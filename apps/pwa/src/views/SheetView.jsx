import { useMemo, useState } from 'react';
import { parseChordPro, transposeChordPro } from '@reelchords/chord-core';
import { saveSong, hasSong } from '../songbook.js';

/**
 * The money screen: a rendered chord sheet.
 *
 * Rendering approach: each {chord, text} segment is an inline-block pair with
 * the chord sitting above its lyric. Because the pair is one box, wrapping on
 * narrow screens keeps every chord glued to the word it belongs to — the
 * classic failing of <pre>-formatted chord sheets.
 *
 * Transpose works on the raw ChordPro text (chord-core), and the parsed view
 * is derived from that — so what you see, save, and copy are always the same
 * document.
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
    <div>
      <button className="linklike" onClick={onBack}>← back</button>

      <div className="sheet-head">
        <div>
          <h2 className="sheet-title">{sheet.title ?? result.title}</h2>
          <p className="muted">
            {sheet.artist ?? result.artist}
            {sheet.key && <> · key of {transposedKey(sheet.key, semitones)}</>}
            {result.confidence && <> · {(result.confidence * 100) | 0}% match</>}
          </p>
        </div>

        <div className="transpose" role="group" aria-label="Transpose">
          <button onClick={() => setSemitones((s) => s - 1)} aria-label="Down a semitone">−</button>
          <span className={semitones !== 0 ? 'active' : ''}>
            {semitones > 0 ? `+${semitones}` : semitones}
          </span>
          <button onClick={() => setSemitones((s) => s + 1)} aria-label="Up a semitone">+</button>
        </div>
      </div>

      <div className="sheet card">
        {sheet.sections.map((section, si) => (
          <div key={si} className={`section ${section.name}`}>
            {section.name && <div className="section-label">{section.name}</div>}
            {section.items.map((item, ii) =>
              item.type === 'comment' ? (
                <p key={ii} className="muted small">{item.text}</p>
              ) : (
                <div key={ii} className="chordline">
                  {item.segments.map((seg, gi) => (
                    <span key={gi} className="pair">
                      <span className="chord">{seg.chord ?? ' '}</span>
                      <span className="lyric">{seg.text || ' '}</span>
                    </span>
                  ))}
                </div>
              ),
            )}
          </div>
        ))}
      </div>

      <div className="actions">
        <button className="primary" onClick={onSave} disabled={saved}>
          {saved ? 'Saved to songbook ✓' : 'Save to songbook'}
        </button>
        <button onClick={onCopy}>{copied ? 'Copied ✓' : 'Copy ChordPro'}</button>
      </div>
    </div>
  );
}

function transposedKey(key, semitones) {
  if (!semitones) return key;
  // Lazy import avoided: transposeChordPro on a bare token does the job.
  return transposeChordPro(`[${key}]`, semitones).slice(1, -1);
}
