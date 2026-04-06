/**
 * Einmalig: Verknüpft den Admin-Trainer-Account von Christian Schmidt
 * mit seinem Mitglieds-Datensatz (Geb. 07.04.1979, Stammgruppe Basic Ü18).
 *
 * Führt nur einen PATCH auf linked_member_id durch – keine weiteren Datenänderungen.
 *
 * Nutzung:
 *   node --env-file=.env.local scripts/link-admin-member-christian-schmidt.mjs
 *   node --env-file=.env.local scripts/link-admin-member-christian-schmidt.mjs --apply
 */

import { createClient } from "@supabase/supabase-js"

const APPLY_MODE = process.argv.includes("--apply")

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

const supabase = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
)

async function main() {
  // 1. Mitglieds-Datensatz: Christian Schmidt, Geb. 07.04.1979
  const { data: members, error: memberErr } = await supabase
    .from("members")
    .select("id, first_name, last_name, birthdate, base_group, email, is_approved")
    .eq("birthdate", "1979-04-07")

  if (memberErr) throw memberErr

  if (!members || members.length === 0) {
    console.error("Kein Mitglied mit Geburtsdatum 07.04.1979 gefunden.")
    process.exit(1)
  }

  // Filter auf Christian Schmidt
  const candidate = members.find(
    (m) =>
      (m.last_name ?? "").toLowerCase().includes("schmidt") &&
      (m.first_name ?? "").toLowerCase().includes("christian")
  )

  if (!candidate) {
    console.log("Alle Mitglieder mit diesem Geburtsdatum:")
    for (const m of members) {
      console.log(` - ${m.id}  ${m.first_name} ${m.last_name}  ${m.birthdate}  ${m.base_group}  ${m.email}`)
    }
    console.error("Christian Schmidt unter diesen Einträgen nicht eindeutig identifiziert.")
    process.exit(1)
  }

  console.log(`Mitglied gefunden: ${candidate.id}  ${candidate.first_name} ${candidate.last_name}  ${candidate.birthdate}  ${candidate.base_group}`)

  // 2. Trainer-Account: Admin mit gleicher E-Mail oder Name
  const { data: trainers, error: trainerErr } = await supabase
    .from("trainer_accounts")
    .select("id, first_name, last_name, email, role, linked_member_id, is_approved")
    .eq("role", "admin")

  if (trainerErr) throw trainerErr

  if (!trainers || trainers.length === 0) {
    console.error("Kein Admin-Trainer-Account gefunden.")
    process.exit(1)
  }

  const trainerCandidate = trainers.find(
    (t) =>
      (t.last_name ?? "").toLowerCase().includes("schmidt") &&
      (t.first_name ?? "").toLowerCase().includes("christian")
  ) ?? (trainers.length === 1 ? trainers[0] : null)

  if (!trainerCandidate) {
    console.log("Alle Admin-Trainer:")
    for (const t of trainers) {
      console.log(` - ${t.id}  ${t.first_name} ${t.last_name}  ${t.email}  linked_member_id=${t.linked_member_id}`)
    }
    console.error("Trainer-Account für Christian Schmidt nicht eindeutig identifiziert. Bitte ID oben prüfen.")
    process.exit(1)
  }

  console.log(`Trainer-Account gefunden: ${trainerCandidate.id}  ${trainerCandidate.first_name} ${trainerCandidate.last_name}  ${trainerCandidate.email}  role=${trainerCandidate.role}`)
  console.log(`Aktuelles linked_member_id: ${trainerCandidate.linked_member_id ?? "null (nicht gesetzt)"}`)

  if (trainerCandidate.linked_member_id === candidate.id) {
    console.log("linked_member_id ist bereits korrekt gesetzt. Nichts zu tun.")
    process.exit(0)
  }

  if (!APPLY_MODE) {
    console.log("\n[DRY-RUN] Würde setzen:")
    console.log(`  trainer_accounts.linked_member_id = '${candidate.id}'`)
    console.log(`  WHERE id = '${trainerCandidate.id}'`)
    console.log("\nMit --apply ausführen um den Change zu schreiben.")
    process.exit(0)
  }

  // 3. Verknüpfung schreiben
  const { error: updateErr } = await supabase
    .from("trainer_accounts")
    .update({ linked_member_id: candidate.id })
    .eq("id", trainerCandidate.id)

  if (updateErr) throw updateErr

  console.log(`\nErfolg: Trainer ${trainerCandidate.id} → Mitglied ${candidate.id} verknüpft.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
