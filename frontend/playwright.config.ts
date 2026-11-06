import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const python =
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5184",
    channel: process.env.PLAYWRIGHT_CHANNEL,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port 8011`,
      cwd: path.join(directory, "../backend"),
      env: {
        QLDPC_EXPERIMENT_DB: path.join(
          directory,
          "../tmp/e2e-experiments.sqlite3",
        ),
        QLDPC_FRONTEND_ORIGINS: "http://127.0.0.1:5184",
      },
      url: "http://127.0.0.1:8011/api/system/status",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev -- --port 5184",
      env: { VITE_API_URL: "http://127.0.0.1:8011" },
      url: "http://127.0.0.1:5184",
      reuseExistingServer: false,
    },
  ],
});
