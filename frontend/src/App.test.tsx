import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const readyResponse = {
  service: "qldpc-codesign-explorer-api",
  api_version: "v1",
  status: "ready",
  capabilities: [
    {
      id: "workspace-shell",
      label: "Workspace shell",
      status: "ready",
      detail: "Application layout and workflow navigation are available.",
    },
    {
      id: "code-registry",
      label: "Verified code registry",
      status: "planned",
      detail: "The first verified CSS teaching fixture is the next implementation slice.",
    },
  ],
  model_boundaries: [],
};

describe("application foundation", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => readyResponse }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("presents the workflow and reports a connected foundation", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /a clear path from code structure/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /experiment workflow/i })).toBeInTheDocument();
    expect(screen.getByText("Configure")).toBeInTheDocument();
    expect(screen.getByText("Inject")).toBeInTheDocument();
    expect(screen.getByText("Observe")).toBeInTheDocument();
    expect(screen.getByText("Decode")).toBeInTheDocument();
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Verified code registry")).toBeInTheDocument();
  });

  it("explains an offline API and offers a recoverable retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockResolvedValueOnce({ ok: true, json: async () => readyResponse });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The interface is available, but the local API did not respond.",
    );

    const retryButton = screen.getByRole("button", { name: "Check again" });
    await user.click(retryButton);

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
