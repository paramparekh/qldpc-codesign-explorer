export type CodeParameters = {
  n: number;
  k: number;
  d: number;
  d_x: number;
  d_z: number;
  rate: number;
  distance_status: "verified";
};

export type CodeSummary = {
  id: string;
  name: string;
  family: "Quantum LDPC";
  construction: string;
  description: string;
  parameters: CodeParameters;
  version: string;
};

export type ValidationEvidence = {
  id: string;
  label: string;
  status: "passed";
  detail: string;
};

export type CodeDetail = CodeSummary & {
  schema_version: number;
  matrices: {
    h_x: number[][];
    h_z: number[][];
  };
  matrix_metadata: {
    h_x_shape: [number, number];
    h_z_shape: [number, number];
    rank_x: number;
    rank_z: number;
    x_check_weights: number[];
    z_check_weights: number[];
    max_check_weight: number;
    max_column_weight: number;
    max_total_qubit_degree: number;
  };
  matrix_convention: {
    h_x: string;
    h_z: string;
  };
  qubit_partition: {
    vertex_vertex: number;
    check_check: number;
  };
  provenance: string;
  validation: ValidationEvidence[];
  supported_error_models: ["manual_pauli", "seeded_code_capacity"];
  measurement_model: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { signal });
  if (!response.ok) {
    throw new Error(`Code request failed with ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export function fetchCodes(signal?: AbortSignal) {
  return getJson<CodeSummary[]>("/api/codes", signal);
}

export function fetchCode(codeId: string, signal?: AbortSignal) {
  return getJson<CodeDetail>(`/api/codes/${encodeURIComponent(codeId)}`, signal);
}

