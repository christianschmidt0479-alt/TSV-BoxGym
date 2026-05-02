import { expect, test } from "@playwright/test"

import { postJson } from "./helpers"

async function parseJsonSafe(response: { text: () => Promise<string> }) {
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

test.describe("public production smoke", () => {
  test("public pages load and protected routes redirect", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveTitle(/TSV|BoxGym/i)

    await page.goto("/checkin")
    await expect(page.locator('input[type="email"]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
    await expect(page.getByRole("button", { name: /einchecken/i }).first()).toBeVisible()

    await page.goto("/checkin/mitglied")
    await expect(page.locator('input[type="email"]').first()).toBeVisible()

    await page.goto("/checkin/probetraining")
    await expect(page.locator('input[type="email"]').first()).toBeVisible()

    await page.goto("/trainer")
    await expect(page).toHaveURL(/\/trainer-zugang$/)

    await page.goto("/verwaltung-neu/checkin")
    await expect(page).toHaveURL(/\/trainer-zugang$/)
  })

  test("registration pages are reachable and render forms", async ({ page }) => {
    await page.goto("/registrieren/mitglied")
    await expect(page.locator('input[type="email"]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()

    await page.goto("/registrieren/probe")
    await expect(page.locator('input[type="email"]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
  })

  test("member area login page is reachable", async ({ page }) => {
    await page.goto("/mein-bereich/login")
    await expect(page.locator('input[type="email"]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
    await expect(page.getByRole("button", { name: /einloggen|login|anmelden/i }).first()).toBeVisible()
  })

  test("trainer-zugang is reachable", async ({ page }) => {
    await page.goto("/trainer-zugang")
    await expect(page.locator('input[type="email"]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
  })

  test("public APIs respond with expected smoke-test statuses", async ({ request }) => {
    const settingsResponse = await request.get("/api/public/checkin-settings")
    expect(settingsResponse.ok()).toBeTruthy()
    const settingsJson = await parseJsonSafe(settingsResponse)
    expect(settingsJson).toMatchObject({
      disableCheckinTimeWindow: expect.any(Boolean),
    })

    const sessionsResponse = await request.get("/api/public/sessions-today")
    expect(sessionsResponse.ok()).toBeTruthy()
    const sessionsJson = await parseJsonSafe(sessionsResponse)
    expect(sessionsJson).toMatchObject({
      data: expect.any(Array),
    })

    const todayCheckinsResponse = await postJson(request, "/api/public/today-checkins", {})
    expect(todayCheckinsResponse.ok()).toBeTruthy()
    const todayCheckinsJson = await parseJsonSafe(todayCheckinsResponse)
    expect(todayCheckinsJson).toMatchObject({
      rows: expect.any(Array),
    })

    const emptyMemberCheckinResponse = await postJson(request, "/api/public/member-checkin", {})
    expect(emptyMemberCheckinResponse.status()).toBe(400)

    const fastCheckinResponse = await request.get("/api/public/member-fast-checkin")
    expect(fastCheckinResponse.ok()).toBeTruthy()
    const fastCheckinJson = await parseJsonSafe(fastCheckinResponse)
    expect(fastCheckinJson).toMatchObject({
      remembered: expect.any(Boolean),
    })

    const emptyFastCheckinResponse = await postJson(request, "/api/public/member-fast-checkin", {})
    expect(emptyFastCheckinResponse.status()).toBe(400)

    const emptyTrialCheckinResponse = await postJson(request, "/api/public/trial-checkin", {})
    expect(emptyTrialCheckinResponse.status()).toBe(404)

    // Registration API: missing/invalid body must not produce 500
    const emptyRegisterResponse = await postJson(request, "/api/public/member-register", {})
    expect([400, 403]).toContain(emptyRegisterResponse.status())
  })
})
