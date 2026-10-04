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
          <h2 id="summary-heading">Review your setup</h2>
        </div>
        <span className={`status-badge ${isConfirmed ? "status-ready" : ""}`}>
          {isConfirmed ? "Ready" : "Editing"}
        </span>
      </div>

      <dl className="summary-list">
        <div><dt>Code</dt><dd>{code.name}</dd></div>
        <div><dt>Parameters</dt><dd>[[{code.parameters.n}, {code.parameters.k}, {code.parameters.d}]]</dd></div>
        <div>
          <dt>Error method</dt>
          <dd>{state.errorModel === "manual_pauli" ? "Chosen by hand" : "Generated from a seed"}</dd>
        </div>
        {state.errorModel === "seeded_code_capacity" && (
          <>
            <div><dt>Probability</dt><dd>p = {state.errorProbability}</dd></div>
            <div><dt>Seed</dt><dd>{state.seed}</dd></div>
          </>
        )}
        <div><dt>Measurement</dt><dd>{code.measurement_model}</dd></div>
        <div><dt>Code checks</dt><dd>{code.validation.length}/{code.validation.length} passed</dd></div>
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
              <strong>Setup complete</strong>
              <p>You can now add errors.</p>
            </div>
          </div>
          <div className="action-stack">
            <button className="primary-action" onClick={() => dispatch({ type: "open-inject" })} type="button">
              Continue to error selection
            </button>
            <button className="secondary-action" onClick={() => dispatch({ type: "edit" })} type="button">
              Change setup
            </button>
          </div>
        </>
      ) : (
        <button
          className="primary-action"
          disabled={!isValid}
          onClick={() => dispatch({ type: "confirm" })}
          type="button"
        >
          Save setup
        </button>
      )}

    </aside>
  );
}
