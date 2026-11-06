import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function reachObserve(page: Page, errors: number[] = []) {
  await page.goto("/");
  await page.getByRole("heading", { name: "Selected code" }).waitFor();
  await page.getByRole("button", { name: "Save setup", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue to error selection" })
    .click();
  for (const qubit of errors)
    await page
      .getByRole("button", {
        name: `Qubit ${qubit}, currently I; apply X`,
        exact: true,
      })
      .click();
  await page
    .getByRole("button", {
      name: errors.length ? "Save error selection" : "Save with no errors",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Continue to Observe" }).click();
  await page.getByRole("heading", { name: "Observation summary" }).waitFor();
}

test("real workflow compares decoders, downloads reproducible results, and reopens saved failures", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await reachObserve(page, [1]);
  await page.getByRole("button", { name: "Trace Z1 on qubits" }).click();
  await expect(page.getByLabel("Qubit 1: X", { exact: true })).toHaveClass(
    /qubit-in-check/,
  );
  await page.screenshot({
    path: testInfo.outputPath("observe-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue to Decode" }).click();
  await expect(
    page.getByRole("heading", { name: "Logical information preserved" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Decoder", exact: true })
    .selectOption("bp-osd-css-v1");
  await expect(
    page.getByRole("heading", { name: "BP+OSD CSS decoder" }),
  ).toBeVisible();
  await expect(page.getByText("Not enumerated by BP+OSD")).toHaveCount(2);
  await page.screenshot({
    path: testInfo.outputPath("decode-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue to Results" }).click();
  await page
    .getByRole("combobox", { name: "Decoder", exact: true })
    .selectOption("exact-css-min-weight-v1");
  await page
    .getByRole("textbox", { name: "Physical error probabilities" })
    .fill("0, 0.1, 0.3");
  await page
    .getByRole("spinbutton", { name: "Trials per probability" })
    .fill("60");
  await page.getByRole("spinbutton", { name: "Random seed" }).fill("42");
  await page.getByRole("button", { name: "Start batch experiment" }).click();
  await expect(
    page.getByRole("heading", { name: "Where decoder outcomes differ" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page
      .getByRole("region", { name: "Batch experiment values" })
      .getByRole("row"),
  ).toHaveCount(7);

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download JSON" }).click();
  const downloaded = await jsonDownload;
  const payload = JSON.parse(
    await readFile((await downloaded.path())!, "utf8"),
  );
  expect(payload.result.total_trials_completed).toBe(180);
  expect(payload.result.comparison.decoder_id).toBe("bp-osd-css-v1");
  expect(typeof payload.result.saved_failures[0].trial_seed).toBe("string");
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV" }).click();
  expect(await readFile((await (await csvDownload).path())!, "utf8")).toContain(
    "bp-osd-css-v1",
  );
  await page.screenshot({
    path: testInfo.outputPath("results-desktop.png"),
    fullPage: true,
  });

  await page.getByText("Failure 1", { exact: true }).first().click();
  await page
    .getByRole("button", { name: "Inspect this error in Observe" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Observation summary" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to saved results" }).click();
  await expect(
    page.getByRole("heading", { name: "Where decoder outcomes differ" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Set up another run", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /seed 42.*Decoder comparison/ }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /seed 42.*Decoder comparison/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Where decoder outcomes differ" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("results-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("explains stabilizer success and silent logical failure", async ({
  page,
}) => {
  await reachObserve(page, [1, 4]);
  await page.getByRole("button", { name: "Continue to Decode" }).click();
  await expect(
    page.getByRole("heading", { name: "Logical information preserved" }),
  ).toBeVisible();
  await expect(
    page.getByText("Stabilizer — logical state preserved", { exact: true }),
  ).toBeVisible();
  await reachObserve(page, [1, 2]);
  await page.getByRole("button", { name: "Continue to Decode" }).click();
  await expect(
    page.getByRole("heading", { name: "Logical decoding failure" }),
  ).toBeVisible();
  await expect(
    page.getByText("Residual signals", { exact: true }).locator(".."),
  ).toContainText("0");
});

test("reports a lost polling connection and exports a cancelled comparison", async ({ page }) => {
  await reachObserve(page);
  await page.getByRole("button", { name: "Continue to Decode" }).click();
  await page.getByRole("button", { name: "Continue to Results" }).click();
  await page.getByRole("textbox", { name: "Physical error probabilities" }).fill("0.3");
  await page.getByRole("spinbutton", { name: "Trials per probability" }).fill("100000");
  await page.route("**/api/experiments/*", (route) => route.request().method() === "GET" ? route.abort() : route.continue());
  await page.getByRole("button", { name: "Start batch experiment" }).click();
  await expect(page.getByRole("alert")).toContainText("Connection lost. Retrying automatically");
  await page.unroute("**/api/experiments/*");
  await page.getByRole("button", { name: "Stop experiment", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Logical-error rate by physical error probability" })).toBeVisible();
  await expect(page.getByText("Run stopped", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download JSON" }).click();
  const result = JSON.parse(await readFile((await (await download).path())!, "utf8")).result;
  expect(result.cancelled).toBe(true);
  expect(result.total_trials_completed).toBeLessThan(100000);
  expect(result.comparison.total_trials_completed).toBe(result.total_trials_completed);
});
