import { loadEnvConfig } from "@next/env"
import { defineConfig } from "@playwright/test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

loadEnvConfig(process.cwd())

const e2eEnvPath = resolve(process.cwd(), ".env.e2e")
if (existsSync(e2eEnvPath)) {
  const lines = readFileSync(e2eEnvPath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const equalsIndex = trimmed.indexOf("=")
    if (equalsIndex <= 0) continue
    const key = trimmed.slice(0, equalsIndex).trim()
    const value = trimmed.slice(equalsIndex + 1)
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

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
