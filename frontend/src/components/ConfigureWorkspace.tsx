import { useCallback, useEffect, useState } from "react";

import { fetchCode, fetchCodes, type CodeDetail } from "../api/codes";
import { useConfiguration } from "../state/configuration";
import { CodeEvidence } from "./CodeEvidence";
import { ConfigurationSummary } from "./ConfigurationSummary";
import { ExperimentModel } from "./ExperimentModel";

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; code: CodeDetail };

export function ConfigureWorkspace() {
  const [loadState, setLoadState] = useState<LoadState>({ phase: "loading" });
  const { dispatch } = useConfiguration();

  const loadCode = useCallback(async (signal?: AbortSignal) => {
    setLoadState({ phase: "loading" });
    try {
      const codes = await fetchCodes(signal);
      if (!codes.length) throw new Error("No verified qLDPC fixtures are available.");
      const code = await fetchCode(codes[0].id, signal);
      dispatch({ type: "select-code", codeId: code.id });
      setLoadState({ phase: "ready", code });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadState({
        phase: "error",
        message: error instanceof Error ? error.message : "The qLDPC fixture could not be loaded.",
      });
    }
  }, [dispatch]);

  useEffect(() => {
    const controller = new AbortController();
    void loadCode(controller.signal);
    return () => controller.abort();
  }, [loadCode]);

  if (loadState.phase === "loading") {
    return (
      <section className="panel configure-loading" aria-live="polite">
        <span className="loading-dot" aria-hidden="true" />
        <div>
          <h2>Loading verified qLDPC fixture</h2>
          <p>Reconstructing the configuration evidence from the local API.</p>
        </div>
      </section>
    );
  }

  if (loadState.phase === "error") {
    return (
      <section className="panel configure-error" role="alert">
        <p className="eyebrow">Configuration unavailable</p>
        <h2>The verified qLDPC fixture could not be loaded</h2>
        <p>{loadState.message}</p>
        <p>Your configuration has not been changed.</p>
        <button className="secondary-action" onClick={() => void loadCode()} type="button">Try again</button>
      </section>
    );
  }

  return (
    <div className="configure-layout">
      <div className="configure-primary">
        <CodeEvidence code={loadState.code} />
        <ExperimentModel />
      </div>
      <ConfigurationSummary code={loadState.code} />
    </div>
  );
}

