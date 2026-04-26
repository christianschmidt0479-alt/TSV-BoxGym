// Test-Script für Thomas Schütze Suche
const fs = require("fs")
const path = require("path")

// Konfiguration laden
const envPath = path.join(__dirname, ".env.local")
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath })
}

const { createClient } = require("@supabase/supabase-js")

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.log("❌ Supabase credentials missing")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function findThomas() {
  console.log("\n========== THOMAS SCHÜTZE SUCHE ==========\n")

  try {
    // Erst Schema überprüfen
    console.log("📋 Schema-Check: Alle Spalten in 'members' Tabelle abrufen...")
    const { data: schemaData, error: schemaError } = await supabase
      .from("members")
      .select("*")
      .limit(1)

    if (schemaError) {
      console.log("❌ Schema-Fehler:", schemaError.message)
    } else if (schemaData && schemaData.length > 0) {
      const columns = Object.keys(schemaData[0])
      console.log(`✔ Verfügbare Spalten: ${columns.join(", ")}\n`)
    }

    // Alle Mitglieder abrufen
    const { data: allMembers, error } = await supabase
      .from("members")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.log("❌ Fehler beim Abrufen der Mitglieder:", error.message)
      process.exit(1)
    }

    console.log(`📊 Insgesamt ${allMembers.length} Mitglieder in der Datenbank\n`)

    // PHASE 1 — DEBUG FILTER
    const thomas = allMembers.find(m =>
      m.name?.toLowerCase().includes("thomas") &&
      m.name?.toLowerCase().includes("sch")
    )

    // PHASE 2 — LOGGING
    if (thomas) {
      console.log("✔ THOMAS SCHÜTZE GEFUNDEN:")
      console.log(JSON.stringify(thomas, null, 2))
    } else {
      console.log("❌ THOMAS SCHÜTZE NICHT GEFUNDEN")
    }

    // PHASE 3 — TRAINER STATUS PRÜFEN
    if (thomas) {
      console.log("\nTRAINER CHECK:")
      console.log(JSON.stringify({
        name: thomas.name,
        email: thomas.email,
        is_trainer: thomas.is_trainer,
        member_phase: thomas.member_phase,
        is_approved: thomas.is_approved,
        base_group: thomas.base_group
      }, null, 2))
    }

    // PHASE 4 — EXAKTER MATCH
    const thomasExact = allMembers.find(m =>
      m.name === "Thomas Schütze"
    )

    console.log("\n--- EXAKTER MATCH ---")
    if (thomasExact) {
      console.log("✔ EXAKTER MATCH GEFUNDEN:")
      console.log(JSON.stringify(thomasExact, null, 2))
    } else {
      console.log("❌ EXAKTER MATCH NICHT GEFUNDEN")
    }

    // Zusätzliche Suche: Alle mit "Thomas" im Namen
    const thomasList = allMembers.filter(m =>
      m.name?.toLowerCase().includes("thomas")
    )

    if (thomasList.length > 0) {
      console.log(`\n--- ${thomasList.length} PERSONEN MIT "THOMAS" IM NAMEN ---`)
      thomasList.forEach(m => {
        console.log(`  • ${m.name} (is_trainer: ${m.is_trainer})`)
      })
    }

    // Zusätzliche Suche: Alle Trainer
    const allTrainers = allMembers.filter(m =>
      m.is_trainer === true
    )

    console.log(`\n--- ${allTrainers.length} TRAINER IM SYSTEM ---`)
    allTrainers.forEach(m => {
      console.log(`  • ${m.name} (email: ${m.email}, is_trainer: ${m.is_trainer})`)
    })

    console.log("\n==========================================\n")

  } catch (err) {
    console.log("❌ FEHLER:", err.message)
    process.exit(1)
  }
}

findThomas()
