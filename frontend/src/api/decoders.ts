import type { Pauli } from "./injections";

export type PauliPattern = {
  qubits: Pauli[];
  error_x: number[];
  error_z: number[];
  weight: number;
  counts: { x: number; y: number; z: number };
};

export type ComponentDecode = {
  component: "X" | "Z";
  syndrome_source: string;
  syndrome: number[];
  correction_support: number[];
  correction_weight: number;
  minimum_candidate_count: number;
};

export type ResidualPattern = PauliPattern & {
  x_check_syndrome: number[];
  z_check_syndrome: number[];
  x_classification: "none" | "stabilizer" | "logical";
  z_classification: "none" | "stabilizer" | "logical";
};

export type DecodeResult = {
  schema_version: number;
  code_id: string;
  code_version: string;
  decoder: { id: string; name: string; method: string };
  status: "corrected" | "logical_failure";
  success: boolean;
  message: string;
  original: PauliPattern;
  correction: PauliPattern;
  residual: ResidualPattern;
  x_component: ComponentDecode;
  z_component: ComponentDecode;
};

export type DecodeRequest = {
  code_id: string;
  code_version: string;
  qubits: Pauli[];
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export async function decodeError(request: DecodeRequest, signal?: AbortSignal) {
  const response = await fetch(`${API_URL}/api/decoders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Decoder request failed with ${response.status}.`);
  }
  return response.json() as Promise<DecodeResult>;
}
