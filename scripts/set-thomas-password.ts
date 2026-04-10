import { findTrainerByEmail, updateTrainerAccountPin } from "../lib/trainerDb"

async function main() {
  const email = "thomas.schuetze@tsv-falkensee.de"
  const trainer = await findTrainerByEmail(email)
  if (!trainer) {
    console.error("Kein Trainer mit dieser E-Mail gefunden.")
    process.exit(1)
  }
  await updateTrainerAccountPin(trainer.id, "Delphin08151!")
  console.log("Passwort für Thomas Schütze erfolgreich gesetzt.")
  process.exit(0)
}

main()
