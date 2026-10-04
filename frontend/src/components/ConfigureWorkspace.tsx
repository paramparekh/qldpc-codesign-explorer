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
  const { state, dispatch } = useConfiguration();
  const [loadState, setLoadState] = useState<LoadState>(
    state.code ? { phase: "ready", code: state.code } : { phase: "loading" },
  );

  const loadCode = useCallback(async (signal?: AbortSignal) => {
    setLoadState({ phase: "loading" });
    try {
      const codes = await fetchCodes(signal);
      if (!codes.length) throw new Error("No qLDPC codes are available.");
      const code = await fetchCode(codes[0].id, signal);
      dispatch({ type: "select-code", code });
      setLoadState({ phase: "ready", code });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadState({
        phase: "error",
        message: error instanceof Error ? error.message : "The qLDPC code could not be loaded.",
      });
    }
  }, [dispatch]);

  useEffect(() => {
    if (state.code) {
      setLoadState({ phase: "ready", code: state.code });
      return;
    }
    const controller = new AbortController();
    void loadCode(controller.signal);
    return () => controller.abort();
  }, [loadCode, state.code]);

  if (loadState.phase === "loading") {
    return (
      <section className="panel configure-loading" aria-live="polite">
        <span className="loading-dot" aria-hidden="true" />
        <div>
          <h2>Loading the qLDPC code</h2>
          <p>Getting the code details and checks.</p>
        </div>
      </section>
    );
  }

  if (loadState.phase === "error") {
    return (
      <section className="panel configure-error" role="alert">
        <p className="eyebrow">Setup unavailable</p>
        <h2>The qLDPC code could not be loaded</h2>
        <p>{loadState.message}</p>
        <p>Your setup has not been changed.</p>
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
