import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_WEB_URL ?? "http://localhost:3000";
const apiURL = process.env.E2E_API_URL ?? "http://localhost:4000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  ...(process.env.E2E_USE_RUNNING_SERVER
    ? {}
    : {
        webServer: [
          {
            command:
              "env PORT=4000 FRONTEND_URL=http://localhost:3000 pnpm --filter @alphasignal/api dev",
            cwd: "../..",
            url: `${apiURL}/health/live`,
            timeout: 120_000,
            reuseExistingServer: !process.env.CI,
          },
          {
            command: "env PORT=3000 HOSTNAME=127.0.0.1 pnpm --filter @alphasignal/web dev",
            cwd: "../..",
            url: `${baseURL}/api/health`,
            timeout: 120_000,
            reuseExistingServer: !process.env.CI,
          },
        ],
      }),
});
