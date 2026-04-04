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

test.describe("authenticated live smoke", () => {
  test("trainer login opens protected area", async ({ page }) => {
    test.skip(!hasTrainerCredentials(), "Trainer credentials not configured")

    await loginTrainer(page)
    await expect(page).toHaveURL(/\/(trainer|verwaltung)(\/.*)?$/)
  })

  test("member login opens profile area", async ({ page }) => {
    test.skip(!hasMemberCredentials(), "Member credentials not configured")

    await loginMember(page)
    await expect(page.getByRole("heading", { name: "Sportlerprofil" })).toBeVisible()
  })

  test("legacy admin password endpoint accepts configured smoke-test password", async ({ request }) => {
    test.skip(!hasAdminPassword(), "Admin password not configured")

    const response = await postJson(request, "/api/admin-auth", {
      password: adminPassword,
    })

    expect(response.ok()).toBeTruthy()
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      configured: true,
    })
  })
})
