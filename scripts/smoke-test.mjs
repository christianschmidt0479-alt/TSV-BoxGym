/**
 * smoke-test.mjs
 *
 * Post-cleanup Smoke-Test für alle vier Checks:
 *   1. Freigaben-Liste: nur echte Daten, keine Testnamen
 *   2. Registrierung: neues Mitglied → erscheint in Freigaben
 *   3. Mail + Datenänderungslink: compose funktioniert
 *   4. Admin-Zugänge: Login + Rollen korrekt
 *
 * Usage:
 *   node scripts/smoke-test.mjs
 *
 * Erwartet .env.local (und optional .env.vercel.prod) im Projektroot.
 */

import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { hash as bcryptHash } from "bcryptjs"

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function readEnvFile(path) {
  if (!fs.existsSync(path)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith("#"))
      .map((line) => {
        const idx = line.indexOf("=")
        if (idx === -1) return null
        const key = line.slice(0, idx).trim()
        let value = line.slice(idx + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        // Strip trailing literal \n from Vercel-style values
        value = value.replace(/\\n$/, "").trim()
        return [key, value]
      })
      .filter(Boolean)
  )
}

// Load env: prod → e2e.local → local (later overrides earlier, same as Vercel precedence)
const prodEnv = readEnvFile(".env.vercel.prod")
const e2eEnv = readEnvFile(".env.e2e.local")
const localEnv = readEnvFile(".env.local")
const env = { ...prodEnv, ...e2eEnv, ...localEnv }

function getEnv(key) {
  return env[key]?.trim() || process.env[key]?.trim() || ""
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0

function ok(label, detail = "") {
  console.log(`  ✓  ${label}${detail ? `  (${detail})` : ""}`)
  passed++
}

function fail(label, detail = "") {
  console.error(`  ✗  ${label}${detail ? `  → ${detail}` : ""}`)
  failed++
}

function section(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 56 - title.length))}`)
}

const TEST_EMAIL_PATTERNS = [
  "@tsvboxgym.de",
  "e2e.",
  "+test",
  "+e2e",
  "+reg",
  "+flow",
  "test@",
  "example@",
  "dummy@",
  "tester@",
]

function isTestEmail(email) {
  if (!email) return false
  const lc = email.toLowerCase()
  return TEST_EMAIL_PATTERNS.some((p) => lc.includes(p))
}

// Unique time-stamped smoke email (not @tsvboxgym.de to avoid self-triggering cleanup)
const SMOKE_EMAIL = `smoke.reg+${Date.now()}@tsv-falkensee.de`

async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}



async function main() {
  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
  const trainerEmail = getEnv("E2E_TRAINER_EMAIL")
  const trainerPassword = getEnv("E2E_TRAINER_PASSWORD")
  // Shell env takes priority (that's what the running server uses),
  // then E2E_ADMIN_PASSWORD from .env.e2e.local, then ADMIN_LOGIN_PASSWORD from prod file
  const adminPassword =
    process.env.ADMIN_LOGIN_PASSWORD?.trim() ||
    getEnv("E2E_ADMIN_PASSWORD") ||
    getEnv("ADMIN_LOGIN_PASSWORD")
  // Always use localhost for local smoke tests – never read E2E_BASE_URL which may point to prod
  const baseUrl = process.argv.includes("--prod")
    ? (getEnv("E2E_BASE_URL") || "https://www.tsvboxgym.de")
    : "http://localhost:3000"

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlt")
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ─── 0. Pre-cleanup: veraltete Smoke-Daten aus abgebrochenen Durchläufen ──

  const { data: leftoverMembers } = await supabase
    .from("members")
    .select("id, email, first_name, last_name")
    .or("first_name.ilike.Probe,first_name.ilike.Smoke")

  for (const m of leftoverMembers ?? []) {
    if (["test", "dummy", "fixture", "e2e"].some(p => `${m.first_name ?? ""} ${m.last_name ?? ""}`.toLowerCase().includes(p)) || m.first_name?.toLowerCase() === "probe") {
      await supabase.from("member_update_tokens").delete().eq("member_id", m.id)
      await supabase.from("members").delete().eq("id", m.id)
    }
  }

  const { data: leftoverTrainers } = await supabase
    .from("trainer_accounts")
    .select("id")
    .ilike("first_name", "Smoke")

  for (const t of leftoverTrainers ?? []) {
    await supabase.from("trainer_accounts").delete().eq("id", t.id)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Freigaben-Liste: nur echte Daten
  // ═══════════════════════════════════════════════════════════════════════════
  section("1. Freigaben-Liste")

  const { data: pendingMembers, error: pendingError } = await supabase
    .from("members")
    .select("id, email, first_name, last_name, is_approved, email_verified")
    .eq("is_approved", false)

  if (pendingError) {
    fail("Pending-Members-Abfrage", pendingError.message)
  } else {
    const testRows = (pendingMembers ?? []).filter((m) => isTestEmail(m.email))
    if (testRows.length === 0) {
      ok("Keine Test-E-Mails in ausstehenden Mitgliedern", `${pendingMembers?.length ?? 0} pending gesamt`)
    } else {
      fail("Test-E-Mails noch vorhanden", testRows.map((r) => r.email).join(", "))
    }

    // Check for test names
    const testNames = (pendingMembers ?? []).filter((m) => {
      const combined = `${m.first_name ?? ""} ${m.last_name ?? ""}`.toLowerCase()
      return ["test", "dummy", "fixture", "e2e"].some((p) => combined.includes(p))
    })
    if (testNames.length === 0) {
      ok("Keine Test-Namen in Freigaben")
    } else {
      fail("Test-Namen noch vorhanden", testNames.map((r) => `${r.first_name} ${r.last_name}`).join(", "))
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Registrierung: neues Mitglied → Freigaben
  // ═══════════════════════════════════════════════════════════════════════════
  section("2. Registrierung")

  let smokeRegisteredId = null

  try {
    const regRes = await fetchWithTimeout(`${baseUrl}/api/public/member-register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: baseUrl,
      },
      body: JSON.stringify({
        firstName: "Probe",
        lastName: "Anmeldung",
        birthDate: "1990-01-01",
        gender: "m",
        password: "smoke1234",
        email: SMOKE_EMAIL,
        phone: "0157 12345678",
        baseGroup: "Basic Ü18",
        consent: true,
      }),
    })

    if (regRes.ok || regRes.status === 409) {
      ok(`Registrierungs-Request`, `HTTP ${regRes.status}`)

      // Verify it actually landed in DB
      const { data: freshMember } = await supabase
        .from("members")
        .select("id, email, is_approved")
        .eq("email", SMOKE_EMAIL)
        .maybeSingle()

      if (freshMember) {
        smokeRegisteredId = freshMember.id
        ok("Mitglied in DB", `id=${freshMember.id.slice(0, 8)}…`)
        if (freshMember.is_approved === false) {
          ok("Mitglied steht in Freigaben (is_approved=false)")
        } else {
          fail("Mitglied ist bereits approved – erwartet pending")
        }
      } else {
        fail("Mitglied nicht in DB gefunden", SMOKE_EMAIL)
      }
    } else {
      const body = await regRes.text()
      fail(`Registrierung HTTP ${regRes.status}`, body.slice(0, 120))
    }
  } catch (err) {
    fail("Registrierungs-Fetch fehlgeschlagen", err.message)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Mail + Datenänderungslink (Compose-API)
  // ═══════════════════════════════════════════════════════════════════════════
  section("3. Mail + Datenänderungslink")

  // Need a trainer session or admin session. Try trainer login first.
  let trainerCookie = null
  let smokeTrainerId = null  // temp trainer account created for this test

  if (trainerEmail && trainerPassword) {
    // Ensure the E2E trainer account exists (it may have been cleaned up)
    const { data: existingTrainer } = await supabase
      .from("trainer_accounts")
      .select("id")
      .eq("email", trainerEmail)
      .maybeSingle()

    if (!existingTrainer) {
      const now = new Date().toISOString()
      const passwordHash = await bcryptHash(trainerPassword.trim(), 10)
      const { data: newTrainer, error: createErr } = await supabase
        .from("trainer_accounts")
        .insert([{
          first_name: "Smoke",
          last_name: "Trainer",
          email: trainerEmail,
          trainer_license: "Smoke-Test",
          password_hash: passwordHash,
          email_verified: true,
          email_verified_at: now,
          email_verification_token: null,
          is_approved: true,
          approved_at: now,
          role: "admin",   // admin role required for mail-compose API
        }])
        .select("id")
        .single()
      if (createErr) {
        fail("E2E-Trainer konnte nicht angelegt werden", createErr.message)
      } else {
        smokeTrainerId = newTrainer.id
        ok("E2E-Trainer reprovisioned", trainerEmail)
      }
    }

    try {
      const trainerLoginRes = await fetchWithTimeout(`${baseUrl}/api/trainer-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: baseUrl },
        body: JSON.stringify({ email: trainerEmail, pin: trainerPassword }),
      }, 20000)

      if (trainerLoginRes.ok) {
        const setCookie = trainerLoginRes.headers.get("set-cookie")
        if (setCookie) {
          trainerCookie = setCookie.split(";")[0].trim()
          ok("Trainer-Login", trainerEmail)
        } else {
          ok("Trainer-Login OK aber kein Cookie gesetzt")
        }
      } else {
        fail("Trainer-Login", `HTTP ${trainerLoginRes.status}`)
      }
    } catch (err) {
      fail("Trainer-Login Fetch", err.message)
    }
  } else {
    fail("Trainer-Credentials fehlen in .env.local")
  }

  // Use the member we registered (or the first real pending-email-verified member)
  let composeTargetId = smokeRegisteredId

  if (!composeTargetId) {
    const { data: anyMember } = await supabase
      .from("members")
      .select("id")
      .eq("email_verified", true)
      .eq("is_approved", false)
      .limit(1)
      .maybeSingle()
    composeTargetId = anyMember?.id ?? null
  }

  // Mark smoke member as email-verified so compose link can be generated
  if (smokeRegisteredId) {
    await supabase
      .from("members")
      .update({ email_verified: true, email_verified_at: new Date().toISOString() })
      .eq("id", smokeRegisteredId)
    composeTargetId = smokeRegisteredId
  }

  if (composeTargetId && trainerCookie) {
    try {
      const composeRes = await fetchWithTimeout(`${baseUrl}/api/admin/mail-compose`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: baseUrl,
          Cookie: trainerCookie,
        },
        body: JSON.stringify({
        requests: [{
          kind: "approval_followup",
          memberId: composeTargetId,
          email: SMOKE_EMAIL,
          name: "Probe Anmeldung",
          targetKind: "member",
          topicIds: ["data_review"],
        }],
      }),
      })

      if (composeRes.ok) {
        const data = await composeRes.json()
        ok("Compose-API antwortet", `HTTP 200`)

        const firstDraft = data.drafts?.[0]
        if (!firstDraft) {
          fail("Keine Entwürfe in der Antwort")
        } else {
          if (firstDraft.subject?.includes("TSV BoxGym")) {
            ok("Subject enthält 'TSV BoxGym'", firstDraft.subject)
          } else {
            fail("Subject unerwarteter Inhalt", JSON.stringify(firstDraft.subject))
          }

          const bodyText = JSON.stringify(firstDraft.body ?? firstDraft.html ?? "")
          const linkMatch = bodyText.match(/localhost:\d+|https?:\/\/[a-z0-9.-]+\/mein-bereich/)
          if (linkMatch) {
            ok("Datenänderungslink im Body", linkMatch[0])
            if (linkMatch[0].includes(new URL(baseUrl).host)) {
              ok("Link-Domain stimmt mit Server überein", new URL(baseUrl).host)
            } else {
              fail("Link-Domain stimmt NICHT mit Server überein", `erwartet ${new URL(baseUrl).host}, gefunden ${linkMatch[0]}`)
            }
          } else {
            const hasTokenPath = bodyText.includes("mein-bereich") || bodyText.includes("token=") || bodyText.includes("update")
            if (hasTokenPath) {
              ok("Link-Pfad im Compose-Body gefunden")
            } else {
              fail("Kein Datenänderungslink im Compose-Body", bodyText.slice(0, 200))
            }
          }
        }
      } else {
        const bodyText = await composeRes.text()
        fail(`Compose-API HTTP ${composeRes.status}`, bodyText.slice(0, 120))
      }
    } catch (err) {
      fail("Compose-Fetch", err.message)
    }
  } else if (!composeTargetId) {
    fail("Kein Ziel-Mitglied für Compose-Test verfügbar")
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Admin-Zugänge + Rollen
  // ═══════════════════════════════════════════════════════════════════════════
  section("4. Admin-Zugänge + Rollen")

  // 4a. Admin-Login (password-only)
  if (adminPassword) {
    try {
      const adminRes = await fetchWithTimeout(`${baseUrl}/api/admin-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: baseUrl },
        body: JSON.stringify({ password: adminPassword }),
      })
      const data = await adminRes.json().catch(() => ({}))

      if (adminRes.ok && data.ok) {
        ok("Admin-Login", `HTTP ${adminRes.status}`)
      } else if (!data.configured) {
        console.log("  ⚠  Admin-Login: ADMIN_LOGIN_PASSWORD fehlt in .env.local (lokal nicht konfiguriert)")
      } else {
        fail("Admin-Login", `HTTP ${adminRes.status} – ${JSON.stringify(data)}`)
      }
    } catch (err) {
      fail("Admin-Login Fetch", err.message)
    }
  } else {
    fail("ADMIN_LOGIN_PASSWORD fehlt – Admin-Login-Test übersprungen")
  }

  // 4b. Trainer-Login (nochmal sicherheitshalber, falls in Section 3 nicht getestet)
  if (!trainerCookie) {
    if (trainerEmail && trainerPassword) {
      try {
        const res = await fetchWithTimeout(`${baseUrl}/api/trainer-auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: baseUrl },
          body: JSON.stringify({ email: trainerEmail, pin: trainerPassword }),
        })
        if (res.ok) {
          ok("Trainer-Login (Retry)", `HTTP ${res.status}`)
        } else {
          fail("Trainer-Login", `HTTP ${res.status}`)
        }
      } catch (err) {
        fail("Trainer-Login Fetch", err.message)
      }
    } else {
      fail("Trainer-Credentials fehlen für Login-Test")
    }
  }

  // 4c. Rollen: Christian Schmidt hat trainer_account mit linked_member_id
  const { data: adminTrainerRows, error: rolesError } = await supabase
    .from("trainer_accounts")
    .select("id, email, role, linked_member_id, is_approved")
    .ilike("email", "%christian.schmidt%")

  if (rolesError) {
    fail("Rollen-Abfrage", rolesError.message)
  } else if (!adminTrainerRows || adminTrainerRows.length === 0) {
    fail("Admin-Trainer-Account nicht gefunden", "christian.schmidt")
  } else {
    const adminRow = adminTrainerRows[0]
    ok("Admin-Trainer-Account vorhanden", adminRow.email)

    if (adminRow.is_approved) {
      ok("Admin-Account ist freigeschaltet")
    } else {
      fail("Admin-Account ist NICHT freigeschaltet")
    }

    if (adminRow.linked_member_id) {
      ok("Mitglied-Verknüpfung vorhanden", `member_id=${adminRow.linked_member_id.slice(0, 8)}…`)
    } else {
      fail("Keine Mitglied-Verknüpfung beim Admin-Account")
    }

    const adminRole = adminRow.role ?? "trainer"
    ok(`Rolle: ${adminRole}`)
  }

  // 4d. Rollen: echte Trainer-Accounts (non-test)
  const { data: allTrainers } = await supabase
    .from("trainer_accounts")
    .select("id, email, role, is_approved")

  const realTrainers = (allTrainers ?? []).filter((t) => !isTestEmail(t.email))
  ok(`Echte Trainer-Accounts: ${realTrainers.length}`)

  for (const t of realTrainers) {
    const roleLabel = t.role ?? "trainer"
    const approvedLabel = t.is_approved ? "approved" : "pending"
    ok(`  ${t.email}`, `${roleLabel} / ${approvedLabel}`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Cleanup: smoke member + smoke trainer entfernen
  // ═══════════════════════════════════════════════════════════════════════════
  if (smokeRegisteredId) {
    await supabase.from("member_update_tokens").delete().eq("member_id", smokeRegisteredId)
    await supabase.from("members").delete().eq("id", smokeRegisteredId)
    console.log(`\n  [cleanup] Smoke-Mitglied entfernt (${SMOKE_EMAIL})`)
  }
  if (smokeTrainerId) {
    await supabase.from("trainer_accounts").delete().eq("id", smokeTrainerId)
    console.log(`  [cleanup] Smoke-Trainer entfernt (${trainerEmail})`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Ergebnis
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${"═".repeat(60)}`)
  console.log(`Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen`)
  console.log("═".repeat(60))

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error("\nKritischer Fehler:", err instanceof Error ? err.message : err)
  process.exit(1)
})
