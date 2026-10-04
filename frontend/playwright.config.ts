import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Isolated data dir for the fake backend started by webServer below, so a
// run never touches the user's real data/ (SPEC.md § 10.3).
// The env var pins one dir per run (the config is re-evaluated in workers) and
// tells e2e/global-teardown.ts what to remove.
process.env.E2E_DATA_DIR ??= path.join(os.tmpdir(), `studio-immagini-e2e-${Date.now()}`);
const dataDir = process.env.E2E_DATA_DIR;

export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile-375",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } },
    },
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: `uv run uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8100`,
    cwd: path.resolve(__dirname, "../backend"),
    env: {
      ENGINE_MODE: "fake",
      DATA_DIR: dataDir,
      PORT: "8100",
    },
    url: "http://127.0.0.1:8100/api/v1/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
