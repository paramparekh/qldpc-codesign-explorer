import type { Pauli } from "./injections";

export type CheckResult = {
  id: string;
  number: number;
  result: 0 | 1;
  support: number[];
  error_qubits: number[];
};

export type CheckGroup = {
  matrix: string;
  detects: string;
  syndrome: number[];
  triggered_count: number;
  checks: CheckResult[];
};

export type ObservationResult = {
  schema_version: number;
  code_id: string;
  code_version: string;
  error_weight: number;
  total_triggered: number;
  x_checks: CheckGroup;
  z_checks: CheckGroup;
};

export type ObservationRequest = {
  code_id: string;
  code_version: string;
  qubits: Pauli[];
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export async function createObservation(request: ObservationRequest, signal?: AbortSignal) {
  const response = await fetch(`${API_URL}/api/observations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Syndrome request failed with ${response.status}.`);
  }
  return response.json() as Promise<ObservationResult>;
}
