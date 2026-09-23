import { useCallback, useEffect, useState } from "react";

import { fetchSystemStatus, type SystemStatus } from "../api/system";

type RequestState =
  | { phase: "loading" }
  | { phase: "ready"; data: SystemStatus }
  | { phase: "error"; message: string };

export function SystemReadiness() {
  const [request, setRequest] = useState<RequestState>({ phase: "loading" });

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    setRequest({ phase: "loading" });

    try {
      const data = await fetchSystemStatus(signal);
      setRequest({ phase: "ready", data });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRequest({
        phase: "error",
        message: "The interface is available, but the local API did not respond.",
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, [loadStatus]);

  return (
    <section className="panel readiness-panel" aria-labelledby="readiness-heading" aria-live="polite">
      <div className="panel-heading-row">
        <div>
          <p className="eyebrow">System readiness</p>
          <h2 id="readiness-heading">Foundation status</h2>
        </div>
        {request.phase === "ready" && <span className="status-badge status-ready">Connected</span>}
        {request.phase === "loading" && <span className="status-badge">Checking</span>}
        {request.phase === "error" && <span className="status-badge status-warning">API offline</span>}
      </div>

      {request.phase === "loading" && (
        <div className="status-message">
          <span className="loading-dot" aria-hidden="true" />
          Checking the local service boundary…
        </div>
      )}

      {request.phase === "error" && (
        <div className="status-error" role="alert">
          <p>{request.message}</p>
          <p className="supporting-copy">Start the FastAPI service, then check again. No project data has been lost.</p>
          <button className="secondary-button" type="button" onClick={() => void loadStatus()}>
            Check again
          </button>
        </div>
      )}

      {request.phase === "ready" && (
        <ul className="capability-list">
          {request.data.capabilities.map((capability) => (
            <li key={capability.id}>
              <span
                className={`capability-indicator capability-${capability.status}`}
                aria-hidden="true"
              />
              <div>
                <div className="capability-title-row">
                  <span className="capability-title">{capability.label}</span>
                  <span className="capability-status">{capability.status}</span>
                </div>
                <p>{capability.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

