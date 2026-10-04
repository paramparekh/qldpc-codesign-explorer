import type { ErrorModel } from "../state/configuration";

export type Pauli = "I" | "X" | "Y" | "Z";

export type ManualAssignment = {
  qubit: number;
  pauli: Exclude<Pauli, "I">;
};

export type InjectionRequest = {
  code_id: string;
  mode: ErrorModel;
  errors?: ManualAssignment[];
  probability?: number;
  seed?: number;
};

export type InjectionResult = {
  schema_version: number;
  code_id: string;
  code_version: string;
  mode: ErrorModel;
  qubits: Pauli[];
  error_x: number[];
  error_z: number[];
  weight: number;
  counts: { x: number; y: number; z: number };
  reproducibility: {
    probability: number | null;
    seed: number | null;
    generator_version: string | null;
  };
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export async function createInjection(request: InjectionRequest, signal?: AbortSignal) {
  const response = await fetch(`${API_URL}/api/injections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Error-pattern request failed with ${response.status}.`);
  }
  return response.json() as Promise<InjectionResult>;
}
