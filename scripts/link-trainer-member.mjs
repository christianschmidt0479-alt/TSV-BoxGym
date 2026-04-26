#!/usr/bin/env node
/**
 * link-trainer-member.mjs
 *
 * Verknüpft Christian Schmidt als Trainer + Member in Supabase.
 * Führt alle Schritte automatisch aus:
 *   1. Member-ID suchen
 *   2. Trainer prüfen (existiert oder nicht)
 *   3. Trainer anlegen (Fall B) oder verknüpfen (Fall A)
 *   4. email_verified sicherstellen
 *   5. Final-Check ausgeben
 *
 * Ausführen: node scripts/link-trainer-member.mjs
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = "https://yljisaoxokxfgmzjmddy.supabase.co"
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY fehlt. Bitte via dotenv oder direkt setzen.")
  process.exit(1)
}

const TARGET_EMAIL = "christian.schmidt@tsv-falkensee.de"

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function run() {
  console.log(`\n🔍 1. Member suchen: ${TARGET_EMAIL}`)
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, email")
    .eq("email", TARGET_EMAIL)
    .maybeSingle()

  if (memberError) throw memberError
  if (!member) {
    console.error("❌ Kein Member gefunden. Bitte zuerst registrieren.")
    process.exit(1)
  }
  console.log(`✅ Member gefunden: ${member.id}`)

  console.log(`\n🔍 2. Trainer prüfen: ${TARGET_EMAIL}`)
  const { data: trainer, error: trainerError } = await supabase
    .from("trainer_accounts")
    .select("*")
    .eq("email", TARGET_EMAIL)
    .maybeSingle()

  if (trainerError) throw trainerError

  if (trainer) {
    console.log(`ℹ️  Trainer existiert (ID: ${trainer.id}) → Fall A: Verknüpfen`)

    const { error: updateError } = await supabase
      .from("trainer_accounts")
      .update({ linked_member_id: member.id, email_verified: true })
      .eq("email", TARGET_EMAIL)

    if (updateError) throw updateError
    console.log(`✅ linked_member_id gesetzt + email_verified = true`)
  } else {
    console.log(`ℹ️  Kein Trainer gefunden → Fall B: Anlegen`)

    const { error: insertError } = await supabase.from("trainer_accounts").insert({
      email: TARGET_EMAIL,
      role: "admin",
      is_approved: true,
      email_verified: true,
      linked_member_id: member.id,
    })

    if (insertError) throw insertError
    console.log(`✅ Trainer-Account angelegt als admin`)
  }

  console.log(`\n🔍 5. Final-Check`)
  const { data: final, error: finalError } = await supabase
    .from("trainer_accounts")
    .select("id, email, role, is_approved, email_verified, linked_member_id, created_at")
    .eq("email", TARGET_EMAIL)
    .maybeSingle()

  if (finalError) throw finalError
  console.log("\n──────────────────────────────────────")
  console.log("ERGEBNIS:")
  console.log(JSON.stringify(final, null, 2))
  console.log("──────────────────────────────────────")
  console.log(`\n✅ Member-ID:  ${member.id}`)
  console.log(`✅ Trainer-ID: ${final?.id}`)
  console.log(`✅ linked_member_id: ${final?.linked_member_id}`)

  if (final?.linked_member_id !== member.id) {
    console.warn("⚠️  WARNUNG: linked_member_id stimmt nicht mit Member-ID überein!")
  } else {
    console.log("✅ Verknüpfung korrekt")
  }
}

run().catch((err) => {
  console.error("Fehler:", err)
  process.exit(1)
})
