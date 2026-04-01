export const trainerLicenseOptions = [
  "Keine DOSB-Lizenz",
  "Übungsleiter DOSB C",
  "Trainer DOSB Boxen C",
  "Trainer DOSB Boxen B",
  "Trainer DOSB Boxen A",
] as const

export type TrainerLicense = (typeof trainerLicenseOptions)[number]
