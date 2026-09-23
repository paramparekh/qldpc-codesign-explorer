import { BrandMark } from "./components/BrandMark";
import { ModelBoundary } from "./components/ModelBoundary";
import { SystemReadiness } from "./components/SystemReadiness";
import { WorkflowRail } from "./components/WorkflowRail";

const nextMilestones = [
  {
    label: "Code registry",
    detail: "Introduce one versioned, verified CSS teaching fixture.",
  },
  {
    label: "Configuration contract",
    detail: "Expose code parameters, validation evidence, and model assumptions.",
  },
  {
    label: "Configure workspace",
    detail: "Build the first usable stage on top of the shared shell.",
  },
];

export function App() {
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <header className="app-header">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <span className="brand-name">qLDPC CoDesign Explorer</span>
            <span className="brand-subtitle">Learning and diagnostic workspace</span>
          </div>
        </div>
        <div className="header-meta" aria-label="Application status">
          <span className="release-label">Foundation release</span>
          <span className="version-label">v0.1</span>
        </div>
      </header>

      <div className="workspace-layout">
        <WorkflowRail />

        <main className="main-content" id="main-content">
          <section className="intro-section" aria-labelledby="page-title">
            <p className="eyebrow">System foundation</p>
            <h1 id="page-title">A clear path from code structure to decoder evidence.</h1>
            <p className="intro-copy">
              The workspace is being built around a stable four-stage journey. Each scientific
              result will remain traceable to a verified input, a visible state transition, and an
              explicit model assumption.
            </p>
          </section>

          <ModelBoundary />

          <div className="content-grid">
            <SystemReadiness />

            <section className="panel next-panel" aria-labelledby="next-heading">
              <p className="eyebrow">Next implementation slice</p>
              <h2 id="next-heading">Prepare Configure</h2>
              <p className="panel-intro">
                Configure will begin only after the teaching fixture and its validation evidence are
                available through the API.
              </p>
              <ol className="milestone-list">
                {nextMilestones.map((milestone, index) => (
                  <li key={milestone.label}>
                    <span className="milestone-number" aria-hidden="true">{index + 1}</span>
                    <div>
                      <h3>{milestone.label}</h3>
                      <p>{milestone.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="next-state-note">
                <span className="note-label">Why this order</span>
                The interface should reveal verified scientific state, not create the appearance of
                correctness before the underlying contract exists.
              </div>
            </section>
          </div>
        </main>
      </div>

      <footer className="app-footer">
        <span>Research prototype</span>
        <span>Stage 0 of 4 · Foundation</span>
      </footer>
    </div>
  );
}

