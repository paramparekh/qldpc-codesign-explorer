import { useCallback, useEffect, useState } from "react";

import type { CodeDetail } from "../api/codes";
import {
  decodeError,
  type ComponentDecode,
  type DecodeResult,
  type PauliPattern,
} from "../api/decoders";
import type { Pauli } from "../api/injections";
import { useConfiguration, type StoredInjection } from "../state/configuration";

type RequestState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; result: DecodeResult };

function formatSupport(support: number[]) {
  return support.length ? support.map((qubit) => `Q${qubit}`).join(", ") : "None";
}

function classificationLabel(value: "none" | "stabilizer" | "logical") {
  if (value === "none") return "No residual";
  if (value === "stabilizer") return "Stabilizer — logical state preserved";
  return "Logical operation — decoding failed";
}

function PatternRow({
  label,
  values,
  dividerAfter,
}: {
  label: string;
  values: Pauli[];
  dividerAfter: number;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {values.map((pauli, index) => (
        <td className={index + 1 === dividerAfter ? "group-divider" : ""} key={`${label}-${index}`}>
          <span aria-label={`${label}, qubit ${index + 1}: ${pauli}`} className={`pauli-value pauli-${pauli.toLowerCase()}`}>
            {pauli}
          </span>
        </td>
      ))}
    </tr>
  );
}

function DecodeComparison({ code, result }: { code: CodeDetail; result: DecodeResult }) {
  return (
    <section className="panel decode-comparison" aria-labelledby="decode-comparison-heading">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Apply correction</p>
          <h2 id="decode-comparison-heading">Error, correction, and residual</h2>
        </div>
        <span className="status-badge">Q1–Q{code.parameters.n}</span>
      </div>
      <p className="section-intro">
        The residual is what remains after combining the original error with the correction. I means no operation remains on that qubit.
      </p>
      <div className="decode-table-wrap" role="region" aria-label="Error correction comparison" tabIndex={0}>
        <table className="decode-table">
          <thead>
            <tr>
              <th scope="col">Step</th>
              {result.original.qubits.map((_, index) => (
                <th className={index + 1 === code.qubit_partition.vertex_vertex ? "group-divider" : ""} key={index} scope="col">
                  Q{index + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <PatternRow label="Original error" values={result.original.qubits} dividerAfter={code.qubit_partition.vertex_vertex} />
            <PatternRow label="Correction" values={result.correction.qubits} dividerAfter={code.qubit_partition.vertex_vertex} />
            <PatternRow label="Residual" values={result.residual.qubits} dividerAfter={code.qubit_partition.vertex_vertex} />
          </tbody>
        </table>
      </div>
      <div className="qubit-group-key">
        <span>Q1–Q{code.qubit_partition.vertex_vertex}: Qubit group A</span>
        <span>Q{code.qubit_partition.vertex_vertex + 1}–Q{code.parameters.n}: Qubit group B</span>
      </div>
    </section>
  );
}

function ComponentDecision({ result }: { result: ComponentDecode }) {
  const tied = result.minimum_candidate_count > 1;
  return (
    <section className="component-decision" aria-labelledby={`${result.component}-decision-heading`}>
      <div>
        <p className="eyebrow">{result.syndrome_source}</p>
        <h3 id={`${result.component}-decision-heading`}>{result.component}-component correction</h3>
      </div>
      <div className="component-syndrome" aria-label={`${result.component} component syndrome ${result.syndrome.join(" ")}`}>
        {result.syndrome.map((value, index) => <span className={value ? "bit-on" : ""} key={index}>{value}</span>)}
      </div>
      <dl>
        <div><dt>Chosen qubits</dt><dd>{formatSupport(result.correction_support)}</dd></div>
        <div><dt>Component weight</dt><dd>{result.correction_weight}</dd></div>
        <div><dt>Lightest choices</dt><dd>{result.minimum_candidate_count}</dd></div>
      </dl>
      {tied && <p className="tie-note">Several corrections have the same minimum weight. The decoder uses one fixed choice so the result can be repeated.</p>}
    </section>
  );
}

function DecodeView({ code, result }: { code: CodeDetail; result: DecodeResult }) {
  const residualSignals =
    result.residual.x_check_syndrome.reduce((sum, value) => sum + value, 0) +
    result.residual.z_check_syndrome.reduce((sum, value) => sum + value, 0);

  return (
    <>
      <section className="panel decoder-method" aria-labelledby="decoder-method-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Decoder</p>
            <h2 id="decoder-method-heading">{result.decoder.name}</h2>
          </div>
          <span className="status-badge status-ready">Exact for 13 qubits</span>
        </div>
        <p className="section-intro">{result.decoder.method}</p>
        <p className="scope-note">
          This decoder checks every possible binary correction for this small code. Larger qLDPC codes will need a scalable decoder.
        </p>
      </section>

      <section className="panel component-decisions" aria-labelledby="component-decisions-heading">
        <p className="eyebrow">Decoder choices</p>
        <h2 id="component-decisions-heading">How the correction was selected</h2>
        <p className="section-intro">
          X and Z components are decoded separately using the checks that detect them. A Y correction belongs to both components but counts as one corrected qubit.
        </p>
        <div className="component-decision-grid">
          <ComponentDecision result={result.x_component} />
          <ComponentDecision result={result.z_component} />
        </div>
      </section>

      <DecodeComparison code={code} result={result} />

      <section
        className={`panel decode-outcome ${result.success ? "decode-success" : "decode-failure"}`}
        aria-labelledby="decode-outcome-heading"
      >
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Final result</p>
            <h2 id="decode-outcome-heading">
              {result.success ? "Logical information preserved" : "Logical decoding failure"}
            </h2>
          </div>
          <span className={`status-badge ${result.success ? "status-ready" : "status-warning"}`}>
            {result.success ? "Success" : "Failure"}
          </span>
        </div>

        <div className="decode-metrics">
          <div><span>Error weight</span><strong>{result.original.weight}</strong></div>
          <div><span>Correction weight</span><strong>{result.correction.weight}</strong></div>
          <div><span>Residual weight</span><strong>{result.residual.weight}</strong></div>
          <div><span>Residual signals</span><strong>{residualSignals}</strong></div>
        </div>

        <div className="outcome-message" role="status">
          <strong>{result.success ? "Decode succeeded" : "Decode did not preserve the logical state"}</strong>
          <p>{result.message}</p>
        </div>

        <dl className="residual-classification">
          <div><dt>X part of residual</dt><dd>{classificationLabel(result.residual.x_classification)}</dd></div>
          <div><dt>Z part of residual</dt><dd>{classificationLabel(result.residual.z_classification)}</dd></div>
        </dl>

        <details className="technical-details decode-details">
          <summary>Why a zero syndrome is not enough</summary>
          <p>
            Every returned result has a zero syndrome after correction. Success also requires the residual to be either empty or a stabilizer. A logical residual changes the encoded information even though no check reports a signal.
          </p>
        </details>
      </section>
    </>
  );
}

export function DecodeWorkspace({ code, injection }: { code: CodeDetail; injection: StoredInjection }) {
  const { state, dispatch } = useConfiguration();
  const [request, setRequest] = useState<RequestState>(
    state.decoding ? { phase: "ready", result: state.decoding } : { phase: "loading" },
  );

  const loadDecoding = useCallback(async (signal?: AbortSignal) => {
    setRequest({ phase: "loading" });
    try {
      const result = await decodeError(
        { code_id: code.id, code_version: injection.code_version, qubits: injection.qubits },
        signal,
      );
      dispatch({ type: "set-decoding", result });
      setRequest({ phase: "ready", result });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRequest({
        phase: "error",
        message: error instanceof Error ? error.message : "The decoder could not calculate a correction.",
      });
    }
  }, [code.id, dispatch, injection.code_version, injection.qubits]);

  useEffect(() => {
    if (state.decoding) {
      setRequest({ phase: "ready", result: state.decoding });
      return;
    }
    const controller = new AbortController();
    void loadDecoding(controller.signal);
    return () => controller.abort();
  }, [loadDecoding, state.decoding]);

  return (
    <div className="decode-workspace">
      <button className="back-action" onClick={() => dispatch({ type: "open-observe" })} type="button">
        <span aria-hidden="true">←</span> Back to Observe
      </button>

      {request.phase === "loading" && (
        <section className="panel observe-loading" aria-live="polite">
          <span className="loading-dot" aria-hidden="true" />
          <div><h2>Finding a correction</h2><p>Checking the lightest corrections that match the syndrome.</p></div>
        </section>
      )}

      {request.phase === "error" && (
        <section className="panel configure-error" role="alert">
          <p className="eyebrow">Decoder unavailable</p>
          <h2>The correction could not be calculated</h2>
          <p>{request.message}</p>
          <button className="secondary-action" onClick={() => void loadDecoding()} type="button">Try again</button>
        </section>
      )}

      {request.phase === "ready" && <DecodeView code={code} result={request.result} />}
    </div>
  );
}
