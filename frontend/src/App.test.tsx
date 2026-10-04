import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const summary = {
  id: "hgp_rep3_v1",
  name: "HGP repetition-3 code",
  family: "Quantum LDPC",
  construction: "Hypergraph product",
  description: "A small qLDPC code built from two length-3 repetition codes.",
  parameters: {
    n: 13,
    k: 1,
    d: 3,
    d_x: 3,
    d_z: 3,
    rate: 1 / 13,
    distance_status: "verified",
  },
  version: "1.0.0",
};

const codeDetail = {
  ...summary,
  schema_version: 1,
  matrices: { h_x: [], h_z: [] },
  matrix_metadata: {
    h_x_shape: [6, 13],
    h_z_shape: [6, 13],
    rank_x: 6,
    rank_z: 6,
    x_check_weights: [3, 4, 3, 3, 4, 3],
    z_check_weights: [3, 4, 3, 3, 4, 3],
    max_check_weight: 4,
    max_column_weight: 2,
    max_total_qubit_degree: 4,
  },
  matrix_convention: {
    h_x: "Rows are X-type checks and detect the Z-error component.",
    h_z: "Rows are Z-type checks and detect the X-error component.",
  },
  qubit_partition: { vertex_vertex: 9, check_check: 4 },
  provenance: "HGP(H, H) with H=[[1,1,0],[0,1,1]].",
  validation: [
    { id: "binary", label: "Binary matrices", status: "passed", detail: "Every entry is binary." },
    { id: "dimensions", label: "Compatible dimensions", status: "passed", detail: "Both have 13 columns." },
    { id: "orthogonality", label: "CSS orthogonality", status: "passed", detail: "The product is zero." },
    { id: "distance", label: "Exact distance", status: "passed", detail: "Exact search gives distance 3." },
  ],
  supported_error_models: ["manual_pauli", "seeded_code_capacity"],
  measurement_model: "Perfect syndrome measurement",
};

function jsonResponse(payload: unknown) {
  return Promise.resolve({ ok: true, json: async () => payload });
}

function injectionResponse(payload: {
  mode: "manual_pauli" | "seeded_code_capacity";
  errors?: Array<{ qubit: number; pauli: "X" | "Y" | "Z" }>;
  probability?: number;
  seed?: number;
}) {
  const qubits = Array.from({ length: 13 }, () => "I" as "I" | "X" | "Y" | "Z");
  if (payload.mode === "manual_pauli") {
    payload.errors?.forEach(({ qubit, pauli }) => {
      qubits[qubit - 1] = pauli;
    });
  } else {
    ["I", "X", "Y", "I", "Z", "Z", "Y", "I", "I", "I", "Z", "X", "I"].forEach(
      (pauli, index) => { qubits[index] = pauli as "I" | "X" | "Y" | "Z"; },
    );
  }
  return {
    schema_version: 1,
    code_id: "hgp_rep3_v1",
    code_version: "1.0.0",
    mode: payload.mode,
    qubits,
    error_x: qubits.map((pauli) => Number(pauli === "X" || pauli === "Y")),
    error_z: qubits.map((pauli) => Number(pauli === "Z" || pauli === "Y")),
    weight: qubits.filter((pauli) => pauli !== "I").length,
    counts: {
      x: qubits.filter((pauli) => pauli === "X").length,
      y: qubits.filter((pauli) => pauli === "Y").length,
      z: qubits.filter((pauli) => pauli === "Z").length,
    },
    reproducibility: {
      probability: payload.mode === "seeded_code_capacity" ? payload.probability : null,
      seed: payload.mode === "seeded_code_capacity" ? payload.seed : null,
      generator_version: payload.mode === "seeded_code_capacity" ? "splitmix64-v1" : null,
    },
  };
}

function observationResponse(payload: { qubits: Array<"I" | "X" | "Y" | "Z"> }) {
  const xSupports = [[1, 4, 10], [2, 5, 10, 11], [3, 6, 11], [4, 7, 12], [5, 8, 12, 13], [6, 9, 13]];
  const zSupports = [[1, 2, 10], [2, 3, 11], [4, 5, 10, 12], [5, 6, 11, 13], [7, 8, 12], [8, 9, 13]];
  const errorX = payload.qubits.map((pauli) => Number(pauli === "X" || pauli === "Y"));
  const errorZ = payload.qubits.map((pauli) => Number(pauli === "Z" || pauli === "Y"));

  const group = (prefix: "X" | "Z", supports: number[][], component: number[]) => {
    const checks = supports.map((support, index) => {
      const errorQubits = support.filter((qubit) => component[qubit - 1]);
      return {
        id: `${prefix}${index + 1}`,
        number: index + 1,
        result: errorQubits.length % 2,
        support,
        error_qubits: errorQubits,
      };
    });
    return {
      matrix: `H_${prefix}`,
      detects: prefix === "X" ? "Z and Y errors" : "X and Y errors",
      syndrome: checks.map((check) => check.result),
      triggered_count: checks.filter((check) => check.result).length,
      checks,
    };
  };

  const xChecks = group("X", xSupports, errorZ);
  const zChecks = group("Z", zSupports, errorX);
  return {
    schema_version: 1,
    code_id: "hgp_rep3_v1",
    code_version: "1.0.0",
    error_weight: payload.qubits.filter((pauli) => pauli !== "I").length,
    total_triggered: xChecks.triggered_count + zChecks.triggered_count,
    x_checks: xChecks,
    z_checks: zChecks,
  };
}

function decodeResponse(payload: { qubits: Array<"I" | "X" | "Y" | "Z"> }) {
  const pattern = (qubits: Array<"I" | "X" | "Y" | "Z">) => ({
    qubits,
    error_x: qubits.map((pauli) => Number(pauli === "X" || pauli === "Y")),
    error_z: qubits.map((pauli) => Number(pauli === "Z" || pauli === "Y")),
    weight: qubits.filter((pauli) => pauli !== "I").length,
    counts: {
      x: qubits.filter((pauli) => pauli === "X").length,
      y: qubits.filter((pauli) => pauli === "Y").length,
      z: qubits.filter((pauli) => pauli === "Z").length,
    },
  });
  const logicalFailure =
    payload.qubits[0] === "X" &&
    payload.qubits[1] === "X" &&
    payload.qubits.slice(2).every((pauli) => pauli === "I");
  const correctionQubits = logicalFailure
    ? Array.from({ length: 13 }, (_, index) => index === 2 ? "X" as const : "I" as const)
    : payload.qubits;
  const residualQubits = logicalFailure
    ? Array.from({ length: 13 }, (_, index) => index < 3 ? "X" as const : "I" as const)
    : Array.from({ length: 13 }, () => "I" as const);
  return {
    schema_version: 1,
    code_id: "hgp_rep3_v1",
    code_version: "1.0.0",
    decoder: {
      id: "exact-css-min-weight-v1",
      name: "Exact minimum-weight CSS decoder",
      method: "Exact search for the lightest X and Z correction components with deterministic tie-breaking.",
    },
    status: logicalFailure ? "logical_failure" : "corrected",
    success: !logicalFailure,
    message: logicalFailure
      ? "The checks are quiet, but the residual acts as a logical operation. The encoded information has changed."
      : "The correction exactly matches the error, so no residual operation remains.",
    original: pattern(payload.qubits),
    correction: pattern(correctionQubits),
    residual: {
      ...pattern(residualQubits),
      x_check_syndrome: [0, 0, 0, 0, 0, 0],
      z_check_syndrome: [0, 0, 0, 0, 0, 0],
      x_classification: logicalFailure ? "logical" : "none",
      z_classification: "none",
    },
    x_component: {
      component: "X",
      syndrome_source: "Z-type checks",
      syndrome: logicalFailure ? [0, 1, 0, 0, 0, 0] : [1, 0, 1, 1, 0, 0],
      correction_support: logicalFailure ? [3] : [1, 5],
      correction_weight: logicalFailure ? 1 : 2,
      minimum_candidate_count: logicalFailure ? 1 : 2,
    },
    z_component: {
      component: "Z",
      syndrome_source: "X-type checks",
      syndrome: logicalFailure ? [0, 0, 0, 0, 0, 0] : [0, 1, 0, 0, 1, 0],
      correction_support: logicalFailure ? [] : [5],
      correction_weight: logicalFailure ? 0 : 1,
      minimum_candidate_count: 1,
    },
  };
}

describe("Configure stage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((request: string | URL | Request, options?: RequestInit) => {
        const url = String(request);
        if (url.endsWith("/api/injections")) {
          return jsonResponse(injectionResponse(JSON.parse(String(options?.body))));
        }
        if (url.endsWith("/api/observations")) {
          return jsonResponse(observationResponse(JSON.parse(String(options?.body))));
        }
        if (url.endsWith("/api/decoders")) {
          return jsonResponse(decodeResponse(JSON.parse(String(options?.body))));
        }
        return url.endsWith("/api/codes") ? jsonResponse([summary]) : jsonResponse(codeDetail);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads one qLDPC code and presents its calculated checks", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Selected code" })).toBeInTheDocument();
    expect(screen.getAllByText("HGP repetition-3 code")).toHaveLength(2);
    expect(screen.getByLabelText("Code parameters")).toHaveTextContent("[[13, 1, 3]]");
    expect(screen.getAllByText("4/4 passed")).toHaveLength(2);
    expect(screen.getByText("CSS orthogonality")).toBeInTheDocument();
    expect(screen.queryByText(/surface code/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/toric code/i)).not.toBeInTheDocument();
  });

  it("configures generated errors and saves the setup", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "Selected code" });
    await user.click(screen.getByRole("radio", { name: /generate errors from a seed/i }));

    const probability = screen.getByRole("spinbutton", { name: /error probability/i });
    const seed = screen.getByRole("spinbutton", { name: /random seed/i });
    await user.clear(probability);
    await user.type(probability, "0.02");
    await user.clear(seed);
    await user.type(seed, "42");
    await user.click(screen.getByRole("button", { name: "Save setup" }));

    expect(screen.getByRole("status")).toHaveTextContent("Setup complete");
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText("p = 0.02")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change setup" })).toBeInTheDocument();
  });

  it("lets the user retry when the code API is offline", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockImplementationOnce(() => jsonResponse([summary]))
      .mockImplementationOnce(() => jsonResponse(codeDetail));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The qLDPC code could not be loaded",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Selected code" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("creates and confirms a clear manual Pauli error pattern", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "Selected code" });
    await user.click(screen.getByRole("button", { name: "Save setup" }));
    await user.click(screen.getByRole("button", { name: "Continue to error selection" }));

    expect(screen.getByRole("heading", { name: "Add errors to the data qubits." })).toBeInTheDocument();
    expect(screen.getByText("Qubit group A")).toBeInTheDocument();
    expect(screen.getByText("Qubit group B")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Qubit 1, currently I; apply X/i }));
    await user.click(screen.getByRole("radio", { name: /Y.*Bit and phase components/i }));
    await user.click(screen.getByRole("button", { name: /Qubit 5, currently I; apply Y/i }));

    expect(screen.getByLabelText("Error counts")).toHaveTextContent("Weight2");
    expect(screen.getByText("Q1: X, Q5: Y")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save error selection" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Errors saved");
    expect(screen.getByText("Observe").closest("li")).toHaveTextContent("Next");
    expect(screen.getByRole("button", { name: "Change errors" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue to Observe" }));
    expect(await screen.findByRole("heading", { name: "See which checks detect the errors." })).toBeInTheDocument();
    expect(screen.getByLabelText("X-type checks syndrome 0 1 0 0 1 0")).toBeInTheDocument();
    expect(screen.getByLabelText("Z-type checks syndrome 1 0 1 1 0 0")).toBeInTheDocument();
    expect(screen.getByText("The code detected the errors")).toBeInTheDocument();
    expect(screen.getByText("Decode").closest("li")).toHaveTextContent("Next");

    await user.click(screen.getByRole("button", { name: "Continue to Decode" }));
    expect(await screen.findByRole("heading", { name: "Apply a correction and check the result." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Exact minimum-weight CSS decoder" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correction, qubit 5: Y")).toBeInTheDocument();
    expect(screen.getByLabelText("Residual, qubit 5: I")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Decode succeeded");
    expect(screen.getByText("Decode").closest("li")).toHaveTextContent("Complete");
  });

  it("generates the same errors from the same probability and seed", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "Selected code" });
    await user.click(screen.getByRole("radio", { name: /generate errors from a seed/i }));
    const probability = screen.getByRole("spinbutton", { name: /error probability/i });
    const seed = screen.getByRole("spinbutton", { name: /random seed/i });
    await user.clear(probability);
    await user.type(probability, "0.5");
    await user.clear(seed);
    await user.type(seed, "42");
    await user.click(screen.getByRole("button", { name: "Save setup" }));
    await user.click(screen.getByRole("button", { name: "Continue to error selection" }));

    expect(screen.getAllByText("p = 0.5")).toHaveLength(2);
    expect(screen.getAllByText("42")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Generate error pattern" }));

    expect(await screen.findByLabelText("Qubit 2: X")).toBeInTheDocument();
    expect(screen.getByLabelText("Qubit 3: Y")).toBeInTheDocument();
    expect(screen.getByText("Q2: X, Q3: Y, Q5: Z, Q6: Z, Q7: Y, Q11: Z, Q12: X")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save error selection" }));

    expect(screen.getByRole("status")).toHaveTextContent("Errors saved");
    expect(screen.getByText("Observe").closest("li")).toHaveTextContent("Next");
  });

  it("explains a logical failure even after the correction clears every check", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "Selected code" });
    await user.click(screen.getByRole("button", { name: "Save setup" }));
    await user.click(screen.getByRole("button", { name: "Continue to error selection" }));
    await user.click(screen.getByRole("button", { name: /Qubit 1, currently I; apply X/i }));
    await user.click(screen.getByRole("button", { name: /Qubit 2, currently I; apply X/i }));
    await user.click(screen.getByRole("button", { name: "Save error selection" }));
    await user.click(screen.getByRole("button", { name: "Continue to Observe" }));
    await screen.findByRole("heading", { name: "Observation summary" });
    await user.click(screen.getByRole("button", { name: "Continue to Decode" }));

    expect(await screen.findByRole("heading", { name: "Logical decoding failure" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Decode did not preserve the logical state");
    expect(screen.getByLabelText("Correction, qubit 3: X")).toBeInTheDocument();
    expect(screen.getByLabelText("Residual, qubit 3: X")).toBeInTheDocument();
    expect(screen.getByText("Logical operation — decoding failed")).toBeInTheDocument();
    expect(screen.getByText("Residual signals").parentElement).toHaveTextContent("0");
  });
});
