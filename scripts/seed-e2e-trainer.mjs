/**
 * Seed-Skript: Legt einen klar markierten E2E-Testtrainer an (nur trainer-Rolle, kein admin).
 * Sicheres Testpasswort wird aus Env-Var E2E_TRAINER_PASSWORD gelesen oder aus Argument.
 * Verändert keine Produktivkonten.
 *
 * Verwendung:
 *   node scripts/seed-e2e-trainer.mjs [passwort]
 *   oder E2E_TRAINER_PASSWORD=xxx node scripts/seed-e2e-trainer.mjs
 */

import { createClient } from "@supabase/supabase-js"
import crypto from "node:crypto"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const E2E_EMAIL = "test+trainer-only@tsvboxgym.de"
const E2E_FIRST = "E2E"
const E2E_LAST = "TrainerOnly"
const E2E_PASSWORD = process.argv[2] || process.env.E2E_TRAINER_PASSWORD || "E2ETrainerOnly!2026"

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// bcrypt-compatible SHA256 password hash via Supabase auth admin API
async function run() {
  console.log("Prüfe ob E2E-Testtrainer bereits vorhanden...")

  const { data: existing, error: fetchErr } = await supabase
    .from("trainer_accounts")
    .select("id, email, role, is_approved, email_verified")
    .eq("email", E2E_EMAIL)
    .maybeSingle()

  if (fetchErr) {
    console.error("Fehler beim Prüfen:", fetchErr.message)
    process.exit(1)
  }

  if (existing) {
    console.log("E2E-Testtrainer bereits vorhanden:", {
      id: existing.id,
      email: existing.email,
      role: existing.role,
      is_approved: existing.is_approved,
      email_verified: existing.email_verified,
    })
    console.log("Kein neues Konto angelegt. Falls Passwort-Reset nötig: Hash separat setzen.")
    process.exit(0)
  }

  console.log("Lege E2E-Testtrainer an:", E2E_EMAIL)

  // Hash the password with SHA-256 for the password_hash column
  const passwordHash = crypto.createHash("sha256").update(E2E_PASSWORD).digest("hex")

  const { data: inserted, error: insertErr } = await supabase
    .from("trainer_accounts")
    .insert({
      first_name: E2E_FIRST,
      last_name: E2E_LAST,
      email: E2E_EMAIL,
      password_hash: passwordHash,
      role: "trainer",
      is_approved: true,
      email_verified: true,
    })
    .select("id, email, account_role, is_approved, email_verified")
    .single()

  if (insertErr) {
    console.error("Fehler beim Anlegen:", insertErr.message)
    process.exit(1)
  }

  console.log("E2E-Testtrainer erfolgreich angelegt:", inserted)
}

run()
