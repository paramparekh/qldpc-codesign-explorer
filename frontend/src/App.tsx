import { BrandMark } from "./components/BrandMark";
import { ConfigureWorkspace } from "./components/ConfigureWorkspace";
import { DecodeWorkspace } from "./components/DecodeWorkspace";
import { InjectWorkspace } from "./components/InjectWorkspace";
import { ObserveWorkspace } from "./components/ObserveWorkspace";
import { ResultsWorkspace } from "./components/ResultsWorkspace";
import { WorkflowRail } from "./components/WorkflowRail";
import { ConfigurationProvider, useConfiguration } from "./state/configuration";

export function App() {
  return (
    <ConfigurationProvider>
      <Workspace />
    </ConfigurationProvider>
  );
}

function Workspace() {
  const { state } = useConfiguration();
  const activeCode = state.code;
  const isInject = state.activeStage === "inject";
  const isObserve = state.activeStage === "observe";
  const isDecode = state.activeStage === "decode";
  const isResults = state.activeStage === "results";

  const stageCopy = isResults
    ? {
        eyebrow: "Stage 5 / Results",
        title: "Measure decoder performance across repeated trials.",
        description: "Run the same qLDPC code at several physical error probabilities and compare how often decoding preserves the logical information.",
      }
    : isDecode
    ? {
        eyebrow: "Stage 4 / Decode",
        title: "Apply a correction and check the result.",
        description: "See how the decoder chose a correction and whether the encoded information was preserved.",
      }
    : isObserve
    ? {
        eyebrow: "Stage 3 / Observe",
        title: "See which checks detect the errors.",
        description: "Review the syndrome and trace each check result back to the selected data-qubit errors.",
      }
    : isInject
      ? {
          eyebrow: "Stage 2 / Inject",
          title: "Add errors to the data qubits.",
          description: "Choose X, Y, or Z errors for specific qubits, or generate errors from the saved probability and seed.",
        }
      : {
          eyebrow: "Stage 1 / Configure",
          title: "Set up a qLDPC experiment.",
          description: "Check the code details, choose how errors are created, and review your setup.",
        };

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <header className="app-header">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <span className="brand-name">qLDPC CoDesign Explorer</span>
            <span className="brand-subtitle">Explore qLDPC error correction step by step</span>
          </div>
        </div>
      </header>

      <div className="workspace-layout">
        <WorkflowRail />

        <main className="main-content" id="main-content">
          <section className="intro-section" aria-labelledby="page-title">
            <p className="eyebrow">{stageCopy.eyebrow}</p>
            <h1 id="page-title">{stageCopy.title}</h1>
            <p className="intro-copy">{stageCopy.description}</p>
          </section>

          {isResults && activeCode ? (
            <ResultsWorkspace code={activeCode} />
          ) : isDecode && activeCode && state.injection ? (
            <DecodeWorkspace code={activeCode} injection={state.injection} />
          ) : isObserve && activeCode && state.injection ? (
            <ObserveWorkspace code={activeCode} injection={state.injection} />
          ) : isInject && activeCode ? (
            <InjectWorkspace code={activeCode} />
          ) : (
            <ConfigureWorkspace />
          )}
        </main>
      </div>
    </div>
  );
}
