import { useMemo, useState } from "react";

import type { CodeDetail } from "../api/codes";
import { createInjection, type Pauli } from "../api/injections";
import { useConfiguration } from "../state/configuration";
import { InjectionSummary } from "./InjectionSummary";
import { QubitPattern } from "./QubitPattern";

type RequestState = { phase: "idle" | "submitting" } | { phase: "error"; message: string };

const toolChoices: Array<{ pauli: Pauli; label: string; description: string }> = [
  { pauli: "X", label: "X", description: "Bit-flip component" },
  { pauli: "Y", label: "Y", description: "Bit and phase components" },
  { pauli: "Z", label: "Z", description: "Phase-flip component" },
  { pauli: "I", label: "Erase", description: "Remove the error" },
];

function ManualInjection({ code }: { code: CodeDetail }) {
  const { state, dispatch } = useConfiguration();
  const [activeTool, setActiveTool] = useState<Pauli>("X");
  const [paulis, setPaulis] = useState<Pauli[]>(
    state.injection?.mode === "manual_pauli"
      ? state.injection.qubits
      : Array.from({ length: code.parameters.n }, () => "I" as Pauli),
  );
  const [requestState, setRequestState] = useState<RequestState>({ phase: "idle" });
  const confirmed = state.injection?.phase === "confirmed";
  const weight = paulis.filter((pauli) => pauli !== "I").length;

  const setQubit = (index: number) => {
    setPaulis((current) => current.map((pauli, position) => (position === index ? activeTool : pauli)));
    setRequestState({ phase: "idle" });
  };

  const confirm = async () => {
    setRequestState({ phase: "submitting" });
    try {
      const result = await createInjection({
        code_id: code.id,
        mode: "manual_pauli",
        errors: paulis.flatMap((pauli, index) =>
          pauli === "I" ? [] : [{ qubit: index + 1, pauli }],
        ),
      });
      setPaulis(result.qubits);
      dispatch({ type: "set-injection", result, phase: "confirmed" });
      setRequestState({ phase: "idle" });
    } catch (error) {
      setRequestState({
        phase: "error",
        message: error instanceof Error ? error.message : "The errors could not be saved.",
      });
    }
  };

  return (
    <>
      <section className="panel injection-builder" aria-labelledby="manual-injection-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Choose errors</p>
            <h2 id="manual-injection-heading">Add X, Y, or Z errors</h2>
          </div>
          <span className={`status-badge ${confirmed ? "status-ready" : ""}`}>
            {confirmed ? "Saved" : "Editing"}
          </span>
        </div>
        <p className="section-intro">
          Choose an error type, then select the qubits that should receive it. Choose Erase to remove an error.
        </p>

        <fieldset className="pauli-tools" disabled={confirmed}>
          <legend>Error type</legend>
          <div className="pauli-tool-grid">
            {toolChoices.map((tool) => (
              <label className={activeTool === tool.pauli ? "tool-selected" : ""} key={tool.pauli}>
                <input
                  checked={activeTool === tool.pauli}
                  name="pauli-tool"
                  onChange={() => setActiveTool(tool.pauli)}
                  type="radio"
                  value={tool.pauli}
                />
                <strong>{tool.label}</strong>
                <small>{tool.description}</small>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="map-heading-row">
          <div>
            <h3>Data-qubit map</h3>
            <p>The code has two qubit groups. Select qubits in either group in the same way.</p>
          </div>
          {!confirmed && (
            <button
              className="text-action"
              disabled={weight === 0}
              onClick={() => setPaulis(paulis.map(() => "I"))}
              type="button"
            >
              Clear all
            </button>
          )}
        </div>

        <QubitPattern
          activeTool={activeTool}
          disabled={confirmed}
          onSelect={setQubit}
          paulis={paulis}
          vertexPairCount={code.qubit_partition.vertex_vertex}
        />

        {weight === 0 && !confirmed && (
          <p className="neutral-note">You may also continue with no errors.</p>
        )}
        {requestState.phase === "error" && <p className="inline-error" role="alert">{requestState.message}</p>}

        {confirmed ? (
          <button className="secondary-action" onClick={() => dispatch({ type: "edit-injection" })} type="button">
            Change errors
          </button>
        ) : (
          <button
            className="primary-action"
            disabled={requestState.phase === "submitting"}
            onClick={() => void confirm()}
            type="button"
          >
            {requestState.phase === "submitting"
              ? "Saving..."
              : weight === 0
                ? "Save with no errors"
                : "Save error selection"}
          </button>
        )}
      </section>
      <InjectionSummary generated paulis={paulis} />
    </>
  );
}

function SeededInjection({ code }: { code: CodeDetail }) {
  const { state, dispatch } = useConfiguration();
  const [requestState, setRequestState] = useState<RequestState>({ phase: "idle" });
  const paulis = useMemo<Pauli[]>(
    () => state.injection?.qubits ?? Array.from({ length: code.parameters.n }, () => "I" as Pauli),
    [code.parameters.n, state.injection],
  );
  const generated = Boolean(state.injection);
  const confirmed = state.injection?.phase === "confirmed";

  const generate = async () => {
    setRequestState({ phase: "submitting" });
    try {
      const result = await createInjection({
        code_id: code.id,
        mode: "seeded_code_capacity",
        probability: state.errorProbability,
        seed: state.seed,
      });
      dispatch({ type: "set-injection", result, phase: "draft" });
      setRequestState({ phase: "idle" });
    } catch (error) {
      setRequestState({
        phase: "error",
        message: error instanceof Error ? error.message : "The errors could not be generated.",
      });
    }
  };

  return (
    <>
      <section className="panel injection-builder" aria-labelledby="seeded-injection-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Generated errors</p>
            <h2 id="seeded-injection-heading">Create errors from the saved seed</h2>
          </div>
          <span className={`status-badge ${confirmed ? "status-ready" : ""}`}>
            {confirmed ? "Saved" : generated ? "Ready to review" : "Not started"}
          </span>
        </div>
        <p className="section-intro">
          The probability controls how often errors appear. The seed lets you create the same result again.
        </p>

        <dl className="seed-review" aria-label="Saved error settings">
          <div><dt>Error probability</dt><dd>p = {state.errorProbability}</dd></div>
          <div><dt>Random seed</dt><dd>{state.seed}</dd></div>
        </dl>

        {!generated ? (
          <button
            className="primary-action generate-action"
            disabled={requestState.phase === "submitting"}
            onClick={() => void generate()}
            type="button"
          >
            {requestState.phase === "submitting" ? "Generating..." : "Generate error pattern"}
          </button>
        ) : (
          <>
            <div className="map-heading-row seeded-map-heading">
              <div>
                <h3>Generated errors</h3>
                <p>Each qubit shows I, X, Y, or Z. I means no error.</p>
              </div>
            </div>
            <QubitPattern paulis={paulis} vertexPairCount={code.qubit_partition.vertex_vertex} />
            {confirmed ? (
              <button className="secondary-action" onClick={() => void generate()} type="button">
                Generate again
              </button>
            ) : (
              <div className="action-stack horizontal-actions">
                <button className="primary-action" onClick={() => dispatch({ type: "confirm-injection" })} type="button">
                  Save error selection
                </button>
                <button className="secondary-action" onClick={() => void generate()} type="button">
                  Generate again
                </button>
              </div>
            )}
          </>
        )}

        {requestState.phase === "error" && <p className="inline-error" role="alert">{requestState.message}</p>}
      </section>
      <InjectionSummary generated={generated} paulis={paulis} />
    </>
  );
}

export function InjectWorkspace({ code }: { code: CodeDetail }) {
  const { state, dispatch } = useConfiguration();

  return (
    <>
      <button className="back-action" onClick={() => dispatch({ type: "open-configure" })} type="button">
        <span aria-hidden="true">←</span> Back to setup
      </button>
      <div className="inject-layout">
        {state.errorModel === "manual_pauli" ? <ManualInjection code={code} /> : <SeededInjection code={code} />}
      </div>
    </>
  );
}
