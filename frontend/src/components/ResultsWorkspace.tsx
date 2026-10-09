import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { CodeDetail } from "../api/codes";
import {
  cancelExperiment,
  createExperiment,
  getExperiment,
  type Experiment,
  type FailureSample,
  type ProbabilityResult,
} from "../api/experiments";
import type { Pauli } from "../api/injections";
import { useConfiguration } from "../state/configuration";

const DECODER_ID = "exact-css-min-weight-v1";
const ACTIVE_STATUSES = new Set(["queued", "running", "cancel_requested"]);

function formatPercent(value: number) {
  return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function formatProbability(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function parseProbabilities(value: string): number[] {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) throw new Error("Enter at least one physical error probability.");
  if (parts.length > 25) throw new Error("Use no more than 25 probability points in one run.");
  const probabilities = parts.map(Number);
  if (probabilities.some((probability) => !Number.isFinite(probability))) {
    throw new Error("Enter probabilities as numbers separated by commas.");
  }
  if (probabilities.some((probability) => probability < 0 || probability > 0.5)) {
    throw new Error("Each probability must be between 0 and 0.5.");
  }
  if (probabilities.some((probability, index) => index > 0 && probability <= probabilities[index - 1])) {
    throw new Error("Enter unique probabilities in increasing order.");
  }
  return probabilities;
}

function statusLabel(experiment: Experiment) {
  if (experiment.status === "queued") return "Waiting to start";
  if (experiment.status === "running") return "Running trials";
  if (experiment.status === "cancel_requested") return "Stopping after the current trial";
  if (experiment.status === "completed") return "Run complete";
  if (experiment.status === "cancelled") return "Run stopped";
  return "Run failed";
}

function patternSummary(pattern: Pauli[]) {
  const errors = pattern.flatMap((pauli, index) => pauli === "I" ? [] : [`Q${index + 1}: ${pauli}`]);
  return errors.length ? errors.join(", ") : "No non-identity operations";
}

function ExperimentSetup({ code }: { code: CodeDetail }) {
  const { state, dispatch } = useConfiguration();
  const [probabilityText, setProbabilityText] = useState("0.02, 0.05, 0.08, 0.10, 0.15");
  const [trials, setTrials] = useState(100);
  const [seed, setSeed] = useState(state.seed);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const preview = useMemo(() => {
    try {
      const probabilities = parseProbabilities(probabilityText);
      return { points: probabilities.length, total: probabilities.length * trials };
    } catch {
      return null;
    }
  }, [probabilityText, trials]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    let probabilities: number[];
    try {
      probabilities = parseProbabilities(probabilityText);
      if (!Number.isInteger(trials) || trials < 1 || trials > 100_000) {
        throw new Error("Trials per probability must be a whole number from 1 to 100,000.");
      }
      if (!Number.isSafeInteger(seed) || seed < 0 || seed > Number.MAX_SAFE_INTEGER) {
        throw new Error("The random seed must be a non-negative whole number.");
      }
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Check the experiment settings.");
      return;
    }

    setSubmitting(true);
    try {
      const experiment = await createExperiment({
        code_id: code.id,
        code_version: code.version,
        decoder_id: DECODER_ID,
        probabilities,
        trials_per_probability: trials,
        seed,
        confidence_level: 0.95,
        saved_failure_limit: 10,
      });
      dispatch({ type: "set-experiment", experiment });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The experiment could not be started.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel batch-setup" aria-labelledby="batch-setup-heading">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Experiment settings</p>
          <h2 id="batch-setup-heading">Compare several error probabilities</h2>
        </div>
        <span className="status-badge">95% interval</span>
      </div>
      <p className="section-intro">
        At each probability, the system generates new data-qubit errors, decodes them, and checks whether the logical information survives.
      </p>

      <form className="batch-form" onSubmit={submit} noValidate>
        <label className="batch-field batch-probabilities">
          <span>Physical error probabilities</span>
          <input
            aria-describedby="probability-help"
            onChange={(event) => setProbabilityText(event.target.value)}
            spellCheck={false}
            type="text"
            value={probabilityText}
          />
          <small id="probability-help">Enter increasing values from 0 to 0.5, separated by commas.</small>
        </label>

        <label className="batch-field">
          <span>Trials per probability</span>
          <input
            max={100000}
            min={1}
            onChange={(event) => setTrials(event.target.valueAsNumber)}
            step={1}
            type="number"
            value={trials}
          />
          <small>More trials reduce uncertainty but take longer.</small>
        </label>

        <label className="batch-field">
          <span>Random seed</span>
          <input
            min={0}
            onChange={(event) => setSeed(event.target.valueAsNumber)}
            step={1}
            type="number"
            value={seed}
          />
          <small>Use the same seed and settings to repeat this run.</small>
        </label>

        <div className="batch-run-summary" aria-live="polite">
          <div><span>Code</span><strong>{code.name}</strong></div>
          <div><span>Decoder</span><strong>Exact minimum-weight CSS</strong></div>
          <div><span>Planned work</span><strong>{preview ? `${preview.total.toLocaleString()} trials across ${preview.points} points` : "Check probability values"}</strong></div>
        </div>

        {error && <p className="inline-error" role="alert">{error}</p>}
        <button className="primary-action batch-start" disabled={submitting || !preview} type="submit">
          {submitting ? "Starting experiment..." : "Start batch experiment"}
        </button>
      </form>

      <details className="technical-details batch-details">
        <summary>What this experiment assumes</summary>
        <p>Errors are independent X, Y, or Z data-qubit errors. Syndrome measurements are perfect. A trial succeeds when the residual is empty or a stabilizer.</p>
      </details>
    </section>
  );
}

function ExperimentProgress({ experiment }: { experiment: Experiment }) {
  const { dispatch } = useConfiguration();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const percent = Math.round(experiment.progress.fraction * 100);

  async function stop() {
    setCancelling(true);
    setError(null);
    try {
      const updated = await cancelExperiment(experiment.id);
      dispatch({ type: "set-experiment", experiment: updated });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The experiment could not be stopped.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section className="panel batch-progress" aria-labelledby="batch-progress-heading" aria-live="polite">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Batch experiment</p>
          <h2 id="batch-progress-heading">{statusLabel(experiment)}</h2>
        </div>
        <span className="status-badge">{percent}%</span>
      </div>
      <progress max={experiment.progress.total_trials} value={experiment.progress.completed_trials}>
        {percent}%
      </progress>
      <div className="progress-caption">
        <span>{experiment.progress.completed_trials.toLocaleString()} of {experiment.progress.total_trials.toLocaleString()} trials</span>
        {experiment.progress.current_probability !== null && (
          <span>Current probability: {formatProbability(experiment.progress.current_probability)}</span>
        )}
      </div>
      <p className="section-intro">You can leave this stage while the experiment continues. Completed results are saved by the backend.</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="secondary-action batch-cancel" disabled={cancelling || experiment.status === "cancel_requested"} onClick={() => void stop()} type="button">
        {cancelling || experiment.status === "cancel_requested" ? "Stopping experiment..." : "Stop experiment"}
      </button>
    </section>
  );
}

function ErrorRateChart({ points }: { points: ProbabilityResult[] }) {
  const width = 760;
  const height = 320;
  const margin = { top: 24, right: 28, bottom: 54, left: 70 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xMax = Math.max(...points.map((point) => point.probability), 0.01);
  const yMax = Math.min(1, Math.max(...points.map((point) => point.confidence_interval[1]), 0.05) * 1.1);
  const x = (value: number) => margin.left + (value / xMax) * plotWidth;
  const y = (value: number) => margin.top + plotHeight - (value / yMax) * plotHeight;
  const polyline = points.map((point) => `${x(point.probability)},${y(point.logical_error_rate)}`).join(" ");
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((part) => part * yMax);
  const xTickStep = Math.max(1, Math.ceil(points.length / 6));
  const xTicks = points.filter((_, index) => index % xTickStep === 0 || index === points.length - 1);

  return (
    <div className="error-rate-chart-wrap">
      <svg
        aria-label="Logical-error rate by physical error probability with 95 percent confidence intervals"
        className="error-rate-chart"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line className="chart-grid" x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} />
            <text className="chart-tick" textAnchor="end" x={margin.left - 10} y={y(tick) + 4}>{formatPercent(tick)}</text>
          </g>
        ))}
        <line className="chart-axis" x1={margin.left} x2={margin.left} y1={margin.top} y2={height - margin.bottom} />
        <line className="chart-axis" x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} />
        {xTicks.map((point) => (
          <text className="chart-tick" key={point.probability} textAnchor="middle" x={x(point.probability)} y={height - margin.bottom + 22}>
            {formatProbability(point.probability)}
          </text>
        ))}
        <polyline className="chart-line" fill="none" points={polyline} />
        {points.map((point) => {
          const pointX = x(point.probability);
          const lowY = y(point.confidence_interval[0]);
          const highY = y(point.confidence_interval[1]);
          return (
            <g key={point.probability}>
              <line className="chart-interval" x1={pointX} x2={pointX} y1={highY} y2={lowY} />
              <line className="chart-interval" x1={pointX - 5} x2={pointX + 5} y1={highY} y2={highY} />
              <line className="chart-interval" x1={pointX - 5} x2={pointX + 5} y1={lowY} y2={lowY} />
              <circle className="chart-point" cx={pointX} cy={y(point.logical_error_rate)} r={5} />
            </g>
          );
        })}
        <text className="chart-label" textAnchor="middle" x={margin.left + plotWidth / 2} y={height - 10}>Physical error probability</text>
        <text className="chart-label" textAnchor="middle" transform={`rotate(-90 18 ${margin.top + plotHeight / 2})`} x={18} y={margin.top + plotHeight / 2}>Logical-error rate</text>
      </svg>
    </div>
  );
}

function ResultsTable({ points }: { points: ProbabilityResult[] }) {
  return (
    <div className="results-table-wrap" role="region" aria-label="Batch experiment values" tabIndex={0}>
      <table className="results-table">
        <thead>
          <tr>
            <th scope="col">Physical p</th>
            <th scope="col">Failures</th>
            <th scope="col">Logical-error rate</th>
            <th scope="col">95% interval</th>
            <th scope="col">Average decode time</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.probability}>
              <th scope="row">{formatProbability(point.probability)}</th>
              <td>{point.logical_failures} / {point.trials_completed}</td>
              <td>{formatPercent(point.logical_error_rate)}</td>
              <td>{formatPercent(point.confidence_interval[0])}–{formatPercent(point.confidence_interval[1])}</td>
              <td>{point.average_decode_time_ms.toLocaleString(undefined, { maximumFractionDigits: 2 })} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FailureCard({ sample, index }: { sample: FailureSample; index: number }) {
  return (
    <details className="failure-sample">
      <summary>
        <span>Failure {index + 1}</span>
        <span>p = {formatProbability(sample.probability)}, trial {sample.trial_number}</span>
      </summary>
      <dl>
        <div><dt>Replay seed</dt><dd>{sample.trial_seed}</dd></div>
        <div><dt>Generated error</dt><dd>{patternSummary(sample.error)}</dd></div>
        <div><dt>Decoder correction</dt><dd>{patternSummary(sample.correction)}</dd></div>
        <div><dt>Residual operation</dt><dd>{patternSummary(sample.residual)}</dd></div>
        <div><dt>Residual class</dt><dd>X: {sample.x_classification}; Z: {sample.z_classification}</dd></div>
      </dl>
    </details>
  );
}

function ExperimentResults({ experiment }: { experiment: Experiment }) {
  const { dispatch } = useConfiguration();
  const result = experiment.result;
  if (!result) {
    return (
      <section className="panel configure-error" role="alert">
        <p className="eyebrow">Experiment unavailable</p>
        <h2>No results were saved</h2>
        <p>{experiment.error_message ?? "Start a new run to try again."}</p>
        <button className="secondary-action" onClick={() => dispatch({ type: "set-experiment", experiment: null })} type="button">Set up another run</button>
      </section>
    );
  }

  const failures = result.points.reduce((sum, point) => sum + point.logical_failures, 0);
  const completed = result.total_trials_completed;

  return (
    <>
      <section className="panel batch-overview" aria-labelledby="batch-overview-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">{experiment.status === "cancelled" ? "Partial results" : "Completed experiment"}</p>
            <h2 id="batch-overview-heading">Logical-error rate by physical error probability</h2>
          </div>
          <span className={`status-badge ${experiment.status === "completed" ? "status-ready" : "status-warning"}`}>{statusLabel(experiment)}</span>
        </div>
        <p className="section-intro">Each marker is the observed failure rate. Vertical lines show the 95% Wilson interval, which communicates the uncertainty from a finite number of trials.</p>

        <div className="batch-metrics" aria-label="Experiment summary">
          <div><span>Completed trials</span><strong>{completed.toLocaleString()}</strong></div>
          <div><span>Probability points</span><strong>{result.points.length}</strong></div>
          <div><span>Logical failures</span><strong>{failures.toLocaleString()}</strong></div>
          <div><span>Runtime</span><strong>{result.runtime_seconds.toLocaleString(undefined, { maximumFractionDigits: 1 })} s</strong></div>
        </div>

        {result.points.length > 0 && <ErrorRateChart points={result.points} />}
        <div className="chart-key"><span className="key-point" aria-hidden="true" /> Observed rate <span className="key-interval" aria-hidden="true" /> 95% interval</div>
        <ResultsTable points={result.points} />

        <details className="technical-details batch-details">
          <summary>Simulation details</summary>
          <dl className="result-method-details">
            <div><dt>Decoder</dt><dd>{result.decoder_name}</dd></div>
            <div><dt>Error model</dt><dd>{result.error_model}</dd></div>
            <div><dt>Measurement model</dt><dd>{result.measurement_model}</dd></div>
            <div><dt>Success rule</dt><dd>{result.success_criterion}</dd></div>
            <div><dt>Batch seed</dt><dd>{result.batch_seed}</dd></div>
          </dl>
        </details>
      </section>

      <section className="panel failure-review" aria-labelledby="failure-review-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Failure review</p>
            <h2 id="failure-review-heading">Reproduce a logical failure</h2>
          </div>
          <span className="status-badge">{result.saved_failures.length} saved</span>
        </div>
        <p className="section-intro">The backend saves up to ten failed trials. Open one to inspect the error, correction, residual, and seed.</p>
        {result.saved_failures.length ? (
          <div className="failure-list">
            {result.saved_failures.map((sample, index) => <FailureCard index={index} key={`${sample.probability}-${sample.trial_number}`} sample={sample} />)}
          </div>
        ) : (
          <p className="empty-failures">No logical failures were observed in the completed trials.</p>
        )}
      </section>

      <button className="secondary-action new-batch-action" onClick={() => dispatch({ type: "set-experiment", experiment: null })} type="button">Set up another run</button>
    </>
  );
}

export function ResultsWorkspace({ code }: { code: CodeDetail }) {
  const { state, dispatch } = useConfiguration();
  const experiment = state.experiment;

  useEffect(() => {
    if (!experiment || !ACTIVE_STATUSES.has(experiment.status)) return;
    const controller = new AbortController();
    const experimentId = experiment.id;
    let timeout: number | undefined;

    async function poll() {
      try {
        const updated = await getExperiment(experimentId, controller.signal);
        dispatch({ type: "set-experiment", experiment: updated });
        if (ACTIVE_STATUSES.has(updated.status)) timeout = window.setTimeout(() => void poll(), 600);
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          timeout = window.setTimeout(() => void poll(), 1500);
        }
      }
    }

    timeout = window.setTimeout(() => void poll(), 400);
    return () => {
      controller.abort();
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [dispatch, experiment?.id, experiment?.status]);

  return (
    <div className="results-workspace">
      <button className="back-action" onClick={() => dispatch({ type: "open-decode" })} type="button">
        <span aria-hidden="true">←</span> Back to Decode
      </button>
      {!experiment && <ExperimentSetup code={code} />}
      {experiment && ACTIVE_STATUSES.has(experiment.status) && <ExperimentProgress experiment={experiment} />}
      {experiment && !ACTIVE_STATUSES.has(experiment.status) && <ExperimentResults experiment={experiment} />}
    </div>
  );
}
