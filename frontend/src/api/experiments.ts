import type { Pauli } from "./injections";

export type ExperimentStatus =
  | "queued"
  | "running"
  | "cancel_requested"
  | "completed"
  | "cancelled"
  | "failed";

export type ExperimentCreateRequest = {
  code_id: string;
  code_version: string;
  decoder_id: string;
  probabilities: number[];
  trials_per_probability: number;
  seed: number;
  confidence_level: number;
  saved_failure_limit: number;
};

export type ExperimentProgress = {
  completed_trials: number;
  total_trials: number;
  fraction: number;
  current_probability: number | null;
  current_point_trials: number;
};

export type ProbabilityResult = {
  probability: number;
  trials_planned: number;
  trials_completed: number;
  successes: number;
  logical_failures: number;
  exact_matches: number;
  stabilizer_successes: number;
  logical_error_rate: number;
  confidence_level: number;
  confidence_method: string;
  confidence_interval: [number, number];
  average_error_weight: number;
  average_correction_weight: number;
  average_residual_weight: number;
  average_decode_time_ms: number;
  runtime_seconds: number;
};

export type FailureSample = {
  probability: number;
  trial_number: number;
  trial_seed: number;
  error: Pauli[];
  correction: Pauli[];
  residual: Pauli[];
  x_classification: string;
  z_classification: string;
};

export type SimulationResult = {
  schema_version: number;
  decoder_id: string;
  decoder_name: string;
  code_id: string;
  code_version: string;
  batch_seed: number;
  batch_generator_version: string;
  error_generator_version: string;
  error_model: string;
  measurement_model: string;
  success_criterion: string;
  total_trials_planned: number;
  total_trials_completed: number;
  cancelled: boolean;
  runtime_seconds: number;
  points: ProbabilityResult[];
  saved_failures: FailureSample[];
};

export type Experiment = {
  id: string;
  status: ExperimentStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  config: ExperimentCreateRequest;
  progress: ExperimentProgress;
  result: SimulationResult | null;
  error_message: string | null;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

async function readExperimentResponse(response: Response) {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Experiment request failed with ${response.status}.`);
  }
  return response.json() as Promise<Experiment>;
}

export async function createExperiment(request: ExperimentCreateRequest, signal?: AbortSignal) {
  const response = await fetch(`${API_URL}/api/experiments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  return readExperimentResponse(response);
}

export async function getExperiment(experimentId: string, signal?: AbortSignal) {
  const response = await fetch(`${API_URL}/api/experiments/${experimentId}`, { signal });
  return readExperimentResponse(response);
}

export async function cancelExperiment(experimentId: string) {
  const response = await fetch(`${API_URL}/api/experiments/${experimentId}/cancel`, {
    method: "POST",
  });
  return readExperimentResponse(response);
}
