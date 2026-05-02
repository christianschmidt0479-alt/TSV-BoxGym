import { expect, type APIRequestContext, type Page } from "@playwright/test"

export const trainerEmail = process.env.E2E_TRAINER_EMAIL?.trim() || ""
export const trainerPassword = process.env.E2E_TRAINER_PASSWORD?.trim() || ""
export const memberEmail = process.env.E2E_MEMBER_EMAIL?.trim().toLowerCase() || ""
export const memberPassword = process.env.E2E_MEMBER_PASSWORD?.trim() || ""
export const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim() || ""

function isConfiguredValue(value: string) {
  return Boolean(value && value !== "...")
}

export function hasTrainerCredentials() {
  return isConfiguredValue(trainerEmail) && isConfiguredValue(trainerPassword)
}

export function hasMemberCredentials() {
  return isConfiguredValue(memberEmail) && isConfiguredValue(memberPassword)
}

export function hasAdminPassword() {
  return isConfiguredValue(adminPassword)
}

export async function postJson(request: APIRequestContext, path: string, data: unknown) {
  return request.post(path, {
    data,
    headers: {
      "Content-Type": "application/json",
    },
  })
}

export async function loginTrainer(page: Page) {
  await page.goto("/trainer-zugang")
  await page.locator('input[type="email"]').first().fill(trainerEmail)
  await page.locator('input[type="password"]').first().fill(trainerPassword)
  await page.getByRole("button", { name: /einloggen|entsperren|login/i }).first().click()
  await page.waitForURL(/\/(trainer|verwaltung)(\/.*)?$/)
}

export async function loginMember(page: Page) {
  await page.goto("/mein-bereich/login")
  await page.locator('input[type="email"]').first().fill(memberEmail)
  await page.locator('input[type="password"]').first().fill(memberPassword)
  await page.getByRole("button", { name: /einloggen|mitgliederbereich öffnen|login/i }).first().click()

  const privacyButton = page.getByRole("button", { name: "Datenschutz akzeptieren und fortfahren" })
  if (await privacyButton.isVisible().catch(() => false)) {
    await page.getByRole("checkbox").check()
    await privacyButton.click()
  }

  await page.waitForURL(/\/mein-bereich(\/.*)?$/)
  await expect(page.locator("body")).toBeVisible()
}
