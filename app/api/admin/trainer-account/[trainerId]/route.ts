import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainerLicense, trainerLicenseOptions } from "@/lib/trainerLicense"
import { validateEmail } from "@/lib/formValidation"

type UpdateTrainerBody = {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  isSportler?: boolean
  memberBirthdate?: string | null
  linkedMemberId?: string | null
  trainerLicense?: (typeof trainerLicenseOptions)[number]
  trainerLicenseRenewals?: string[]
  lizenzart?: string | null
  lizenznummer?: string | null
  lizenz_gueltig_bis?: string | null
  lizenz_verband?: string | null
  bemerkung?: string | null
}

const TRAINER_ACCOUNT_BASE_SELECT =
  "id, first_name, last_name, email, email_verified, email_verified_at, is_approved, approved_at, created_at"
const TRAINER_ACCOUNT_OPTIONAL_COLUMNS = [
  "phone",
  "trainer_license",
  "role",
  "linked_member_id",
  "trainer_license_renewals",
  "lizenzart",
  "lizenznummer",
  "lizenz_gueltig_bis",
  "lizenz_verband",
  "bemerkung",
] as const

type UpdatedTrainerResponse = {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  linked_member_id?: string | null
}

type ExistingTrainerRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  password_hash: string | null
  email_verified: boolean | null
  email_verified_at: string | null
  is_approved: boolean | null
  linked_member_id: string | null
}

type MemberLookupRow = {
  id: string
  email?: string | null
}

function jsonError(message: string, status: number, details?: string) {
  return NextResponse.json({ ok: false, error: message, ...(details ? { details } : {}) }, { status })
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

async function requireAdminSession(request: Request) {
  if (!isAllowedOrigin(request)) {
    return jsonError("Forbidden", 403)
  }

  const session = await readTrainerSessionFromHeaders(request)
  if (!session || session.accountRole !== "admin") {
    return jsonError("Unauthorized", 401)
  }

  return null
}

function isMissingColumnError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return (
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("column")) ||
    message.includes("schema cache")
  )
}

function findMissingColumn(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return TRAINER_ACCOUNT_OPTIONAL_COLUMNS.find((column) => message.includes(column)) ?? null
}

function isUniqueConstraintError(error: { code?: string; message?: string; details?: string | null } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  return error?.code === "23505" || message.includes("duplicate key") || message.includes("already exists")
}

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase()
}

function normalizeRenewals(value: string[] | undefined) {
  const renewals = Array.isArray(value) ? value : []
  const normalized = Array.from(
    new Set(
      renewals
        .map((entry) => (typeof entry === "string" ? normalizeDateInput(entry) : null))
        .filter((entry): entry is string => Boolean(entry))
    )
  )

  return normalized.sort((left, right) => right.localeCompare(left, "de"))
}

function normalizeDateInput(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ""
  if (!trimmed) return null

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const germanMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)

  const parts = isoMatch
    ? { year: isoMatch[1], month: isoMatch[2], day: isoMatch[3] }
    : germanMatch
      ? { year: germanMatch[3], month: germanMatch[2], day: germanMatch[1] }
      : null

  if (!parts) return null

  const isoDate = `${parts.year}-${parts.month}-${parts.day}`
  const parsedDate = new Date(`${isoDate}T12:00:00`)

  if (Number.isNaN(parsedDate.getTime())) return null

  if (
    parsedDate.getFullYear() !== Number(parts.year) ||
    parsedDate.getMonth() + 1 !== Number(parts.month) ||
    parsedDate.getDate() !== Number(parts.day)
  ) {
    return null
  }

  return isoDate
}

async function updateTrainerWithFallback(
  supabase: ReturnType<typeof getServerSupabase>,
  trainerId: string,
  payload: Record<string, unknown>
) {
  const attemptPayload = { ...payload }
  const optionalColumns = TRAINER_ACCOUNT_OPTIONAL_COLUMNS.filter((column) => column in attemptPayload)

  while (true) {
    const select = [TRAINER_ACCOUNT_BASE_SELECT, ...optionalColumns].join(", ")
    const response = await supabase
      .from("trainer_accounts")
      .update(attemptPayload)
      .eq("id", trainerId)
      .select(select)
      .maybeSingle()

    if (!response.error) {
      return response
    }

    const missingColumn = isMissingColumnError(response.error) ? findMissingColumn(response.error) : null
    if (!missingColumn || !(missingColumn in attemptPayload)) {
      return response
    }

    delete attemptPayload[missingColumn]
    const missingIndex = optionalColumns.indexOf(missingColumn)
    if (missingIndex >= 0) {
      optionalColumns.splice(missingIndex, 1)
    }
  }
}

async function findMatchingMemberByEmail(
  supabase: ReturnType<typeof getServerSupabase>,
  email: string
) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null

  const exact = await supabase
    .from("members")
    .select("id, email")
    .eq("email", normalizedEmail)
    .order("created_at", { ascending: false })
    .limit(1)

  if (exact.error) throw exact.error
  const exactMatch = (exact.data?.[0] as MemberLookupRow | undefined) ?? null
  if (exactMatch?.id) return exactMatch

  const caseInsensitive = await supabase
    .from("members")
    .select("id, email")
    .ilike("email", normalizedEmail)
    .order("created_at", { ascending: false })
    .limit(10)

  if (caseInsensitive.error) throw caseInsensitive.error
  return (
    (caseInsensitive.data as MemberLookupRow[] | null)?.find(
      (member) => normalizeEmail(member.email) === normalizedEmail
    ) ?? null
  )
}

export async function PATCH(request: Request, context: { params: Promise<{ trainerId: string }> }) {
  try {
    const authError = await requireAdminSession(request)
    if (authError) return authError

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return jsonError("Unauthorized", 401)
    }

    const rateLimit = await checkRateLimitAsync(`admin-trainer-account-update:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const { trainerId } = await context.params
    const normalizedTrainerId = trainerId?.trim() ?? ""
    if (!normalizedTrainerId) {
      return jsonError("Missing trainer id", 400)
    }

    const body = (await request.json()) as UpdateTrainerBody
    const firstName = body.firstName?.trim() ?? ""
    const lastName = body.lastName?.trim() ?? ""
    const email = body.email?.trim().toLowerCase() ?? ""
    const phone = body.phone?.trim() ?? ""
    const isSportler = body.isSportler === true
    const memberBirthdateInput = body.memberBirthdate?.trim() ?? null
    const memberBirthdate = normalizeDateInput(memberBirthdateInput)
    const linkedMemberId = body.linkedMemberId?.trim() || null
    const trainerLicenseInput = typeof body.trainerLicense === "string" ? body.trainerLicense : undefined
    const trainerLicense = normalizeTrainerLicense(trainerLicenseInput)
    const trainerLicenseRenewals = normalizeRenewals(body.trainerLicenseRenewals)
    const lizenzart = body.lizenzart?.trim() ?? null
    const lizenznummer = body.lizenznummer?.trim() ?? null
    const lizenzGueltigBisInput = body.lizenz_gueltig_bis?.trim() ?? null
    const lizenzGueltigBis = normalizeDateInput(lizenzGueltigBisInput)
    const lizenzVerband = body.lizenz_verband?.trim() ?? null
    const bemerkung = body.bemerkung?.trim() ?? null

    if (!firstName || !lastName || !email) {
      return jsonError("Bitte Vorname, Nachname und E-Mail ausfüllen.", 400)
    }

    const emailValidation = validateEmail(email)
    if (!emailValidation.valid) {
      return jsonError(emailValidation.error || "Bitte eine gültige E-Mail-Adresse eingeben.", 400)
    }

    if (trainerLicenseInput && !trainerLicense) {
      return jsonError("Ungültige Trainerlizenz.", 400)
    }

    if (Array.isArray(body.trainerLicenseRenewals) && trainerLicenseRenewals.length !== body.trainerLicenseRenewals.filter((entry) => typeof entry === "string" && entry.trim().length > 0).length) {
      return jsonError("Lizenzverlängerungen müssen als Datum im Format TT.MM.JJJJ gespeichert werden.", 400)
    }

    if (lizenzGueltigBisInput && !lizenzGueltigBis) {
      return jsonError("'gültig bis' muss im Format TT.MM.JJJJ sein.", 400)
    }

    if (memberBirthdateInput && !memberBirthdate) {
      return jsonError("Geburtsdatum für das Mitglied muss im Format TT.MM.JJJJ sein.", 400)
    }

    const supabase = getServerSupabase()
    const { data: currentTrainer, error: currentTrainerError } = await supabase
      .from("trainer_accounts")
      .select("id, first_name, last_name, email, password_hash, email_verified, email_verified_at, is_approved, linked_member_id")
      .eq("id", normalizedTrainerId)
      .maybeSingle()

    if (currentTrainerError) {
      throw currentTrainerError
    }
    if (!currentTrainer) {
      return jsonError("Trainer nicht gefunden", 404)
    }

    const trainerRow = currentTrainer as ExistingTrainerRow
    let resolvedLinkedMemberId = linkedMemberId

    if (isSportler && !resolvedLinkedMemberId) {
      const matchedMember = await findMatchingMemberByEmail(supabase, email)
      if (matchedMember?.id) {
        resolvedLinkedMemberId = matchedMember.id
      } else {
        return jsonError("Mitglied muss zuerst registriert werden.", 409)
      }
    }

    if (isSportler && !resolvedLinkedMemberId) {
      return jsonError("Sportlerkonto konnte nicht verknuepft werden.", 500)
    }

    const payload: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || null,
      linked_member_id: resolvedLinkedMemberId,
      trainer_license: trainerLicense ?? null,
      trainer_license_renewals: trainerLicenseRenewals,
      lizenzart: lizenzart,
      lizenznummer: lizenznummer,
      lizenz_gueltig_bis: lizenzGueltigBis,
      lizenz_verband: lizenzVerband,
      bemerkung: bemerkung,
    }

    const { data, error } = await updateTrainerWithFallback(supabase, normalizedTrainerId, payload)
    if (error) {
      if (isUniqueConstraintError(error)) {
        return jsonError("Diese E-Mail-Adresse ist bereits vergeben.", 409)
      }
      throw error
    }
    if (!data) {
      return jsonError("Trainer nicht gefunden", 404)
    }
    const trainer = data as unknown as UpdatedTrainerResponse

    await writeAdminAuditLog({
      session,
      action: "trainer_account_updated",
      targetType: "trainer",
      targetId: trainer.id,
      targetName: `${trainer.first_name ?? ""} ${trainer.last_name ?? ""}`.trim() || trainer.email || "—",
      details: `E-Mail: ${trainer.email}${trainerLicense ? `, Lizenz: ${trainerLicense}` : ""}${trainerLicenseRenewals.length ? `, Verlängerungen: ${trainerLicenseRenewals.join(", ")}` : ""}${lizenzart ? `, lizenzart: ${lizenzart}` : ""}${lizenznummer ? `, lizenznr: ${lizenznummer}` : ""}${lizenzGueltigBis ? `, gueltig_bis: ${lizenzGueltigBis}` : ""}${resolvedLinkedMemberId ? `, Mitglied verknüpft: ${resolvedLinkedMemberId}` : ""}`,
    })

    return NextResponse.json({ ok: true, trainer, linkedMemberId: resolvedLinkedMemberId })
  } catch (error) {
    console.error("admin trainer account update failed", error)
    const details = error instanceof Error ? error.message : undefined
    return jsonError("Internal server error", 500, details)
  }
}

// ─── DELETE /api/admin/trainer-account/[trainerId] ────────────────────────────
// Löscht ausschließlich offene (nicht-freigegebene, nicht-admin) Trainerzugänge.
export async function DELETE(request: Request, context: { params: Promise<{ trainerId: string }> }) {
  try {
    const authError = await requireAdminSession(request)
    if (authError) return authError

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return jsonError("Unauthorized", 401)
    }

    const rateLimit = await checkRateLimitAsync(`admin-trainer-account-delete:${getRequestIp(request)}`, 20, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const { trainerId } = await context.params
    const normalizedTrainerId = trainerId?.trim() ?? ""
    if (!normalizedTrainerId) {
      return jsonError("Missing trainer id", 400)
    }

    const supabase = getServerSupabase()

    // Trainer laden und Schutzprüfungen serverseitig durchführen
    const { data: trainerRow, error: fetchError } = await supabase
      .from("trainer_accounts")
      .select("id, first_name, last_name, email, is_approved, role")
      .eq("id", normalizedTrainerId)
      .maybeSingle()

    if (fetchError) throw fetchError

    if (!trainerRow) {
      console.warn("[trainer-account DELETE] trainer not found", { trainerId: normalizedTrainerId, adminId: session.accountEmail })
      return jsonError("Trainer nicht gefunden", 404)
    }

    const trainerName = `${trainerRow.first_name ?? ""} ${trainerRow.last_name ?? ""}`.trim() || trainerRow.email || "—"

    // Schutz 1: Keine freigegebenen Trainer löschen
    if (trainerRow.is_approved === true) {
      console.warn("[trainer-account DELETE] rejected – already approved", { trainerId: normalizedTrainerId, adminId: session.accountEmail })
      return jsonError("Freigegebene Trainer können nicht gelöscht werden.", 403)
    }

    // Schutz 2: Keine Admin-Konten löschen
    if (trainerRow.role === "admin") {
      console.warn("[trainer-account DELETE] rejected – admin account", { trainerId: normalizedTrainerId, adminId: session.accountEmail })
      return jsonError("Admin-Konten können nicht gelöscht werden.", 403)
    }

    // Schutz 3: Keine Trainer mit zugewiesenen Trainingsplänen löschen
    const { count: planCount, error: planError } = await supabase
      .from("training_plans")
      .select("id", { count: "exact", head: true })
      .eq("assigned_trainer_id", normalizedTrainerId)

    if (planError) throw planError

    if ((planCount ?? 0) > 0) {
      console.warn("[trainer-account DELETE] rejected – has assigned training plans", { trainerId: normalizedTrainerId, planCount, adminId: session.accountEmail })
      return jsonError(`Dieser Trainerzugang hat ${planCount} zugewiesene Trainingspläne und kann nicht gelöscht werden.`, 409)
    }

    // KI-Profil löschen (keine Nutzungsdaten, sicher zu entfernen)
    await supabase.from("training_trainer_profiles").delete().eq("trainer_id", normalizedTrainerId)

    // Trainer-Account löschen
    const { error: deleteError } = await supabase
      .from("trainer_accounts")
      .delete()
      .eq("id", normalizedTrainerId)

    if (deleteError) throw deleteError

    await writeAdminAuditLog({
      session,
      action: "trainer_account_deleted",
      targetType: "trainer",
      targetId: normalizedTrainerId,
      targetName: trainerName,
      details: `Offener Trainerzugang gelöscht. E-Mail: ${trainerRow.email ?? "—"}`,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("admin trainer account delete failed", error)
    const details = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : undefined
    return jsonError("Internal server error", 500, details)
  }
}
