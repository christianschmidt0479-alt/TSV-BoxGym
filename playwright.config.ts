import { loadEnvConfig } from "@next/env"
import { defineConfig } from "@playwright/test"

loadEnvConfig(process.cwd())

const baseURL = process.env.E2E_BASE_URL?.trim() || "https://www.tsvboxgym.de"

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    extraHTTPHeaders: {
      Origin: baseURL,
      Referer: `${baseURL}/checkin`,
    },
  },
})
