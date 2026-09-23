import { useConfiguration, type ErrorModel } from "../state/configuration";

const choices: Array<{ id: ErrorModel; title: string; description: string }> = [
  {
    id: "manual_pauli",
    title: "Manual Pauli errors",
    description: "Choose exact qubits and X, Y, or Z errors in the Inject stage.",
  },
  {
    id: "seeded_code_capacity",
    title: "Seeded code-capacity noise",
    description: "Generate a reproducible independent error pattern from p and a seed.",
  },
];

export function ExperimentModel() {
  const { state, dispatch } = useConfiguration();

  return (
    <section className="panel model-panel" aria-labelledby="model-heading">
      <p className="eyebrow">Experiment model</p>
      <h2 id="model-heading">Choose how errors will be introduced</h2>

      <fieldset className="choice-fieldset">
        <legend>Error source</legend>
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
        <div className="seed-controls" aria-label="Seeded noise settings">
          <label>
            <span>Physical error probability, p</span>
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
            <small>Stored with the run for reproducibility.</small>
          </label>
        </div>
      )}

      <div className="fixed-assumptions">
        <h3>Model assumptions</h3>
        <ul>
          <li><span>Noise scope</span><strong>Data-qubit errors only</strong></li>
          <li><span>Measurement</span><strong>Perfect syndrome measurement</strong></li>
          <li><span>Channels</span><strong>Separate CSS X and Z components</strong></li>
        </ul>
      </div>
    </section>
  );
}
