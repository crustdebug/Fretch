import { useEffect, useState } from 'react';
import { PIPELINE_STAGES, MOCK_RESULT } from '../mock.js';

/**
 * Staged progress screen — equalizer bars, stage checklist, and the
 * progressive-reveal slot (song identified before chords finish).
 *
 * Timers stand in for the Phase 3 job-status polling; the stage ids match
 * what the pipeline will report. The `error` state renders the designed
 * failure screen — unused by the mock, wired for Phase 1.
 */
export default function ProcessingView({ input, onDone, onCancel }) {
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState(null); // { title, detail } — Phase 1 wires this

  // The mock "identifies the song" once that stage completes, so the
  // progressive-reveal UI is real even before the backend is.
  const songFound = stageIndex > PIPELINE_STAGES.findIndex((s) => s.id === 'songid');

  useEffect(() => {
    if (error) return;
    if (stageIndex >= PIPELINE_STAGES.length) {
      const t = setTimeout(
        () => onDone({ ...MOCK_RESULT, id: input.id ?? MOCK_RESULT.id, source: input.label }),
        300,
      );
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStageIndex((i) => i + 1), PIPELINE_STAGES[stageIndex].ms);
    return () => clearTimeout(t);
  }, [stageIndex, error, input, onDone]);

  if (error) {
    return (
      <div className="processing">
        <div className="proc-fail">
          <div className="glyph" aria-hidden="true">◐</div>
          <h2>{error.title}</h2>
          <p>{error.detail}</p>
          <button className="pill pill--amber" onClick={onCancel}>Try another video</button>
          <button className="pill pill--ghost">What works best?</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="processing">
        <div className="eq" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} style={{ animationDelay: `${i * 0.12}s`, height: 6 + ((i * 7) % 16) }} />
          ))}
        </div>

        {songFound && (
          <div className="songfound">
            <div className="tag">♪ SONG IDENTIFIED</div>
            <strong>{MOCK_RESULT.title}</strong>
            <span>{MOCK_RESULT.artist}</span>
          </div>
        )}

        <div className="stages">
          {PIPELINE_STAGES.map((stage, i) => (
            <div
              key={stage.id}
              className={`stage ${i < stageIndex ? 'done' : i === stageIndex ? 'active' : ''}`}
            >
              <div className="ring" aria-hidden="true">{i < stageIndex ? '✓' : ''}</div>
              <span>{stage.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="proc-cancel">
        <button className="linklike" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}
