import { workflowStages } from "../state/workflow";

export function WorkflowRail() {
  return (
    <nav className="workflow-rail" aria-label="Experiment workflow">
      <div className="rail-heading">
        <p className="eyebrow">Experiment flow</p>
        <p className="rail-caption">A guided path with explicit assumptions and recoverable steps.</p>
      </div>

      <ol className="stage-list">
        {workflowStages.map((stage, index) => (
          <li className="stage-item" key={stage.id}>
            <div className="stage-marker" aria-hidden="true">
              {stage.order}
            </div>
            <div className="stage-copy">
              <div className="stage-title-row">
                <span className="stage-title">{stage.label}</span>
                <span className="stage-state">{index === 0 ? "Next" : "Later"}</span>
              </div>
              <p>{stage.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
}

