import { useCallback, useEffect, useState } from "react";

import type { CodeDetail } from "../api/codes";
import { createObservation, type CheckGroup, type ObservationResult } from "../api/observations";
import { useConfiguration, type StoredInjection } from "../state/configuration";
import { QubitPattern } from "./QubitPattern";

type RequestState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; result: ObservationResult };

function qubitList(qubits: number[]) {
  return qubits.length ? qubits.map((qubit) => `Q${qubit}`).join(", ") : "None";
}

function CheckGroupPanel({ title, group }: { title: string; group: CheckGroup }) {
  return (
    <section className="panel check-group-panel" aria-labelledby={`${group.matrix}-heading`}>
      <div className="check-group-heading">
        <div>
          <p className="eyebrow">{group.matrix}</p>
          <h2 id={`${group.matrix}-heading`}>{title}</h2>
          <p>Detects {group.detects.toLowerCase()}.</p>
        </div>
        <span className="signal-count">{group.triggered_count} with signal</span>
      </div>

      <div className="syndrome-vector" aria-label={`${title} syndrome ${group.syndrome.join(" ")}`}>
        <span>Syndrome</span>
        <div aria-hidden="true">
          {group.syndrome.map((value, index) => (
            <strong className={value ? "bit-on" : ""} key={`${group.matrix}-${index}`}>{value}</strong>
          ))}
        </div>
      </div>

      <ol className="check-result-list">
        {group.checks.map((check) => (
          <li className={check.result ? "check-triggered" : ""} key={check.id}>
            <div className="check-result-title">
              <strong>{check.id}</strong>
              <span>{check.result ? "Signal" : "No signal"}</span>
            </div>
            <dl>
              <div><dt>Checks qubits</dt><dd>{qubitList(check.support)}</dd></div>
              <div><dt>Relevant errors</dt><dd>{qubitList(check.error_qubits)}</dd></div>
            </dl>
            {check.error_qubits.length > 0 && check.result === 0 && (
              <p>An even number of relevant error parts gives no signal.</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ObservationView({
  code,
  injection,
  result,
}: {
  code: CodeDetail;
  injection: StoredInjection;
  result: ObservationResult;
}) {
  const { dispatch } = useConfiguration();
  const noSignal = result.total_triggered === 0;

  return (
    <>
      <section className="panel observation-overview" aria-labelledby="observation-overview-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Saved errors</p>
            <h2 id="observation-overview-heading">Error being observed</h2>
          </div>
          <span className="status-badge status-ready">Calculated</span>
        </div>
        <p className="section-intro">
          Each check returns 1 when it overlaps an odd number of error parts that it can detect.
        </p>
        <QubitPattern paulis={injection.qubits} vertexPairCount={code.qubit_partition.vertex_vertex} />
        <div className="observation-guide" aria-label="How to read the check results">
          <div><strong>X-type checks</strong><span>detect the Z part of Z and Y errors</span></div>
          <div><strong>Z-type checks</strong><span>detect the X part of X and Y errors</span></div>
          <div><strong>Result 1</strong><span>means the check detected odd parity</span></div>
        </div>
      </section>

      <div className="check-groups">
        <CheckGroupPanel group={result.x_checks} title="X-type checks" />
        <CheckGroupPanel group={result.z_checks} title="Z-type checks" />
      </div>

      <section className="panel observation-summary" aria-labelledby="observation-summary-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Result</p>
            <h2 id="observation-summary-heading">Observation summary</h2>
          </div>
          <span className="status-badge status-ready">Complete</span>
        </div>
        <div className="observation-metrics">
          <div><span>Errors</span><strong>{result.error_weight}</strong></div>
          <div><span>X-type signals</span><strong>{result.x_checks.triggered_count}</strong></div>
          <div><span>Z-type signals</span><strong>{result.z_checks.triggered_count}</strong></div>
          <div><span>Total signals</span><strong>{result.total_triggered}</strong></div>
        </div>
        <div className={`observation-meaning ${noSignal ? "meaning-neutral" : ""}`}>
          <strong>{noSignal ? "No checks produced a signal" : "The code detected the errors"}</strong>
          <p>
            {noSignal
              ? result.error_weight === 0
                ? "This is expected because no error was added."
                : "A zero syndrome can also occur for a stabilizer or an undetectable logical error."
              : "The syndrome shows which checks detected a problem. It does not yet choose a correction."}
          </p>
        </div>
        <div className="next-stage-row">
          <div>
            <strong>Next: Decode</strong>
            <p>Use this syndrome to choose and evaluate a correction.</p>
          </div>
          <button className="primary-action" onClick={() => dispatch({ type: "open-decode" })} type="button">
            Continue to Decode
          </button>
        </div>
        <button className="secondary-action" onClick={() => dispatch({ type: "open-inject" })} type="button">
          Back to error selection
        </button>
      </section>
    </>
  );
}

export function ObserveWorkspace({ code, injection }: { code: CodeDetail; injection: StoredInjection }) {
  const { state, dispatch } = useConfiguration();
  const [request, setRequest] = useState<RequestState>(
    state.observation ? { phase: "ready", result: state.observation } : { phase: "loading" },
  );

  const loadObservation = useCallback(async (signal?: AbortSignal) => {
    setRequest({ phase: "loading" });
    try {
      const result = await createObservation(
        { code_id: code.id, code_version: injection.code_version, qubits: injection.qubits },
        signal,
      );
      dispatch({ type: "set-observation", result });
      setRequest({ phase: "ready", result });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRequest({
        phase: "error",
        message: error instanceof Error ? error.message : "The syndrome could not be calculated.",
      });
    }
  }, [code.id, dispatch, injection.code_version, injection.qubits]);

  useEffect(() => {
    if (state.observation) {
      setRequest({ phase: "ready", result: state.observation });
      return;
    }
    const controller = new AbortController();
    void loadObservation(controller.signal);
    return () => controller.abort();
  }, [loadObservation, state.observation]);

  return (
    <div className="observe-workspace">
      <button className="back-action" onClick={() => dispatch({ type: "open-inject" })} type="button">
        <span aria-hidden="true">←</span> Back to error selection
      </button>

      {request.phase === "loading" && (
        <section className="panel observe-loading" aria-live="polite">
          <span className="loading-dot" aria-hidden="true" />
          <div><h2>Calculating the syndrome</h2><p>Checking the saved errors against each code check.</p></div>
        </section>
      )}

      {request.phase === "error" && (
        <section className="panel configure-error" role="alert">
          <p className="eyebrow">Observation unavailable</p>
          <h2>The syndrome could not be calculated</h2>
          <p>{request.message}</p>
          <button className="secondary-action" onClick={() => void loadObservation()} type="button">Try again</button>
        </section>
      )}

      {request.phase === "ready" && (
        <ObservationView code={code} injection={injection} result={request.result} />
      )}
    </div>
  );
}
