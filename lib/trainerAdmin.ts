const INTERNAL_TRAINER_TEST_EMAILS = [] as const

export function normalizeTrainerEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? ""
}

export function isInternalTrainerTestEmail(email?: string | null) {
  const normalizedEmail = normalizeTrainerEmail(email)
  return INTERNAL_TRAINER_TEST_EMAILS.includes(normalizedEmail as (typeof INTERNAL_TRAINER_TEST_EMAILS)[number])
}
