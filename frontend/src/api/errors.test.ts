import { describe, expect, it } from "vitest";
import { apiError } from "./errors";

describe("API error messages", () => {
  it("makes structured validation failures readable", async () => {
    const response = new Response(
      JSON.stringify({
        detail: [
          {
            loc: ["body", "trials_per_probability"],
            msg: "Input should be greater than or equal to 1",
          },
        ],
      }),
      { status: 422 },
    );
    expect((await apiError(response, "Request failed")).message).toBe(
      "trials per probability: Input should be greater than or equal to 1",
    );
  });

  it("keeps an explanatory server message", async () => {
    expect(
      (
        await apiError(
          new Response(
            JSON.stringify({ detail: "The saved code version has changed." }),
          ),
          "Request failed",
        )
      ).message,
    ).toBe("The saved code version has changed.");
  });

  it("handles a non-JSON server failure", async () => {
    expect(
      (
        await apiError(
          new Response("Service unavailable", { status: 503 }),
          "Backend unavailable. Try again.",
        )
      ).message,
    ).toBe("Backend unavailable. Try again.");
  });
});
