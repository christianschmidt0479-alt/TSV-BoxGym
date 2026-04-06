import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { createMember, findMemberByEmail, findMemberByFirstLastAndBirthdate, updateMemberRegistrationData } from "@/lib/boxgymDb"
import { validateEmail } from "@/lib/formValidation"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { parseTrainingGroup } from "@/lib/trainingGroups"

type CreateExcelMemberBody = {
  firstName?: string
  lastName?: string
  birthDate?: string
  email?: string
  phone?: string
  baseGroup?: string
  officeListGroup?: string
  officeListCheckedAt?: string
}

type DuplicateMatch = {
  id: string
  name: string
  birthdate: string | null
  email: string | null
  phone: string | null
  reason: string
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

function normalizeBirthDateInput(value?: string | null) {
  const trimmed = (value ?? "").trim()
  if (!trimmed) return ""

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!isoMatch) return ""

  const [, year, month, day] = isoMatch
  const date = new Date(`${year}-${month}-${day}T12:00:00`)

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
  ) {
    return ""
  }

  return `${year}-${month}-${day}`
}

function normalizePhone(value?: string | null) {
  return (value ?? "").replace(/[^\d+]/g, "")
}

function getDisplayName(row: { first_name?: string | null; last_name?: string | null; name?: string | null }) {
  const full = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()
  return full || row.name || "—"
}

function dedupeMatches(matches: DuplicateMatch[]) {
  const byId = new Map<string, DuplicateMatch>()

  for (const match of matches) {
    const existing = byId.get(match.id)
    if (!existing) {
      byId.set(match.id, match)
      continue
    }

    byId.set(match.id, {
      ...existing,
      reason: `${existing.reason} · ${match.reason}`,
    })
  }

  return Array.from(byId.values())
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-excel-create-member:${getRequestIp(request)}`, 30, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as CreateExcelMemberBody
    const firstName = body.firstName?.trim() ?? ""
    const lastName = body.lastName?.trim() ?? ""
    const birthDate = normalizeBirthDateInput(body.birthDate)
    const email = body.email?.trim().toLowerCase() ?? ""
    const phone = body.phone?.trim() ?? ""
    const baseGroup = parseTrainingGroup(body.baseGroup)
    const officeListGroup = parseTrainingGroup(body.officeListGroup) || baseGroup
    const officeListCheckedAt = body.officeListCheckedAt?.trim() || new Date().toISOString()

    if (!firstName || !lastName) {
      return new NextResponse("Bitte Vorname und Nachname angeben.", { status: 400 })
    }

    if (!birthDate) {
      return new NextResponse("Bitte ein gültiges Geburtsdatum angeben.", { status: 400 })
    }

    if (!baseGroup) {
      return new NextResponse("Bitte eine gültige Stammgruppe auswählen.", { status: 400 })
    }

    if (email) {
      const validation = validateEmail(email)
      if (!validation.valid) {
        return new NextResponse(validation.error || "Bitte eine gültige E-Mail-Adresse angeben.", { status: 400 })
      }
    }

    const duplicateMatches: DuplicateMatch[] = []

    const existingByNameAndBirthdate = await findMemberByFirstLastAndBirthdate(firstName, lastName, birthDate)
    if (existingByNameAndBirthdate) {
      duplicateMatches.push({
        id: existingByNameAndBirthdate.id,
        name: getDisplayName(existingByNameAndBirthdate),
        birthdate: existingByNameAndBirthdate.birthdate ?? null,
        email: existingByNameAndBirthdate.email ?? null,
        phone: existingByNameAndBirthdate.phone ?? null,
        reason: "Gleicher Name und gleiches Geburtsdatum",
      })
    }

    if (email) {
      const existingByEmail = await findMemberByEmail(email)
      if (existingByEmail) {
        duplicateMatches.push({
          id: existingByEmail.id,
          name: getDisplayName(existingByEmail),
          birthdate: existingByEmail.birthdate ?? null,
          email: existingByEmail.email ?? null,
          phone: existingByEmail.phone ?? null,
          reason: "Gleiche E-Mail-Adresse",
        })
      }
    }

    const normalizedPhone = normalizePhone(phone)
    if (normalizedPhone) {
      const supabase = getServerSupabase()
      const phoneResponse = await supabase
        .from("members")
        .select("id, name, first_name, last_name, birthdate, email, phone")
        .not("phone", "is", null)

      if (phoneResponse.error) {
        throw phoneResponse.error
      }

      for (const row of (phoneResponse.data ?? []) as Array<Record<string, unknown>>) {
        const rowPhone = typeof row.phone === "string" ? row.phone : ""
        if (normalizePhone(rowPhone) !== normalizedPhone) continue

        duplicateMatches.push({
          id: String(row.id),
          name: getDisplayName(row),
          birthdate: typeof row.birthdate === "string" ? row.birthdate : null,
          email: typeof row.email === "string" ? row.email : null,
          phone: rowPhone || null,
          reason: "Gleiche Telefonnummer",
        })
      }
    }

    const dedupedMatches = dedupeMatches(duplicateMatches)
    if (dedupedMatches.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Möglicher Dublettentreffer gefunden. Bitte vorhandenen Datensatz zuerst prüfen.",
          matches: dedupedMatches,
        },
        { status: 409 }
      )
    }

    const member = await createMember({
      first_name: firstName,
      last_name: lastName,
      birthdate: birthDate,
      email: email || undefined,
      phone: phone || undefined,
      is_trial: false,
      is_approved: false,
      base_group: baseGroup,
    })

    const verificationToken = email ? randomUUID() : null
    const updatedMember = await updateMemberRegistrationData(member.id, {
      email: email || null,
      phone: phone || null,
      email_verified: false,
      email_verified_at: null,
      email_verification_token: verificationToken,
      base_group: baseGroup,
      office_list_status: "green",
      office_list_group: officeListGroup || null,
      office_list_checked_at: officeListCheckedAt,
      created_from_excel: true,
    })

    await writeAdminAuditLog({
      session,
      action: "member_created_from_excel",
      targetType: "member",
      targetId: updatedMember.id,
      targetName: getDisplayName(updatedMember),
      details: `Gruppe: ${baseGroup}${email ? ` · E-Mail: ${email}` : ""}`,
    })

    return NextResponse.json({
      ok: true,
      member: {
        id: updatedMember.id,
        first_name: updatedMember.first_name ?? firstName,
        last_name: updatedMember.last_name ?? lastName,
        birthdate: updatedMember.birthdate ?? birthDate,
        email: updatedMember.email ?? (email || null),
        phone: updatedMember.phone ?? (phone || null),
        is_approved: Boolean(updatedMember.is_approved),
        base_group: updatedMember.base_group ?? baseGroup,
        office_list_status: updatedMember.office_list_status ?? "green",
        office_list_group: updatedMember.office_list_group ?? officeListGroup ?? null,
        office_list_checked_at: updatedMember.office_list_checked_at ?? officeListCheckedAt,
      },
    })
  } catch (error) {
    console.error("admin excel create member failed", error)
    return new NextResponse(error instanceof Error ? error.message : "Interner Fehler", { status: 500 })
  }
}