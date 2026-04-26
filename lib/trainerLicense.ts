export const trainerLicenseOptions = [
  "c-trainer",
  "b-trainer",
  "a-trainer",
  "trainerassistent",
  "vereinsintern",
] as const

export type TrainerLicense = (typeof trainerLicenseOptions)[number]

export function normalizeTrainerLicense(value: string | null | undefined): TrainerLicense | null {
  const normalized = value?.trim().toLowerCase() ?? ""
  if (!normalized) return null
  return (trainerLicenseOptions as readonly string[]).includes(normalized)
    ? (normalized as TrainerLicense)
    : null
}
