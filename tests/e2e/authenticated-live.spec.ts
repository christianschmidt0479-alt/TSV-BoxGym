import { expect, test } from "@playwright/test"

import {
  adminPassword,
  hasAdminPassword,
  hasMemberCredentials,
  hasTrainerCredentials,
  loginMember,
  loginTrainer,
  postJson,
} from "./helpers"

async function parseJsonSafe(response: { text: () => Promise<string> }) {
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

test.describe("authenticated live smoke", () => {
  test("trainer login opens protected area", async ({ page }) => {
    test.skip(!hasTrainerCredentials(), "Trainer credentials not configured")

    await loginTrainer(page)
    await expect(page).toHaveURL(/\/(trainer|verwaltung)(\/.*)?$/)
    await expect(page.locator("body")).toBeVisible()
  })

  test("member login opens profile area", async ({ page }) => {
    test.skip(!hasMemberCredentials(), "Member credentials not configured")

    await loginMember(page)
    await expect(page).toHaveURL(/\/mein-bereich(\/.*)?$/)
    await expect(page.locator("body")).toBeVisible()
  })

  test("legacy admin password endpoint accepts configured smoke-test password", async ({ request }) => {
    test.skip(!hasAdminPassword(), "Admin password not configured")

    const response = await postJson(request, "/api/admin-auth", {
      password: adminPassword,
    })

    expect(response.ok()).toBeTruthy()
    const body = await parseJsonSafe(response)
    expect(body).toMatchObject({
      ok: true,
      configured: true,
    })
  })
})
