import type { Pauli } from "./injections";
import { apiError } from "./errors";

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
  comparison_decoder_id?: string | null;
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
  trial_seed: string | number;
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
  batch_seed: string | number;
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
  decoder_settings?: Record<string, string | number>;
  comparison?: SimulationResult | null;
  paired_outcomes?: PairedOutcome[];
  disagreements?: DisagreementSample[];
};

export type PairedOutcome = {
  probability: number;
  trials_completed: number;
  both_succeed: number;
  primary_only_succeeds: number;
  comparison_only_succeeds: number;
  both_fail: number;
  different_corrections: number;
};

export type DisagreementSample = {
  probability: number;
  trial_number: number;
  trial_seed: string | number;
  error: Pauli[];
  primary_correction: Pauli[];
  comparison_correction: Pauli[];
  primary_success: boolean;
  comparison_success: boolean;
};

export type Experiment = {
  id: string;
  status: ExperimentStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  config: Omit<ExperimentCreateRequest, "seed"> & { seed: string | number };
  progress: ExperimentProgress;
  result: SimulationResult | null;
  error_message: string | null;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export function experimentExportUrl(id: string, format: "json" | "csv") {
  return `${API_URL}/api/experiments/${encodeURIComponent(id)}/export?format=${format}`;
}

export async function listExperiments(
  signal?: AbortSignal,
): Promise<Experiment[]> {
  const response = await fetch(`${API_URL}/api/experiments?limit=20`, {
    signal,
  });
  if (!response.ok)
    throw new Error(
      "Saved experiments could not be loaded. Check the backend connection.",
    );
  return response.json();
}

async function readExperimentResponse(response: Response) {
  if (!response.ok) {
    throw await apiError(
      response,
      `Experiment request failed with ${response.status}.`,
    );
  }
  return response.json() as Promise<Experiment>;
}

export async function createExperiment(
  request: ExperimentCreateRequest,
  signal?: AbortSignal,
) {
  const response = await fetch(`${API_URL}/api/experiments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  return readExperimentResponse(response);
}

export async function getExperiment(
  experimentId: string,
  signal?: AbortSignal,
) {
  const response = await fetch(`${API_URL}/api/experiments/${experimentId}`, {
    signal,
  });
  return readExperimentResponse(response);
}

export async function cancelExperiment(experimentId: string) {
  const response = await fetch(
    `${API_URL}/api/experiments/${experimentId}/cancel`,
    {
      method: "POST",
    },
  );
  return readExperimentResponse(response);
}
