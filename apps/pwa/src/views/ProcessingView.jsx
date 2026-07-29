import { useEffect, useState } from 'react';
import { PIPELINE_STAGES, MOCK_RESULT } from '../mock.js';

/**
 * Staged progress screen.
 *
 * Currently plays back PIPELINE_STAGES on timers; in Phase 3 the timers are
 * replaced by polling the Worker's job-status endpoint (Redis-backed), and
 * the stage ids here match the statuses the pipeline will report. The UI for
 * the async flow exists before the backend does — deliberately.
 */
export default function ProcessingView({ input, onDone, onCancel }) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (stageIndex >= PIPELINE_STAGES.length) {
      // Hand back the mock result, tagged with what the user actually gave us.
      const t = setTimeout(
        () =>
          onDone({
            ...MOCK_RESULT,
            id: input.id ?? MOCK_RESULT.id,
            source: input.label,
          }),
        300,
      );
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStageIndex((i) => i + 1), PIPELINE_STAGES[stageIndex].ms);
    return () => clearTimeout(t);
  }, [stageIndex, input, onDone]);

  return (
    <div className="card processing">
      <h2>Working on it…</h2>
      <p className="muted">{input.label}</p>

      <ol className="stages">
        {PIPELINE_STAGES.map((stage, i) => (
          <li
            key={stage.id}
            className={i < stageIndex ? 'done' : i === stageIndex ? 'active' : ''}
          >
            <span className="dot" aria-hidden="true" />
            {stage.label}
          </li>
        ))}
      </ol>

      <p className="warn small">
        Simulated — the real pipeline lands in Phases 1–2. This screen defines
        the states it must report.
      </p>

      <button className="linklike" onClick={onCancel}>cancel</button>
    </div>
  );
}
