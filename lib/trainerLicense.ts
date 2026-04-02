export const trainerLicenseOptions = [
  "Keine DOSB-Lizenz",
  "Übungsleiter DOSB C",
  "Trainer DOSB Boxen C",
  "Trainer DOSB Boxen B",
  "Trainer DOSB Boxen A",
] as const

export type TrainerLicense = (typeof trainerLicenseOptions)[number]

const trainerLicenseAliases: Record<string, TrainerLicense> = {
  "keine dosb-lizenz": "Keine DOSB-Lizenz",
  "keine dosb lizenz": "Keine DOSB-Lizenz",
  "übungsleiter dosb c": "Übungsleiter DOSB C",
  "uebungsleiter dosb c": "Übungsleiter DOSB C",
  "dosb lizenz übungsleiter": "Übungsleiter DOSB C",
  "dosb lizenz uebungsleiter": "Übungsleiter DOSB C",
  "dosb-lizenz übungsleiter": "Übungsleiter DOSB C",
  "dosb-lizenz uebungsleiter": "Übungsleiter DOSB C",
  "übungsleiter dosb": "Übungsleiter DOSB C",
  "uebungsleiter dosb": "Übungsleiter DOSB C",
  "trainer dosb boxen c": "Trainer DOSB Boxen C",
  "trainer dosb boxen b": "Trainer DOSB Boxen B",
  "trainer dosb boxen a": "Trainer DOSB Boxen A",
}

export function normalizeTrainerLicense(value: string | null | undefined): TrainerLicense | null {
  const normalized = value?.trim()
  if (!normalized) return null
  if ((trainerLicenseOptions as readonly string[]).includes(normalized)) {
    return normalized as TrainerLicense
  }

  return trainerLicenseAliases[normalized.toLowerCase()] ?? null
}
