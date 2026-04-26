function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase()
}

export function isInternalTrainerTestEmail(email: string | null | undefined) {
  const normalized = normalizeEmail(email)
  if (!normalized) return false

  return (
    normalized.endsWith("@example.com") ||
    normalized.endsWith("@example.org") ||
    normalized.endsWith("@tsv-boxgym.local") ||
    normalized.includes("+trainer-test@") ||
    normalized.includes("+internal-trainer@")
  )
}
