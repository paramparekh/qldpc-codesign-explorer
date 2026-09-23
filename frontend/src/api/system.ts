export type CapabilityStatus = "ready" | "planned" | "unavailable";

export type Capability = {
  id: string;
  label: string;
  status: CapabilityStatus;
  detail: string;
};

export type SystemStatus = {
  service: string;
  api_version: string;
  status: "ready" | "degraded";
  capabilities: Capability[];
  model_boundaries: string[];
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export async function fetchSystemStatus(signal?: AbortSignal): Promise<SystemStatus> {
  const response = await fetch(`${API_URL}/api/system/status`, { signal });

  if (!response.ok) {
    throw new Error(`System status request failed with ${response.status}.`);
  }

  return response.json() as Promise<SystemStatus>;
}

