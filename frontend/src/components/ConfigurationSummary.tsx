import type { CodeDetail } from "../api/codes";
import { useConfiguration } from "../state/configuration";

export function ConfigurationSummary({ code }: { code: CodeDetail }) {
  const { state, dispatch } = useConfiguration();
  const probabilityIsValid = state.errorProbability >= 0 && state.errorProbability <= 0.5;
  const seedIsValid = Number.isInteger(state.seed) && state.seed >= 0;
  const isValid = state.errorModel === "manual_pauli" || (probabilityIsValid && seedIsValid);
  const isConfirmed = state.phase === "confirmed";

  return (
    <aside className="panel summary-panel" aria-labelledby="summary-heading">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Review</p>
          <h2 id="summary-heading">Configuration summary</h2>
        </div>
        <span className={`status-badge ${isConfirmed ? "status-ready" : ""}`}>
          {isConfirmed ? "Ready" : "Editing"}
        </span>
      </div>

      <dl className="summary-list">
        <div><dt>Code</dt><dd>{code.name}</dd></div>
        <div><dt>Parameters</dt><dd>[[{code.parameters.n}, {code.parameters.k}, {code.parameters.d}]]</dd></div>
        <div>
          <dt>Error source</dt>
          <dd>{state.errorModel === "manual_pauli" ? "Manual Pauli" : "Seeded code-capacity"}</dd>
        </div>
        {state.errorModel === "seeded_code_capacity" && (
          <>
            <div><dt>Probability</dt><dd>p = {state.errorProbability}</dd></div>
            <div><dt>Seed</dt><dd>{state.seed}</dd></div>
          </>
        )}
        <div><dt>Measurement</dt><dd>{code.measurement_model}</dd></div>
        <div><dt>Validation</dt><dd>{code.validation.length}/{code.validation.length} checks passed</dd></div>
      </dl>

      {!isValid && (
        <p className="inline-error" role="alert">
          Use a probability from 0 to 0.5 and a non-negative whole-number seed.
        </p>
      )}

      {isConfirmed ? (
        <>
          <div className="confirmation-message" role="status">
            <span aria-hidden="true">OK</span>
            <div>
              <strong>Configuration ready</strong>
              <p>The verified inputs are ready.</p>
            </div>
          </div>
          <button className="secondary-action" onClick={() => dispatch({ type: "edit" })} type="button">
            Edit configuration
          </button>
        </>
      ) : (
        <button
          className="primary-action"
          disabled={!isValid}
          onClick={() => dispatch({ type: "confirm" })}
          type="button"
        >
          Confirm configuration
        </button>
      )}

    </aside>
  );
}
