import { expect, test, type APIRequestContext } from "@playwright/test"

const adminEmail = process.env.GS_RESET_ADMIN_EMAIL?.trim() || ""
const adminPassword = process.env.GS_RESET_ADMIN_PASSWORD?.trim() || ""
const trainerOnlyEmail = process.env.GS_RESET_TRAINER_EMAIL?.trim() || ""
const trainerOnlyPassword = process.env.GS_RESET_TRAINER_PASSWORD?.trim() || ""

function hasAdminCredentials() {
  return Boolean(adminEmail && adminPassword)
}

function hasTrainerOnlyCredentials() {
  return Boolean(trainerOnlyEmail && trainerOnlyPassword)
}

async function loginViaApi(request: APIRequestContext, email: string, password: string) {
  return request.post("/api/trainer-login", {
    data: { email, password },
    headers: {
      "Content-Type": "application/json",
    },
  })
}

test.describe("GS reset protection", () => {
  test("reset patch without session is unauthorized", async ({ request }) => {
    const response = await request.patch("/api/admin/excel-abgleich", {
      data: { action: "reset-member-office-status" },
      headers: {
        "Content-Type": "application/json",
      },
    })

    expect(response.status()).toBe(401)
  })

  test("admin session can execute reset patch", async ({ request }) => {
    test.skip(!hasAdminCredentials(), "GS reset admin credentials not configured")

    const loginResponse = await loginViaApi(request, adminEmail, adminPassword)
    expect(loginResponse.status()).toBe(200)

    const body = await loginResponse.json().catch(() => ({}))
    expect(body).toMatchObject({ ok: true, role: "admin" })

    const resetResponse = await request.patch("/api/admin/excel-abgleich", {
      data: { action: "reset-member-office-status" },
      headers: {
        "Content-Type": "application/json",
      },
    })

    expect(resetResponse.status()).toBe(200)
  })

  test("trainer-only session cannot execute reset and cannot access admin page", async ({ request }) => {
    test.skip(!hasTrainerOnlyCredentials(), "GS reset trainer-only credentials not configured")

    const loginResponse = await loginViaApi(request, trainerOnlyEmail, trainerOnlyPassword)
    expect(loginResponse.status()).toBe(200)

    const body = await loginResponse.json().catch(() => ({}))
    expect(body).toMatchObject({ ok: true, role: "trainer" })

    const resetResponse = await request.patch("/api/admin/excel-abgleich", {
      data: { action: "reset-member-office-status" },
      headers: {
        "Content-Type": "application/json",
      },
    })

    expect([401, 403]).toContain(resetResponse.status())

    // Trainer must not be able to trigger GS sync
    const syncResponse = await request.post("/api/admin/excel-abgleich/sync", {
      data: { mode: "dry_run" },
      headers: { "Content-Type": "application/json" },
    })
    expect([401, 403]).toContain(syncResponse.status())

    const pageResponse = await request.get("/verwaltung-neu/gs-abgleich", { maxRedirects: 0 })
    const pageStatus = pageResponse.status()
    const location = pageResponse.headers()["location"] || ""

    const blockedByStatus = [401, 403].includes(pageStatus)
    const blockedByRedirect = [302, 303, 307, 308].includes(pageStatus) && !location.includes("/verwaltung-neu/gs-abgleich")

    expect(blockedByStatus || blockedByRedirect).toBeTruthy()
  })
})