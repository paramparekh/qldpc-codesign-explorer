import { BrandMark } from "./components/BrandMark";
import { ConfigureWorkspace } from "./components/ConfigureWorkspace";
import { WorkflowRail } from "./components/WorkflowRail";
import { ConfigurationProvider } from "./state/configuration";

export function App() {
  return (
    <ConfigurationProvider>
      <Workspace />
    </ConfigurationProvider>
  );
}

function Workspace() {
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
      </header>

      <div className="workspace-layout">
        <WorkflowRail />

        <main className="main-content" id="main-content">
          <section className="intro-section" aria-labelledby="page-title">
            <p className="eyebrow">Stage 1 / Configure</p>
            <h1 id="page-title">Configure a verified qLDPC experiment.</h1>
            <p className="intro-copy">
              Review the verified code, choose an error source, and confirm the experiment setup.
            </p>
          </section>

          <ConfigureWorkspace />
        </main>
      </div>
    </div>
  );
}
