import { workflowStages } from "../state/workflow";
import { useConfiguration } from "../state/configuration";

export function WorkflowRail() {
  const { state } = useConfiguration();

  return (
    <nav className="workflow-rail" aria-label="Experiment workflow">
      <div className="rail-heading">
        <p className="eyebrow">Experiment flow</p>
        <p className="rail-caption">Complete each step in order. You can return and make changes.</p>
      </div>

      <ol className="stage-list">
        {workflowStages.map((stage) => {
          const isComplete = stage.id === "configure" && state.phase === "confirmed";
          const injectionComplete = stage.id === "inject" && state.injection?.phase === "confirmed";
          const observationComplete = stage.id === "observe" && Boolean(state.observation);
          const decodingComplete = stage.id === "decode" && Boolean(state.decoding);
          const resultsComplete = stage.id === "results" && state.experiment?.status === "completed";
          const resultsRunning =
            stage.id === "results" &&
            state.experiment !== null &&
            ["queued", "running", "cancel_requested"].includes(state.experiment.status);
          const isCurrent = stage.id === state.activeStage;
          const isNext =
            (stage.id === "inject" && state.phase === "confirmed" && state.activeStage === "configure") ||
            (stage.id === "observe" && state.injection?.phase === "confirmed" && !state.observation) ||
            (stage.id === "decode" && Boolean(state.observation) && !state.decoding) ||
            (stage.id === "results" && Boolean(state.decoding) && !state.experiment);
          const complete = isComplete || injectionComplete || observationComplete || decodingComplete || resultsComplete;
          const status = complete ? "Complete" : isCurrent ? "Current" : resultsRunning ? "Running" : isNext ? "Next" : "Later";
          return (
            <li
              aria-current={isCurrent ? "step" : undefined}
              className={`stage-item ${complete ? "stage-complete" : ""} ${isCurrent ? "stage-current" : ""}`}
              key={stage.id}
            >
              <div className="stage-marker" aria-hidden="true">
                {stage.order}
              </div>
              <div className="stage-copy">
                <div className="stage-title-row">
                  <span className="stage-title">{stage.label}</span>
                  <span className="stage-state">{status}</span>
                </div>
                <p>{stage.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
