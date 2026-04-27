import fs from "fs"
import { chromium } from "playwright"
import { createClient } from "@supabase/supabase-js"

const BASE_URL = "https://www.tsvboxgym.de"

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#")) continue
  const idx = line.indexOf("=")
  if (idx < 0) continue
  const key = line.slice(0, idx).trim()
  let value = line.slice(idx + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
  process.env[key] = value
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const stamp = Date.now()
const email = `ux.checkin.${stamp}@example.com`
const password = `UxPass!${stamp}`
let createdMemberId = null

async function registerMember() {
  const payload = {
    firstName: "UX",
    lastName: "Checkin",
    birthDate: "1996-01-11",
    gender: "male",
    password,
    email,
    phone: "+491701111111",
    baseGroup: "Basic Ü18",
    consent: true,
    registrationType: "member",
  }

  const res = await fetch(`${BASE_URL}/api/public/member-register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
      Referer: `${BASE_URL}/registrieren`,
    },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json?.memberId) throw new Error(`REGISTER_FAILED ${res.status} ${JSON.stringify(json)}`)

  createdMemberId = json.memberId
  const upd = await supabase.from("members").update({ email_verified: true, is_approved: true }).eq("id", createdMemberId)
  if (upd.error) throw upd.error
}

async function prepareRememberedDevice(context) {
  const response = await context.request.post(`${BASE_URL}/api/public/member-checkin`, {
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
      Referer: `${BASE_URL}/checkin/mitglied`,
    },
    data: {
      email,
      password,
      rememberDevice: true,
      source: "form",
    },
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result?.ok) {
    throw new Error(`PREP_CHECKIN_FAILED ${response.status} ${JSON.stringify(result)}`)
  }
}

async function measureAutoFlow(page) {
  const t0 = Date.now()
  await page.goto(`${BASE_URL}/checkin/mitglied?source=nfc`, { waitUntil: "domcontentloaded" })

  let loadingMs = null
  try {
    await page.getByText(/Check-in l.*uft/i).first().waitFor({ timeout: 1200 })
    loadingMs = Date.now() - t0
  } catch {
    loadingMs = null
  }

  let softSuccessMs = null
  try {
    await page.getByText(/Check-in fast abgeschlossen/i).first().waitFor({ timeout: 3500 })
    softSuccessMs = Date.now() - t0
  } catch {
    softSuccessMs = null
  }

  let mode = "auto"
  let outcome = "success"
  let reason = ""

  try {
    await page.getByText(/Check-in erfolgreich|Geschafft!/i).first().waitFor({ timeout: 3000 })
    const finalSuccessMs = Date.now() - t0
    const perceivedSuccessMs = softSuccessMs ?? finalSuccessMs
    return { loadingMs, softSuccessMs, finalSuccessMs, perceivedSuccessMs, mode, outcome, reason }
  } catch {
    mode = "fast-button"
  }

  const fastButton = page.getByRole("button", { name: /Jetzt einchecken|Schnell einchecken|Mitglied einchecken/i }).first()
  await fastButton.waitFor({ timeout: 7000 })

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/public/member-fast-checkin") && r.request().method() === "POST",
    { timeout: 15000 }
  )
  await fastButton.click()

  const response = await responsePromise
  const payload = await response.json().catch(() => ({}))

  if (response.ok && payload?.ok) {
    await page.getByText(/Check-in erfolgreich|Geschafft!/i).first().waitFor({ timeout: 12000 })
    const finalSuccessMs = Date.now() - t0
    const perceivedSuccessMs = softSuccessMs ?? finalSuccessMs
    return { loadingMs, softSuccessMs, finalSuccessMs, perceivedSuccessMs, mode, outcome, reason }
  }

  outcome = "error"
  reason = payload?.reason || payload?.error || `status_${response.status}`

  try {
    await page.getByText("Nicht erkannt", { exact: true }).first().waitFor({ timeout: 8000 })
  } catch {
    await page.locator("[class*='text-red']").first().waitFor({ timeout: 8000 })
  }

  const finalSuccessMs = Date.now() - t0
  const perceivedSuccessMs = softSuccessMs ?? finalSuccessMs
  return { loadingMs, softSuccessMs, finalSuccessMs, perceivedSuccessMs, mode, outcome, reason }
}

function toSeconds(ms) {
  if (typeof ms !== "number") return null
  return Number((ms / 1000).toFixed(3))
}

async function measureAutoNormalAndLte() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })

  await prepareRememberedDevice(context)

  if (createdMemberId) {
    await supabase.from("checkins").delete().eq("member_id", createdMemberId)
  }

  const normalPage = await context.newPage()
  const normal = await measureAutoFlow(normalPage)
  await normalPage.close()

  if (createdMemberId) {
    await supabase.from("checkins").delete().eq("member_id", createdMemberId)
  }

  const ltePage = await context.newPage()
  const client = await context.newCDPSession(ltePage)
  await client.send("Network.enable")
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 180,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (0.75 * 1024 * 1024) / 8,
    connectionType: "cellular4g",
  })
  const lte = await measureAutoFlow(ltePage)
  await ltePage.close()

  await browser.close()
  return { normal, lte }
}

async function measureErrorFlow() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()

  await page.goto(`${BASE_URL}/checkin/mitglied`, { waitUntil: "domcontentloaded" })
  await page.locator('input[type="email"]').first().fill(`unknown.${Date.now()}@example.com`)
  await page.locator('input[type="password"]').first().fill("0000")

  const t0 = Date.now()
  const submitButton = page.locator('button[type="submit"]').first()
  await submitButton.click()

  let feedbackVisible = true
  try {
    await Promise.any([
      page.getByText("Nicht erkannt", { exact: true }).first().waitFor({ timeout: 12000 }),
      page.getByText(/Mitgliedskonto|nicht gefunden/i).first().waitFor({ timeout: 12000 }),
      page.locator("[class*='text-red']").first().waitFor({ timeout: 12000 }),
    ])
  } catch {
    feedbackVisible = false
  }

  let registerVisible = false
  const registerLink = page.getByRole("link", { name: /Jetzt registrieren|TSV Mitglied|Probetraining/i }).first()
  try {
    await registerLink.waitFor({ timeout: 1000 })
    registerVisible = true
  } catch {
    registerVisible = false
  }

  const ms = Date.now() - t0
  await browser.close()
  return { ms, registerVisible, feedbackVisible }
}

async function measureFallback() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()

  const t0 = Date.now()
  await page.goto(`${BASE_URL}/checkin/mitglied`, { waitUntil: "domcontentloaded" })

  const button = page.getByRole("button", { name: /Jetzt einchecken|Schnell einchecken|Mitglied einchecken/i }).first()
  await button.waitFor({ timeout: 7000 })
  const enabled = await button.isEnabled()

  const input = page.locator('input[type="email"]').first()
  await input.waitFor({ timeout: 7000 })
  await input.focus()
  const inputFocused = await input.evaluate((el) => el === document.activeElement)

  const ms = Date.now() - t0
  await browser.close()
  return { ms, enabled, inputFocused }
}

async function cleanup() {
  if (!createdMemberId) return
  await supabase.from("checkins").delete().eq("member_id", createdMemberId)
  await supabase.from("members").delete().eq("id", createdMemberId)
}

try {
  await registerMember()
  const auto = await measureAutoNormalAndLte()
  const errorMs = await measureErrorFlow()
  const fallback = await measureFallback()

  const result = {
    autoFlow: {
      normalLoadingSeconds: toSeconds(auto.normal.loadingMs),
      normalSoftSuccessSeconds: toSeconds(auto.normal.softSuccessMs),
      normalFinalSuccessSeconds: toSeconds(auto.normal.finalSuccessMs),
      normalPerceivedSuccessSeconds: toSeconds(auto.normal.perceivedSuccessMs),
      normalMode: auto.normal.mode,
      normalOutcome: auto.normal.outcome,
      normalReason: auto.normal.reason,
      lteLoadingSeconds: toSeconds(auto.lte.loadingMs),
      lteSoftSuccessSeconds: toSeconds(auto.lte.softSuccessMs),
      lteFinalSuccessSeconds: toSeconds(auto.lte.finalSuccessMs),
      ltePerceivedSuccessSeconds: toSeconds(auto.lte.perceivedSuccessMs),
      lteMode: auto.lte.mode,
      lteOutcome: auto.lte.outcome,
      lteReason: auto.lte.reason,
    },
    errorFlowSeconds: Number((errorMs.ms / 1000).toFixed(3)),
    errorRegisterVisible: errorMs.registerVisible,
    errorFeedbackVisible: errorMs.feedbackVisible,
    fallback: {
      readySeconds: Number((fallback.ms / 1000).toFixed(3)),
      buttonEnabled: fallback.enabled,
      inputFocused: fallback.inputFocused,
    },
  }

  console.log("CHECKIN_UX_RESULTS", JSON.stringify(result, null, 2))
} finally {
  await cleanup()
}
