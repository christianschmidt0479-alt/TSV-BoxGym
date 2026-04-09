/**
 * recover-trainers.mjs
 * Stellt die 4 gelöschten Trainer-Konten wieder her.
 * Gefundene E-Mails aus Resend-API-Logs (gesendete Verifizierungs-/Freigabe-Mails).
 *
 * Temporäres Passwort für alle: BoxGym2026!
 * Bitte danach im Verwaltungsbereich ändern.
 *
 * Thomas Schütze UUID = c41ea3bb-037c-43a8-91d8-bdf3fd1dd5af (KI-Profil noch vorhanden)
 */

import bcrypt from "bcryptjs"

const SUPABASE_URL = "https://yljisaoxokxfgmzjmddy.supabase.co"
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY fehlt. Export setzen und erneut ausführen.")
  process.exit(1)
}

const TEMP_PASSWORD = "BoxGym2026!"

const TRAINERS = [
  {
    id: undefined, // neue UUID
    first_name: "Clara",
    last_name: "Ullrich",
    email: "clara.ullrich@tsv-falkensee.de",
    role: "trainer",
  },
  {
    id: undefined,
    first_name: "Konstantin",
    last_name: "Buga",
    email: "konstantin.buga@tsv-falkensee.de",
    role: "trainer",
  },
  {
    id: undefined,
    first_name: "Pawel",
    last_name: "Kotelnikow",
    email: "pawel.kotelnikow@tsv-falkensee.de",
    role: "trainer",
  },
  {
    id: "c41ea3bb-037c-43a8-91d8-bdf3fd1dd5af", // UUID erhalten wegen KI-Profil
    first_name: "Thomas",
    last_name: "Schütze",
    email: "rex84651@gmail.com",
    role: "trainer",
  },
]

async function main() {
  const dryRun = !process.argv.includes("--apply")

  if (dryRun) {
    console.log("=== DRY RUN – kein INSERT wird ausgeführt. Mit --apply starten. ===\n")
  } else {
    console.log("=== APPLY MODE – füge Trainer-Konten ein ===\n")
  }

  const now = new Date().toISOString()
  const results = []

  for (const trainer of TRAINERS) {
    const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 10)

    const payload = {
      first_name: trainer.first_name,
      last_name: trainer.last_name,
      email: trainer.email,
      password_hash: passwordHash,
      email_verified: true,
      email_verified_at: now,
      email_verification_token: null,
      is_approved: true,
      approved_at: now,
      role: trainer.role,
      trainer_license: "Keine DOSB-Lizenz",
      created_at: now,
    }

    if (trainer.id) {
      payload.id = trainer.id
    }

    console.log(`→ ${trainer.first_name} ${trainer.last_name} <${trainer.email}>`)
    if (trainer.id) {
      console.log(`  UUID: ${trainer.id} (KI-Profil-Verknüpfung)`)
    }

    if (dryRun) {
      console.log(`  [DRY RUN] würde einfügen:`, JSON.stringify(payload, null, 2))
      results.push({ name: `${trainer.first_name} ${trainer.last_name}`, ok: true, dryRun: true })
      continue
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/trainer_accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error(`  ❌ Fehler: ${res.status} – ${err}`)
      results.push({ name: `${trainer.first_name} ${trainer.last_name}`, ok: false, error: err })
    } else {
      const data = await res.json()
      const inserted = Array.isArray(data) ? data[0] : data
      console.log(`  ✅ Eingefügt – ID: ${inserted?.id}`)
      results.push({ name: `${trainer.first_name} ${trainer.last_name}`, ok: true, id: inserted?.id })
    }
  }

  console.log("\n=== Zusammenfassung ===")
  for (const r of results) {
    const status = r.ok ? (r.dryRun ? "DRY RUN" : "✅") : "❌"
    console.log(`${status} ${r.name}${r.id ? ` (${r.id})` : ""}${r.error ? ` – ${r.error}` : ""}`)
  }

  if (dryRun) {
    console.log("\nMit --apply ausführen zum tatsächlichen Einfügen.")
  } else {
    console.log(`\nTemporäres Passwort für alle Trainer: ${TEMP_PASSWORD}`)
    console.log("Bitte unter /verwaltung/trainer/[id]/bearbeiten ändern.")
  }
}

main().catch((err) => {
  console.error("Unerwarteter Fehler:", err)
  process.exit(1)
})
