import { useConfiguration, type ErrorModel } from "../state/configuration";

const choices: Array<{ id: ErrorModel; title: string; description: string }> = [
  {
    id: "manual_pauli",
    title: "Choose errors by hand",
    description: "Select each qubit and assign an X, Y, or Z error.",
  },
  {
    id: "seeded_code_capacity",
    title: "Generate errors from a seed",
    description: "Use a probability and seed to create an error pattern that can be repeated.",
  },
];

export function ExperimentModel() {
  const { state, dispatch } = useConfiguration();

  return (
    <section className="panel model-panel" aria-labelledby="model-heading">
      <p className="eyebrow">Error setup</p>
      <h2 id="model-heading">Choose how to create errors</h2>

      <fieldset className="choice-fieldset">
        <legend>Error method</legend>
        <div className="choice-grid">
          {choices.map((choice) => (
            <label
              className={`choice-card ${state.errorModel === choice.id ? "choice-selected" : ""}`}
              key={choice.id}
            >
              <input
                checked={state.errorModel === choice.id}
                name="error-model"
                onChange={() => dispatch({ type: "set-error-model", errorModel: choice.id })}
                type="radio"
                value={choice.id}
              />
              <span className="radio-mark" aria-hidden="true" />
              <span>
                <strong>{choice.title}</strong>
                <small>{choice.description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {state.errorModel === "seeded_code_capacity" && (
        <div className="seed-controls" aria-label="Generated error settings">
          <label>
            <span>Error probability, p</span>
            <input
              aria-describedby="probability-help"
              max="0.5"
              min="0"
              onChange={(event) =>
                dispatch({ type: "set-error-probability", value: Number(event.target.value) })
              }
              step="0.001"
              type="number"
              value={state.errorProbability}
            />
            <small id="probability-help">Allowed range: 0 to 0.5.</small>
          </label>
          <label>
            <span>Random seed</span>
            <input
              min="0"
              onChange={(event) => dispatch({ type: "set-seed", value: Number(event.target.value) })}
              step="1"
              type="number"
              value={state.seed}
            />
            <small>Use the same seed to create the same errors again.</small>
          </label>
        </div>
      )}

      <div className="fixed-assumptions">
        <h3>Current settings</h3>
        <ul>
          <li><span>Errors applied to</span><strong>Data qubits only</strong></li>
          <li><span>Syndrome measurements</span><strong>No measurement errors</strong></li>
          <li><span>Error tracking</span><strong>X and Z parts tracked separately</strong></li>
        </ul>
      </div>
    </section>
  );
}
