import { useEffect, useRef, useState } from 'react';
import { PIPELINE_STAGES } from '../mock.js';
import { runPipeline, PipelineError } from '../pipeline/index.js';

/**
 * Runs the real pipeline and reports its progress.
 *
 * Stages come from the pipeline itself now rather than timers; the stage
 * ids are unchanged, so this screen's design (PROJECT_PLAN.md §4 spec) did
 * not have to move when the mock was replaced.
 */
export default function ProcessingView({ input, onDone, onCancel }) {
  const [stageId, setStageId] = useState(PIPELINE_STAGES[0].id);
  const [detail, setDetail] = useState('');
  const [song, setSong] = useState(null);
  const [error, setError] = useState(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;

    runPipeline(input, (id, d) => {
      if (cancelled.current) return;
      setStageId(id);
      setDetail(d ?? '');
    })
      .then((result) => {
        if (cancelled.current) return;
        // Show the identified song briefly before switching to the sheet —
        // the progressive-reveal moment the design calls for.
        if (result.stats?.identified) setSong({ title: result.title, artist: result.artist });
        onDone(result);
      })
      .catch((err) => {
        if (cancelled.current) return;
        setError(
          err instanceof PipelineError
            ? { title: titleFor(err.code), detail: err.message }
            : {
                title: "Couldn't read this one",
                detail:
                  'Something went wrong while processing the video. Try another one, or a different tutorial.',
              },
        );
      });

    return () => {
      cancelled.current = true;
    };
  }, [input, onDone]);

  if (error) {
    return (
      <div className="processing">
        <div className="proc-fail">
          <div className="glyph" aria-hidden="true">◐</div>
          <h2>{error.title}</h2>
          <p>{error.detail}</p>
          <button className="pill pill--primary" onClick={onCancel}>Try another video</button>
        </div>
      </div>
    );
  }

  const activeIndex = PIPELINE_STAGES.findIndex((s) => s.id === stageId);

  return (
    <>
      <div className="processing">
        <div className="eq" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} />
          ))}
        </div>

        {song && (
          <div className="songfound">
            <div className="tag">♪ SONG IDENTIFIED</div>
            <strong>{song.title}</strong>
            <span>{song.artist}</span>
          </div>
        )}

        <div className="stages">
          {PIPELINE_STAGES.map((stage, i) => (
            <div
              key={stage.id}
              className={`stage ${i < activeIndex ? 'done' : i === activeIndex ? 'active' : ''}`}
            >
              <div className="ring" aria-hidden="true">{i < activeIndex ? '✓' : ''}</div>
              <span>
                {stage.label}
                {i === activeIndex && detail && <em className="stage-detail"> {detail}</em>}
              </span>
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

function titleFor(code) {
  switch (code) {
    case 'no-chords':
      return 'No chords on screen';
    case 'no-frames':
      return "Couldn't read the video";
    default:
      return "Couldn't read this one";
  }
}
