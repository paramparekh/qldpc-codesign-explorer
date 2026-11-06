import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { CodeDetail } from "../api/codes";
import {
  cancelExperiment,
  createExperiment,
  getExperiment,
  experimentExportUrl,
  listExperiments,
  type Experiment,
  type FailureSample,
  type SimulationResult,
} from "../api/experiments";
import { createInjection, type Pauli } from "../api/injections";
import { useConfiguration } from "../state/configuration";
import { DecoderSelect, useDecoders } from "./DecoderSelect";

const ACTIVE_STATUSES = new Set(["queued", "running", "cancel_requested"]);

function formatPercent(value: number) {
  return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function formatProbability(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function parseProbabilities(value: string): number[] {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length)
    throw new Error("Enter at least one physical error probability.");
  if (parts.length > 25)
    throw new Error("Use no more than 25 probability points in one run.");
  const probabilities = parts.map(Number);
  if (probabilities.some((probability) => !Number.isFinite(probability))) {
    throw new Error("Enter probabilities as numbers separated by commas.");
  }
  if (
    probabilities.some((probability) => probability < 0 || probability > 0.5)
  ) {
    throw new Error("Each probability must be between 0 and 0.5.");
  }
  if (
    probabilities.some(
      (probability, index) =>
        index > 0 && probability <= probabilities[index - 1],
    )
  ) {
    throw new Error("Enter unique probabilities in increasing order.");
  }
  return probabilities;
}

function statusLabel(experiment: Experiment) {
  if (experiment.status === "queued") return "Waiting to start";
  if (experiment.status === "running") return "Running trials";
  if (experiment.status === "cancel_requested")
    return "Stopping after the current trial";
  if (experiment.status === "completed") return "Run complete";
  if (experiment.status === "cancelled") return "Run stopped";
  return "Run failed";
}

function patternSummary(pattern: Pauli[]) {
  const errors = pattern.flatMap((pauli, index) =>
    pauli === "I" ? [] : [`Q${index + 1}: ${pauli}`],
  );
  return errors.length ? errors.join(", ") : "No non-identity operations";
}

function ExperimentSetup({ code }: { code: CodeDetail }) {
  const { state, dispatch } = useConfiguration();
  const { decoders, error: decoderListError, retry } = useDecoders();
  const [decoderId, setDecoderId] = useState(state.decoderId);
  const [compare, setCompare] = useState(true);
  const [probabilityText, setProbabilityText] = useState(
    "0.02, 0.05, 0.08, 0.10, 0.15",
  );
  const [trials, setTrials] = useState(100);
  const [seed, setSeed] = useState(state.seed);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const preview = useMemo(() => {
    try {
      const probabilities = parseProbabilities(probabilityText);
      if (!Number.isInteger(trials) || trials < 1 || trials > 100_000)
        return null;
      return {
        points: probabilities.length,
        total: probabilities.length * trials,
      };
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
        throw new Error(
          "Trials per probability must be a whole number from 1 to 100,000.",
        );
      }
      if (
        !Number.isSafeInteger(seed) ||
        seed < 0 ||
        seed > Number.MAX_SAFE_INTEGER
      ) {
        throw new Error("The random seed must be a non-negative whole number.");
      }
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Check the experiment settings.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const experiment = await createExperiment({
        code_id: code.id,
        code_version: code.version,
        decoder_id: decoderId,
        comparison_decoder_id: compare
          ? decoders.find((decoder) => decoder.id !== decoderId)?.id
          : null,
        probabilities,
        trials_per_probability: trials,
        seed,
        confidence_level: 0.95,
        saved_failure_limit: 10,
      });
      dispatch({ type: "set-experiment", experiment });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The experiment could not be started.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="panel batch-setup"
      aria-labelledby="batch-setup-heading"
    >
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Experiment settings</p>
          <h2 id="batch-setup-heading">Compare several error probabilities</h2>
        </div>
        <span className="status-badge">95% interval</span>
      </div>
      <p className="section-intro">
        At each probability, the system generates new data-qubit errors, decodes
        them, and checks whether the logical information survives.
      </p>

      <form className="batch-form" onSubmit={submit} noValidate>
        <DecoderSelect
          value={decoderId}
          onChange={setDecoderId}
          decoders={decoders}
          disabled={submitting}
        />
        <label className="comparison-toggle">
          <input
            type="checkbox"
            checked={compare}
            disabled={submitting || decoders.length < 2}
            onChange={(event) => setCompare(event.target.checked)}
          />
          <span>
            Compare with{" "}
            {decoders.find((decoder) => decoder.id !== decoderId)?.name ??
              "the other decoder"}{" "}
            on identical errors
          </span>
        </label>
        <label className="batch-field batch-probabilities">
          <span>Physical error probabilities</span>
          <input
            aria-describedby="probability-help"
            disabled={submitting}
            onChange={(event) => setProbabilityText(event.target.value)}
            spellCheck={false}
            type="text"
            value={probabilityText}
          />
          <small id="probability-help">
            Enter increasing values from 0 to 0.5, separated by commas.
          </small>
        </label>

        <label className="batch-field">
          <span>Trials per probability</span>
          <input
            max={100000}
            disabled={submitting}
            min={1}
            onChange={(event) => setTrials(event.target.valueAsNumber)}
            step={1}
            type="number"
            value={Number.isNaN(trials) ? "" : trials}
          />
          <small>More trials reduce uncertainty but take longer.</small>
        </label>

        <label className="batch-field">
          <span>Random seed</span>
          <input
            min={0}
            disabled={submitting}
            onChange={(event) => setSeed(event.target.valueAsNumber)}
            step={1}
            type="number"
            value={Number.isNaN(seed) ? "" : seed}
          />
          <small>Use the same seed and settings to repeat this run.</small>
        </label>

        <div className="batch-run-summary" aria-live="polite">
          <div>
            <span>Code</span>
            <strong>{code.name}</strong>
          </div>
          <div>
            <span>Decoder</span>
            <strong>
              {decoders.find((decoder) => decoder.id === decoderId)?.name ??
                "Loading…"}
              {compare ? " + comparison" : ""}
            </strong>
          </div>
          <div>
            <span>Planned work</span>
            <strong>
              {preview
                ? `${preview.total.toLocaleString()} trials across ${preview.points} points`
                : "Check probabilities and trial count"}
            </strong>
          </div>
        </div>

        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {decoderListError && (
          <div className="inline-error" role="alert">
            <p>{decoderListError}</p>
            <button type="button" className="secondary-action" onClick={retry}>
              Reload decoders
            </button>
          </div>
        )}
        <button
          className="primary-action batch-start"
          disabled={submitting || !preview || !decoders.length}
          type="submit"
        >
          {submitting ? "Starting experiment..." : "Start batch experiment"}
        </button>
      </form>

      <details className="technical-details batch-details">
        <summary>What this experiment assumes</summary>
        <p>
          Each qubit independently has an error with probability p; X, Y, and Z
          are equally likely given an error. Syndrome measurements are perfect.
          A trial succeeds when the residual is empty or a stabilizer.
          Comparisons share every error sample and seed. BP+OSD uses component
          priors of 2p/3.
        </p>
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
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The experiment could not be stopped.",
      );
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section
      className="panel batch-progress"
      aria-labelledby="batch-progress-heading"
      aria-live="polite"
    >
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Batch experiment</p>
          <h2 id="batch-progress-heading">{statusLabel(experiment)}</h2>
        </div>
        <span className="status-badge">{percent}%</span>
      </div>
      <progress
        max={experiment.progress.total_trials}
        value={experiment.progress.completed_trials}
      >
        {percent}%
      </progress>
      <div className="progress-caption">
        <span>
          {experiment.progress.completed_trials.toLocaleString()} of{" "}
          {experiment.progress.total_trials.toLocaleString()} trials
        </span>
        {experiment.progress.current_probability !== null && (
          <span>
            Current probability:{" "}
            {formatProbability(experiment.progress.current_probability)}
          </span>
        )}
      </div>
      <p className="section-intro">
        {experiment.execution_mode === "request_chunks"
          ? "Keep this page open while trials run. Closing it pauses the experiment; reopen it from saved runs to resume. Completed batches are saved automatically."
          : "You can leave this stage while the experiment continues. Completed results are saved by the backend."}
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="secondary-action batch-cancel"
        disabled={cancelling || experiment.status === "cancel_requested"}
        onClick={() => void stop()}
        type="button"
      >
        {cancelling || experiment.status === "cancel_requested"
          ? "Stopping experiment..."
          : "Stop experiment"}
      </button>
    </section>
  );
}

function ErrorRateChart({ series }: { series: SimulationResult[] }) {
  const points = series.flatMap((entry) => entry.points);
  const confidence = formatPercent(points[0]?.confidence_level ?? 0.95);
  const width = 760;
  const height = 320;
  const margin = { top: 24, right: 28, bottom: 54, left: 70 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xMax = Math.max(...points.map((point) => point.probability), 0.01);
  const yMax = Math.min(
    1,
    Math.max(...points.map((point) => point.confidence_interval[1]), 0.05) *
      1.1,
  );
  const x = (value: number) => margin.left + (value / xMax) * plotWidth;
  const y = (value: number) =>
    margin.top + plotHeight - (value / yMax) * plotHeight;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((part) => part * yMax);
  const uniquePoints = series[0].points;
  const xTickStep = Math.max(1, Math.ceil(uniquePoints.length / 6));
  const xTicks = uniquePoints.filter(
    (_, index) => index % xTickStep === 0 || index === uniquePoints.length - 1,
  );

  return (
    <div className="error-rate-chart-wrap" role="region" aria-label="Scrollable decoder comparison chart" tabIndex={0}>
      <svg
        aria-label={`Logical-error rate by physical error probability with ${confidence} Wilson confidence intervals for ${series.map((entry) => entry.decoder_name).join(" and ")}`}
        className="error-rate-chart"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              className="chart-grid"
              x1={margin.left}
              x2={width - margin.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text
              className="chart-tick"
              textAnchor="end"
              x={margin.left - 10}
              y={y(tick) + 4}
            >
              {formatPercent(tick)}
            </text>
          </g>
        ))}
        <line
          className="chart-axis"
          x1={margin.left}
          x2={margin.left}
          y1={margin.top}
          y2={height - margin.bottom}
        />
        <line
          className="chart-axis"
          x1={margin.left}
          x2={width - margin.right}
          y1={height - margin.bottom}
          y2={height - margin.bottom}
        />
        {xTicks.map((point) => (
          <text
            className="chart-tick"
            key={point.probability}
            textAnchor="middle"
            x={x(point.probability)}
            y={height - margin.bottom + 22}
          >
            {formatProbability(point.probability)}
          </text>
        ))}
        {series.map((entry, seriesIndex) => (
          <g
            key={entry.decoder_id}
            className={seriesIndex ? "chart-secondary" : "chart-primary"}
          >
            <polyline
              className="chart-line"
              fill="none"
              points={entry.points
                .map(
                  (point) =>
                    `${x(point.probability)},${y(point.logical_error_rate)}`,
                )
                .join(" ")}
            />
            {entry.points.map((point) => {
              const pointX = x(point.probability);
              const lowY = y(point.confidence_interval[0]);
              const highY = y(point.confidence_interval[1]);
              return (
                <g key={point.probability}>
                  <title>
                    {entry.decoder_name}: p = {point.probability}; logical-error
                    rate {formatPercent(point.logical_error_rate)}; {confidence}{" "}
                    interval {formatPercent(point.confidence_interval[0])} to{" "}
                    {formatPercent(point.confidence_interval[1])}
                  </title>
                  <line
                    className="chart-interval"
                    x1={pointX}
                    x2={pointX}
                    y1={highY}
                    y2={lowY}
                  />
                  <line
                    className="chart-interval"
                    x1={pointX - 5}
                    x2={pointX + 5}
                    y1={highY}
                    y2={highY}
                  />
                  <line
                    className="chart-interval"
                    x1={pointX - 5}
                    x2={pointX + 5}
                    y1={lowY}
                    y2={lowY}
                  />
                  {seriesIndex ? (
                    <rect
                      className="chart-point"
                      x={pointX - 4}
                      y={y(point.logical_error_rate) - 4}
                      width={8}
                      height={8}
                    />
                  ) : (
                    <circle
                      className="chart-point"
                      cx={pointX}
                      cy={y(point.logical_error_rate)}
                      r={5}
                    />
                  )}
                </g>
              );
            })}
          </g>
        ))}
        <text
          className="chart-label"
          textAnchor="middle"
          x={margin.left + plotWidth / 2}
          y={height - 10}
        >
          Physical error probability
        </text>
        <text
          className="chart-label"
          textAnchor="middle"
          transform={`rotate(-90 18 ${margin.top + plotHeight / 2})`}
          x={18}
          y={margin.top + plotHeight / 2}
        >
          Logical-error rate
        </text>
      </svg>
    </div>
  );
}

function ResultsTable({ series }: { series: SimulationResult[] }) {
  return (
    <div
      className="results-table-wrap"
      role="region"
      aria-label="Batch experiment values"
      tabIndex={0}
    >
      <table className="results-table">
        <thead>
          <tr>
            <th scope="col">Decoder</th>
            <th scope="col">Physical p</th>
            <th scope="col">Failures</th>
            <th scope="col">Logical-error rate</th>
            <th scope="col">Wilson interval</th>
            <th scope="col">Average decode time</th>
          </tr>
        </thead>
        <tbody>
          {series.flatMap((entry) =>
            entry.points.map((point) => (
              <tr key={`${entry.decoder_id}-${point.probability}`}>
                <td>{entry.decoder_name}</td>
                <th scope="row">{formatProbability(point.probability)}</th>
                <td>
                  {point.logical_failures} / {point.trials_completed}
                </td>
                <td>{formatPercent(point.logical_error_rate)}</td>
                <td>
                  {formatPercent(point.confidence_interval[0])}–
                  {formatPercent(point.confidence_interval[1])} (
                  {formatPercent(point.confidence_level)})
                </td>
                <td>
                  {point.average_decode_time_ms.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{" "}
                  ms
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

function InspectErrorButton({
  error,
  probability,
  decoderId,
}: {
  error: Pauli[];
  probability: number;
  decoderId: string;
}) {
  const { state, dispatch } = useConfiguration();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  async function inspect() {
    if (!state.code) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await createInjection({
        code_id: state.code.id,
        mode: "manual_pauli",
        errors: error.flatMap((pauli, index) =>
          pauli === "I" ? [] : [{ qubit: index + 1, pauli }],
        ),
      });
      dispatch({ type: "inspect-error", result, decoderId, probability });
    } catch (reason) {
      setFailure(
        reason instanceof Error
          ? reason.message
          : "The saved error could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="inspect-error-action">
      <button
        className="secondary-action"
        disabled={busy}
        type="button"
        onClick={() => void inspect()}
      >
        {busy ? "Opening saved error…" : "Inspect this error in Observe"}
      </button>
      {failure && (
        <p role="alert" className="inline-error">
          {failure}
        </p>
      )}
    </div>
  );
}

function FailureCard({
  sample,
  index,
  decoderId,
}: {
  sample: FailureSample;
  index: number;
  decoderId: string;
}) {
  return (
    <details className="failure-sample">
      <summary>
        <span>Failure {index + 1}</span>
        <span>
          p = {formatProbability(sample.probability)}, trial{" "}
          {sample.trial_number}
        </span>
      </summary>
      <dl>
        <div>
          <dt>Replay seed</dt>
          <dd>{sample.trial_seed}</dd>
        </div>
        <div>
          <dt>Generated error</dt>
          <dd>{patternSummary(sample.error)}</dd>
        </div>
        <div>
          <dt>Decoder correction</dt>
          <dd>{patternSummary(sample.correction)}</dd>
        </div>
        <div>
          <dt>Residual operation</dt>
          <dd>{patternSummary(sample.residual)}</dd>
        </div>
        <div>
          <dt>Residual class</dt>
          <dd>
            X: {sample.x_classification}; Z: {sample.z_classification}
          </dd>
        </div>
      </dl>
      <InspectErrorButton
        error={sample.error}
        probability={sample.probability}
        decoderId={decoderId}
      />
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
        <button
          className="secondary-action"
          onClick={() => dispatch({ type: "set-experiment", experiment: null })}
          type="button"
        >
          Set up another run
        </button>
      </section>
    );
  }

  const failures = result.points.reduce(
    (sum, point) => sum + point.logical_failures,
    0,
  );
  const completed = result.total_trials_completed;
  const series = [result, ...(result.comparison ? [result.comparison] : [])];
  const confidence = formatPercent(experiment.config.confidence_level);

  return (
    <>
      <section
        className="panel batch-overview"
        aria-labelledby="batch-overview-heading"
      >
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">
              {experiment.status === "cancelled"
                ? "Partial results"
                : "Completed experiment"}
            </p>
            <h2 id="batch-overview-heading">
              Logical-error rate by physical error probability
            </h2>
          </div>
          <span
            className={`status-badge ${experiment.status === "completed" ? "status-ready" : "status-warning"}`}
          >
            {statusLabel(experiment)}
          </span>
        </div>
        <p className="section-intro">
          Each marker is the observed failure rate. Vertical lines show the{" "}
          {confidence} Wilson interval, which communicates the uncertainty from
          a finite number of trials.{" "}
          {result.comparison &&
            "Both decoders received exactly the same error patterns."}
        </p>

        <div className="batch-metrics" aria-label="Experiment summary">
          <div>
            <span>Completed trials</span>
            <strong>{completed.toLocaleString()}</strong>
          </div>
          <div>
            <span>Probability points</span>
            <strong>{result.points.length}</strong>
          </div>
          <div>
            <span>Primary logical failures</span>
            <strong>{failures.toLocaleString()}</strong>
          </div>
          <div>
            <span>Runtime</span>
            <strong>
              {result.runtime_seconds.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}{" "}
              s
            </strong>
          </div>
        </div>

        {result.points.length > 0 ? (
          <ErrorRateChart series={series} />
        ) : (
          <p className="neutral-note">
            The run stopped before any trials completed. Start another run to
            collect results.
          </p>
        )}
        <div className="chart-key">
          {series.map((entry, index) => (
            <span key={entry.decoder_id}>
              <span
                aria-hidden="true"
                className={`legend-symbol ${index ? "legend-secondary" : ""}`}
              >
                {index ? "■ ┄" : "● ━"}
              </span>{" "}
              {entry.decoder_name}
            </span>
          ))}
          <span>Vertical bars: {confidence} interval</span>
        </div>
        <ResultsTable series={series} />
        <p className="scroll-hint">Swipe or scroll horizontally inside the chart and tables to see all values. Keyboard users can focus a chart or table and use the arrow keys.</p>
        <p className="scope-note">
          These are results for one 13-qubit code with perfect measurements.
          Zero observed failures still has uncertainty. Timing includes decoder
          construction and correction verification on this computer; it varies
          between runs. Comparing interval overlap alone does not establish a
          significant difference.
        </p>
        <div
          className="export-actions"
          aria-label="Download experiment results"
        >
          <a
            className="secondary-action"
            href={experimentExportUrl(experiment.id, "json")}
            download
          >
            Download JSON
          </a>
          <a
            className="secondary-action"
            href={experimentExportUrl(experiment.id, "csv")}
            download
          >
            Download CSV
          </a>
        </div>

        <details className="technical-details batch-details">
          <summary>Simulation details</summary>
          <dl className="result-method-details">
            <div>
              <dt>Code version</dt>
              <dd>
                {result.code_id} / {result.code_version}
              </dd>
            </div>
            <div>
              <dt>Primary decoder</dt>
              <dd>{result.decoder_name}</dd>
            </div>
            {result.comparison && (
              <div>
                <dt>Comparison decoder</dt>
                <dd>{result.comparison.decoder_name}</dd>
              </div>
            )}
            <div>
              <dt>Error model</dt>
              <dd>{result.error_model}</dd>
            </div>
            <div>
              <dt>Measurement model</dt>
              <dd>{result.measurement_model}</dd>
            </div>
            <div>
              <dt>Success rule</dt>
              <dd>{result.success_criterion}</dd>
            </div>
            <div>
              <dt>Batch seed</dt>
              <dd>{result.batch_seed}</dd>
            </div>
            <div>
              <dt>Error generator</dt>
              <dd>{result.error_generator_version}</dd>
            </div>
            <div>
              <dt>Trial seed derivation</dt>
              <dd>{result.batch_generator_version}</dd>
            </div>
          </dl>
          {series.map((entry) => (
            <div key={entry.decoder_id}>
              <h3>{entry.decoder_name} settings</h3>
              <dl className="result-method-details">
                {Object.entries(entry.decoder_settings ?? {}).map(
                  ([key, value]) => (
                    <div key={key}>
                      <dt>{key.replaceAll("_", " ")}</dt>
                      <dd>{value}</dd>
                    </div>
                  ),
                )}
              </dl>
            </div>
          ))}
        </details>
      </section>

      {result.comparison && (
        <section className="panel" aria-labelledby="paired-heading">
          <p className="eyebrow">Same errors, two decoders</p>
          <h2 id="paired-heading">Where decoder outcomes differ</h2>
          <p className="section-intro">
            Primary: {result.decoder_name}. Comparison:{" "}
            {result.comparison.decoder_name}. Different corrections can preserve
            the same logical state.
          </p>
          <div
            className="results-table-wrap"
            role="region"
            aria-label="Paired decoder outcomes"
            tabIndex={0}
          >
            <table className="results-table">
              <thead>
                <tr>
                  <th scope="col">Physical p</th>
                  <th scope="col">Both succeed</th>
                  <th scope="col">Primary only succeeds</th>
                  <th scope="col">Comparison only succeeds</th>
                  <th scope="col">Both fail</th>
                  <th scope="col">Different corrections</th>
                </tr>
              </thead>
              <tbody>
                {result.paired_outcomes?.map((point) => (
                  <tr key={point.probability}>
                    <th scope="row">{formatProbability(point.probability)}</th>
                    <td>{point.both_succeed}</td>
                    <td>{point.primary_only_succeeds}</td>
                    <td>{point.comparison_only_succeeds}</td>
                    <td>{point.both_fail}</td>
                    <td>{point.different_corrections}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.disagreements?.length ? (
            result.disagreements.map((sample) => (
              <details
                className="failure-sample"
                key={`${sample.probability}-${sample.trial_number}`}
              >
                <summary>
                  Different outcomes at p = {sample.probability}, trial{" "}
                  {sample.trial_number}
                </summary>
                <dl>
                  <div>
                    <dt>Replay seed</dt>
                    <dd>{sample.trial_seed}</dd>
                  </div>
                  <div>
                    <dt>Error</dt>
                    <dd>{patternSummary(sample.error)}</dd>
                  </div>
                  <div>
                    <dt>{result.decoder_name}</dt>
                    <dd>
                      {sample.primary_success ? "Success" : "Logical failure"}:{" "}
                      {patternSummary(sample.primary_correction)}
                    </dd>
                  </div>
                  <div>
                    <dt>{result.comparison!.decoder_name}</dt>
                    <dd>
                      {sample.comparison_success
                        ? "Success"
                        : "Logical failure"}
                      : {patternSummary(sample.comparison_correction)}
                    </dd>
                  </div>
                </dl>
                <InspectErrorButton
                  error={sample.error}
                  probability={sample.probability}
                  decoderId={result.decoder_id}
                />
              </details>
            ))
          ) : (
            <p className="neutral-note">
              No trials with different logical outcomes were observed in this
              run.
            </p>
          )}
        </section>
      )}

      <section
        className="panel failure-review"
        aria-labelledby="failure-review-heading"
      >
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Failure review</p>
            <h2 id="failure-review-heading">Reproduce a logical failure</h2>
          </div>
          <span className="status-badge">
            {series.reduce((count, entry) => count + entry.saved_failures.length, 0)} saved
          </span>
        </div>
        <p className="section-intro">
          Open a saved trial to inspect its error, correction, residual, and
          exact seed, or trace it through Observe and Decode.
        </p>
        {series.map((entry) => (
          <div key={entry.decoder_id}>
            <h3>{entry.decoder_name}</h3>
            {entry.saved_failures.length ? (
              <div className="failure-list">
                {entry.saved_failures.map((sample, index) => (
                  <FailureCard
                    index={index}
                    decoderId={entry.decoder_id}
                    key={`${sample.probability}-${sample.trial_number}`}
                    sample={sample}
                  />
                ))}
              </div>
            ) : (
              <p className="empty-failures">
                {completed
                  ? "No logical failures were observed in the completed trials."
                  : "No trials completed."}
              </p>
            )}
          </div>
        ))}
      </section>

      <button
        className="secondary-action new-batch-action"
        onClick={() => dispatch({ type: "set-experiment", experiment: null })}
        type="button"
      >
        Set up another run
      </button>
    </>
  );
}

function SavedExperiments({ code }: { code: CodeDetail }) {
  const { dispatch } = useConfiguration();
  const [runs, setRuns] = useState<Experiment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void listExperiments(controller.signal)
      .then((items) =>
        setRuns(
          items.filter(
            (run) =>
              run.config.code_id === code.id &&
              run.config.code_version === code.version,
          ),
        ),
      )
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load saved runs.",
          );
      });
    return () => controller.abort();
  }, [code.id, code.version, attempt]);
  return (
    <section
      className="panel saved-experiments"
      aria-labelledby="saved-experiments-heading"
    >
      <p className="eyebrow">Experiment history</p>
      <h2 id="saved-experiments-heading">Reopen a saved run</h2>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            className="secondary-action"
            onClick={() => setAttempt((value) => value + 1)}
            type="button"
          >
            Reload saved runs
          </button>
        </div>
      )}
      {!runs.length && !error && (
        <p className="section-intro">
          Saved runs for this code will appear here.
        </p>
      )}
      <div className="saved-run-list">
        {runs.map((run) => (
          <button
            className="secondary-action"
            key={run.id}
            type="button"
            onClick={() =>
              dispatch({ type: "set-experiment", experiment: run })
            }
          >
            <span>
              {new Date(run.created_at).toLocaleString()} · seed{" "}
              {run.config.seed}
            </span>
            <span>
              {run.config.comparison_decoder_id
                ? "Decoder comparison"
                : "Single decoder"}{" "}
              · {statusLabel(run)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ResultsWorkspace({ code }: { code: CodeDetail }) {
  const { state, dispatch } = useConfiguration();
  const experiment = state.experiment;
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    if (!experiment || !ACTIVE_STATUSES.has(experiment.status)) return;
    const controller = new AbortController();
    const experimentId = experiment.id;
    let timeout: number | undefined;

    async function poll() {
      try {
        const updated = await getExperiment(experimentId, controller.signal);
        setPollError(null);
        dispatch({ type: "set-experiment", experiment: updated });
        if (ACTIVE_STATUSES.has(updated.status))
          timeout = window.setTimeout(() => void poll(), 600);
      } catch (requestError) {
        if (!(
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        )) {
          setPollError(
            "Connection lost. Retrying automatically; the backend may still be running this experiment.",
          );
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
      <button
        className="back-action"
        onClick={() => dispatch({ type: "open-decode" })}
        type="button"
      >
        <span aria-hidden="true">←</span> Back to Decode
      </button>
      {!experiment && <ExperimentSetup code={code} />}
      {!experiment && <SavedExperiments code={code} />}
      {pollError && experiment && ACTIVE_STATUSES.has(experiment.status) && (
        <p className="inline-error" role="alert">
          {pollError}
        </p>
      )}
      {experiment && ACTIVE_STATUSES.has(experiment.status) && (
        <ExperimentProgress experiment={experiment} />
      )}
      {experiment && !ACTIVE_STATUSES.has(experiment.status) && (
        <ExperimentResults experiment={experiment} />
      )}
    </div>
  );
}
