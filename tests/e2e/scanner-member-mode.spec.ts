import { expect, test, type Page } from "@playwright/test"

const scannerAdminEmail = process.env.E2E_SCANNER_ADMIN_EMAIL?.trim() || ""
const scannerAdminPassword = process.env.E2E_SCANNER_ADMIN_PASSWORD?.trim() || ""
const scannerMemberToken = process.env.E2E_MEMBER_QR_TOKEN?.trim() || ""
const scannerMemberName = process.env.E2E_MEMBER_DISPLAY_NAME?.trim() || process.env.E2E_MEMBER_NAME?.trim() || ""
const scannerMemberGroup = process.env.E2E_MEMBER_GROUP?.trim() || ""

function hasScannerEnv() {
  return Boolean(scannerAdminEmail && scannerAdminPassword && scannerMemberToken && scannerMemberName && scannerMemberGroup)
}

async function loginScannerAdmin(page: Page) {
  await page.goto("/trainer-zugang")
  await page.locator('input[type="email"]').fill(scannerAdminEmail)
  await page.locator('input[type="password"]').fill(scannerAdminPassword)
  await page.getByRole("button", { name: "Einloggen" }).click()
  await page.waitForURL(/\/verwaltung-neu(\/.*)?$/)
}

test.describe("scanner member mode", () => {
  test("shows member details without triggering checkin", async ({ page }) => {
    test.skip(!hasScannerEnv(), "Scanner E2E env not configured")

    const checkinRequests: string[] = []
    page.on("request", (request) => {
      const url = request.url()
      if (url.includes("/api/public/member-checkin") || url.includes("/api/v2/checkin/member")) {
        checkinRequests.push(url)
      }
    })

    await loginScannerAdmin(page)
    await page.goto("/verwaltung-neu/tools/scanner")

    await page.getByTestId("scanner-mode-member").click()
    await expect(page.getByText("AKTIVER MODUS: MITGLIEDER-QR PRUEFEN")).toBeVisible()

    await page.evaluate((value) => {
      window.dispatchEvent(new CustomEvent("tsvboxgym:scanner-test-decode", {
        detail: { value },
      }))
    }, scannerMemberToken)

    await expect(page.getByTestId("scanner-latest-result")).toContainText(scannerMemberToken)
    await expect(page.getByTestId("scanner-status-panel")).toContainText("Mitglied erkannt.")
    await expect(page.getByTestId("scanner-member-result")).toContainText(scannerMemberName)
    await expect(page.getByTestId("scanner-member-result")).toContainText(scannerMemberGroup)
    expect(checkinRequests).toEqual([])
  })
})