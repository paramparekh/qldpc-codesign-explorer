import { workflowStages } from "../state/workflow";
import { useConfiguration } from "../state/configuration";

export function WorkflowRail() {
  const { state } = useConfiguration();

  return (
    <nav className="workflow-rail" aria-label="Experiment workflow">
      <div className="rail-heading">
        <p className="eyebrow">Experiment flow</p>
        <p className="rail-caption">A guided path with explicit assumptions and recoverable steps.</p>
      </div>

      <ol className="stage-list">
        {workflowStages.map((stage) => {
          const isComplete = stage.id === "configure" && state.phase === "confirmed";
          const isCurrent = stage.id === "configure" && state.phase === "editing";
          const isNext = stage.id === "inject" && state.phase === "confirmed";
          const status = isComplete ? "Complete" : isCurrent ? "Current" : isNext ? "Next" : "Later";
          return (
            <li className={`stage-item ${isComplete ? "stage-complete" : ""}`} key={stage.id}>
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
