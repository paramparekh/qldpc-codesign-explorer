import type { Pauli } from "./injections";
import { apiError } from "./errors";

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
  minimum_candidate_count: number | null;
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
  decoder: DecoderMetadata;
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
  decoder_id?: string;
  physical_error_probability?: number;
};

export type DecoderMetadata = {
  id: string;
  name: string;
  method: string;
  scaling_note: string;
  settings: Record<string, string | number>;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export async function getDecoders(
  signal?: AbortSignal,
): Promise<DecoderMetadata[]> {
  const response = await fetch(`${API_URL}/api/decoders`, { signal });
  if (!response.ok)
    throw new Error(
      "The decoder list could not be loaded. Check the backend connection and retry.",
    );
  return response.json();
}

export async function decodeError(
  request: DecodeRequest,
  signal?: AbortSignal,
) {
  const response = await fetch(`${API_URL}/api/decoders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    throw await apiError(
      response,
      `Decoder request failed with ${response.status}.`,
    );
  }
  return response.json() as Promise<DecodeResult>;
}
