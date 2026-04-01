import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { trainerLicenseOptions } from "@/lib/trainerLicense"
import { validateEmail } from "@/lib/formValidation"

type UpdateTrainerBody = {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
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

function normalizeRenewals(value: string[] | undefined) {
  const renewals = Array.isArray(value) ? value : []
  const normalized = Array.from(
    new Set(
      renewals
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
    )
  )

  return normalized.sort((left, right) => right.localeCompare(left, "de"))
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
    const trainerLicense = body.trainerLicense
    const trainerLicenseRenewals = normalizeRenewals(body.trainerLicenseRenewals)
    const lizenzart = body.lizenzart?.trim() ?? null
    const lizenznummer = body.lizenznummer?.trim() ?? null
    const lizenzGueltigBis = body.lizenz_gueltig_bis?.trim() ?? null
    const lizenzVerband = body.lizenz_verband?.trim() ?? null
    const bemerkung = body.bemerkung?.trim() ?? null

    if (!firstName || !lastName || !email) {
      return jsonError("Bitte Vorname, Nachname und E-Mail ausfuellen.", 400)
    }

    const emailValidation = validateEmail(email)
    if (!emailValidation.valid) {
      return jsonError(emailValidation.error || "Bitte eine gueltige E-Mail-Adresse eingeben.", 400)
    }

    if (trainerLicense && !trainerLicenseOptions.includes(trainerLicense)) {
      return jsonError("Ungueltige Trainerlizenz.", 400)
    }

    if (Array.isArray(body.trainerLicenseRenewals) && trainerLicenseRenewals.length !== body.trainerLicenseRenewals.filter((entry) => typeof entry === "string" && entry.trim().length > 0).length) {
      return jsonError("Lizenzverlaengerungen muessen als Datum im Format JJJJ-MM-TT gespeichert werden.", 400)
    }

    if (lizenzGueltigBis && !/^\d{4}-\d{2}-\d{2}$/.test(lizenzGueltigBis)) {
      return jsonError("'gültig bis' muss im Format JJJJ-MM-TT sein.", 400)
    }

    const supabase = getServerSupabase()
    const payload: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || null,
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
    const trainer = data as any

    await writeAdminAuditLog({
      session,
      action: "trainer_account_updated",
      targetType: "trainer",
      targetId: trainer.id,
      targetName: `${trainer.first_name ?? ""} ${trainer.last_name ?? ""}`.trim() || trainer.email || "—",
      details: `E-Mail: ${trainer.email}${trainerLicense ? `, Lizenz: ${trainerLicense}` : ""}${trainerLicenseRenewals.length ? `, Verlängerungen: ${trainerLicenseRenewals.join(", ")}` : ""}${lizenzart ? `, lizenzart: ${lizenzart}` : ""}${lizenznummer ? `, lizenznr: ${lizenznummer}` : ""}${lizenzGueltigBis ? `, gueltig_bis: ${lizenzGueltigBis}` : ""}`,
    })

    return NextResponse.json({ ok: true, trainer: trainer })
  } catch (error) {
    console.error("admin trainer account update failed", error)
    return jsonError("Internal server error", 500)
  }
}
