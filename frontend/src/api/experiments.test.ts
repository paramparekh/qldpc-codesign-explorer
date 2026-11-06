import { afterEach, expect, it, vi } from "vitest";
import { getExperiment } from "./experiments";

afterEach(() => vi.unstubAllGlobals());

it("advances an active saved-batch run after reading its checkpoint", async () => {
  const queued = { id: "run", status: "queued", execution_mode: "request_chunks" };
  const completed = { ...queued, status: "completed" };
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(queued)))
    .mockResolvedValueOnce(new Response(JSON.stringify(completed)));
  vi.stubGlobal("fetch", fetch);
  expect(await getExperiment("run")).toEqual(completed);
  expect(fetch.mock.calls[1][0]).toContain("/api/experiments/run/advance");
  expect(fetch.mock.calls[1][1].method).toBe("POST");
});

it.each(["completed", "cancelled", "failed"])("does not advance a %s run", async (status) => {
  const saved = { id: "run", status, execution_mode: "request_chunks" };
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(saved)));
  vi.stubGlobal("fetch", fetch);
  expect(await getExperiment("run")).toEqual(saved);
  expect(fetch).toHaveBeenCalledTimes(1);
});
