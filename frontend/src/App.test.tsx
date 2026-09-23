import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const summary = {
  id: "hgp_rep3_v1",
  name: "HGP repetition-3 teaching code",
  family: "Quantum LDPC",
  construction: "Hypergraph product",
  description: "A small, fully verified qLDPC fixture.",
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

describe("Configure stage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((request: string | URL | Request) => {
        const url = String(request);
        return url.endsWith("/api/codes") ? jsonResponse([summary]) : jsonResponse(codeDetail);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads one verified qLDPC fixture and presents calculated evidence", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Verified teaching fixture" })).toBeInTheDocument();
    expect(screen.getAllByText("HGP repetition-3 teaching code")).toHaveLength(2);
    expect(screen.getByLabelText("Code parameters")).toHaveTextContent("[[13, 1, 3]]");
    expect(screen.getByText("4/4 passed")).toBeInTheDocument();
    expect(screen.getByText("CSS orthogonality")).toBeInTheDocument();
    expect(screen.queryByText(/surface code/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/toric code/i)).not.toBeInTheDocument();
  });

  it("configures reproducible code-capacity noise and confirms the stage", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "Verified teaching fixture" });
    await user.click(screen.getByRole("radio", { name: /seeded code-capacity noise/i }));

    const probability = screen.getByRole("spinbutton", { name: /physical error probability/i });
    const seed = screen.getByRole("spinbutton", { name: /random seed/i });
    await user.clear(probability);
    await user.type(probability, "0.02");
    await user.clear(seed);
    await user.type(seed, "42");
    await user.click(screen.getByRole("button", { name: "Confirm configuration" }));

    expect(screen.getByRole("status")).toHaveTextContent("Configuration ready");
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText("p = 0.02")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit configuration" })).toBeInTheDocument();
  });

  it("keeps the failure recoverable when the fixture API is offline", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockImplementationOnce(() => jsonResponse([summary]))
      .mockImplementationOnce(() => jsonResponse(codeDetail));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The verified qLDPC fixture could not be loaded",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Verified teaching fixture" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
