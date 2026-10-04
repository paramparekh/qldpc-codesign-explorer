import type { Pauli } from "../api/injections";
import { useConfiguration } from "../state/configuration";

function summarize(paulis: Pauli[]) {
  return {
    weight: paulis.filter((pauli) => pauli !== "I").length,
    x: paulis.filter((pauli) => pauli === "X").length,
    y: paulis.filter((pauli) => pauli === "Y").length,
    z: paulis.filter((pauli) => pauli === "Z").length,
  };
}

export function InjectionSummary({ paulis, generated }: { paulis: Pauli[]; generated: boolean }) {
  const { state, dispatch } = useConfiguration();
  const counts = summarize(paulis);
  const confirmed = state.injection?.phase === "confirmed";
  const affected = paulis
    .map((pauli, index) => ({ pauli, qubit: index + 1 }))
    .filter(({ pauli }) => pauli !== "I");
  const status = confirmed ? "Saved" : generated || state.errorModel === "manual_pauli" ? "Editing" : "Not started";

  return (
    <aside className="panel injection-summary" aria-labelledby="injection-summary-heading">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Review</p>
          <h2 id="injection-summary-heading">Review errors</h2>
        </div>
        <span className={`status-badge ${confirmed ? "status-ready" : ""}`}>{status}</span>
      </div>

      <div className="error-metrics" aria-label="Error counts">
        <div><span>Weight</span><strong>{counts.weight}</strong></div>
        <div><span>X</span><strong>{counts.x}</strong></div>
        <div><span>Y</span><strong>{counts.y}</strong></div>
        <div><span>Z</span><strong>{counts.z}</strong></div>
      </div>

      <dl className="summary-list injection-details">
        <div>
          <dt>Method</dt>
          <dd>{state.errorModel === "manual_pauli" ? "Chosen by hand" : "Generated from a seed"}</dd>
        </div>
        {state.errorModel === "seeded_code_capacity" && (
          <>
            <div><dt>Probability</dt><dd>p = {state.errorProbability}</dd></div>
            <div><dt>Seed</dt><dd>{state.seed}</dd></div>
          </>
        )}
        <div>
          <dt>Qubits with errors</dt>
          <dd>
            {affected.length
              ? affected.map(({ qubit, pauli }) => `Q${qubit}: ${pauli}`).join(", ")
              : "None"}
          </dd>
        </div>
      </dl>

      {confirmed && (
        <>
          <div className="confirmation-message" role="status">
            <span aria-hidden="true">OK</span>
            <div>
              <strong>Errors saved</strong>
              <p>Continue to Observe to see which checks detect them.</p>
            </div>
          </div>
          <button className="primary-action" onClick={() => dispatch({ type: "open-observe" })} type="button">
            Continue to Observe
          </button>
        </>
      )}
    </aside>
  );
}
