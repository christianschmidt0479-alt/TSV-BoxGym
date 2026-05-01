import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { normalizePhone, normalizeText } from "@/lib/officeMatch"
import { parseOfficeUploadGroup, type OfficeUploadGroup } from "@/lib/officeUploadGroups"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

export const runtime = "nodejs"

const OFFICE_RUNS_TABLE = "office_reconciliation_runs"

type SyncMode = "dry_run" | "apply"

type SyncRequestBody = {
  mode?: SyncMode
  groups?: string[]
}

type ActiveRunRow = {
  id: string
  checked_at?: string | null
  rows?: unknown
  files?: unknown
}

type StoredRunFile = {
  fileName: string
  group: OfficeUploadGroup
  rowCount: number
}

type StoredRunResultRow = {
  excel?: unknown
  firstName?: unknown
  lastName?: unknown
  birthdate?: unknown
  email?: unknown
  phone?: unknown
  groupExcel?: unknown
}

type MemberRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  birthdate?: string | null
  email?: string | null
  phone?: string | null
  base_group?: string | null
  office_list_group?: string | null
}

type Reason =
  | "email"
  | "name_birthdate"
  | "phone"
  | "not_found"
  | "group_mismatch"
  | "skipped_no_group"
  | "skipped_no_uploaded_group"

type SyncStatus = "green" | "yellow" | "red" | "gray"

type EvaluatedMember = {
  memberId: string
  status: SyncStatus
  reason: Reason
  officeGroup: string | null
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

function isMissingColumnError(error: { message?: string; details?: string; code?: string } | null, column?: string) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  const looksLikeMissingColumn =
    error?.code === "PGRST204" ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("column")) ||
    message.includes("schema cache")

  if (!looksLikeMissingColumn) return false
  if (!column) return true
  return message.includes(column.toLowerCase())
}

function isMissingOfficeListColumnError(error: { message?: string; details?: string; code?: string } | null) {
  return ["office_list_status", "office_list_group", "office_list_checked_at"].some((column) => isMissingColumnError(error, column))
}

function getOfficeListMigrationError() {
  return new Error(
    "Die Datenbank kennt den GS-Abgleich noch nicht. Bitte führe zuerst supabase/member_office_list_fields.sql in Supabase aus."
  )
}

function isMissingOfficeRunStorageError(error: { message?: string; details?: string; code?: string } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  return (
    isMissingColumnError(error, OFFICE_RUNS_TABLE) ||
    message.includes(`relation \"${OFFICE_RUNS_TABLE}\"`) ||
    message.includes(OFFICE_RUNS_TABLE)
  )
}

function isStoredRunFileArray(value: unknown): value is StoredRunFile[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as StoredRunFile).fileName === "string" &&
        typeof (entry as StoredRunFile).group === "string" &&
        typeof (entry as StoredRunFile).rowCount === "number"
    )
  )
}

function toBasisRows(rows: unknown) {
  if (!Array.isArray(rows)) return [] as Array<{
    firstName: string
    lastName: string
    birthdate: string
    email: string
    phone: string
    group: OfficeUploadGroup
  }>

  return rows
    .filter((row): row is StoredRunResultRow => typeof row === "object" && row !== null)
    .filter((row) => row.excel === "Ja")
    .map((row) => {
      const group = parseOfficeUploadGroup(typeof row.groupExcel === "string" ? row.groupExcel : null)
      return {
        firstName: typeof row.firstName === "string" ? row.firstName : "",
        lastName: typeof row.lastName === "string" ? row.lastName : "",
        birthdate: typeof row.birthdate === "string" ? row.birthdate : "",
        email: typeof row.email === "string" ? row.email.trim().toLowerCase() : "",
        phone: typeof row.phone === "string" ? normalizePhone(row.phone) : "",
        group,
      }
    })
    .filter((row): row is { firstName: string; lastName: string; birthdate: string; email: string; phone: string; group: OfficeUploadGroup } => Boolean(row.group))
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function pickUnique<T>(items: T[]) {
  return items.length === 1 ? items[0] : null
}

function getMemberUploadGroup(member: MemberRow) {
  return parseOfficeUploadGroup(member.base_group) ?? parseOfficeUploadGroup(member.office_list_group)
}

function isLGroup(value?: string | null) {
  const normalized = normalizeText(value)
  return normalized === "l-gruppe" || normalized === "leistungsgruppe"
}

function findMemberScopeMatch(
  member: MemberRow,
  scopeRowsByEmail: Map<string, Array<{ firstName: string; lastName: string; birthdate: string; email: string; phone: string; group: OfficeUploadGroup }>>,
  scopeRowsByNameBirthdate: Map<string, Array<{ firstName: string; lastName: string; birthdate: string; email: string; phone: string; group: OfficeUploadGroup }>>,
  scopeRowsByPhone: Map<string, Array<{ firstName: string; lastName: string; birthdate: string; email: string; phone: string; group: OfficeUploadGroup }>>,
) {
  const memberEmail = (member.email ?? "").trim().toLowerCase()
  const memberPhone = normalizePhone(member.phone)
  const nameBirthdateKey = `${normalizeText(member.first_name)}|${normalizeText(member.last_name)}|${member.birthdate ?? ""}`

  const emailMatch = memberEmail ? pickUnique(scopeRowsByEmail.get(memberEmail) ?? []) : null
  const nameBirthdateMatch = !emailMatch ? pickUnique(scopeRowsByNameBirthdate.get(nameBirthdateKey) ?? []) : null
  const phoneMatch = !emailMatch && !nameBirthdateMatch && memberPhone ? pickUnique(scopeRowsByPhone.get(memberPhone) ?? []) : null

  const matched = emailMatch ?? nameBirthdateMatch ?? phoneMatch
  const reason: Reason = emailMatch
    ? "email"
    : nameBirthdateMatch
      ? "name_birthdate"
      : phoneMatch
        ? "phone"
        : "not_found"

  return {
    matched,
    reason,
  }
}

function hasDataMismatch(member: MemberRow, matched: { firstName: string; lastName: string; birthdate: string; email: string; phone: string }, reason: Reason) {
  const memberFirst = normalizeText(member.first_name)
  const memberLast = normalizeText(member.last_name)
  const memberBirthdate = member.birthdate ?? ""
  const memberEmail = (member.email ?? "").trim().toLowerCase()
  const memberPhone = normalizePhone(member.phone)

  if (reason !== "name_birthdate") {
    if (memberFirst && normalizeText(matched.firstName) && memberFirst !== normalizeText(matched.firstName)) return true
    if (memberLast && normalizeText(matched.lastName) && memberLast !== normalizeText(matched.lastName)) return true
    if (memberBirthdate && matched.birthdate && memberBirthdate !== matched.birthdate) return true
  }

  if (reason !== "email" && memberEmail && matched.email && memberEmail !== matched.email) return true
  if (reason !== "phone" && memberPhone && matched.phone && memberPhone !== matched.phone) return true

  return false
}

function emptyReasonCounts() {
  return {
    email: 0,
    name_birthdate: 0,
    phone: 0,
    not_found: 0,
    group_mismatch: 0,
    skipped_no_group: 0,
    skipped_no_uploaded_group: 0,
  }
}

function emptyStatusCounts() {
  return {
    green: 0,
    yellow: 0,
    red: 0,
    gray: 0,
    skipped: 0,
  }
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

    const rateLimit = await checkRateLimitAsync(`admin-excel-abgleich-sync:${getRequestIp(request)}`, 20, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json().catch(() => ({}))) as SyncRequestBody
    const mode: SyncMode = body.mode === "dry_run" ? "dry_run" : "apply"
    const requestedGroups = Array.isArray(body.groups)
      ? Array.from(new Set(body.groups.map((value) => parseOfficeUploadGroup(value)).filter((value): value is OfficeUploadGroup => Boolean(value))))
      : []

    if (Array.isArray(body.groups) && requestedGroups.length !== body.groups.length) {
      return NextResponse.json({ error: "Ungültige Gruppen im Sync-Request." }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const activeRunResponse = await supabase
      .from(OFFICE_RUNS_TABLE)
      .select("id, checked_at, rows, files")
      .eq("is_active", true)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (activeRunResponse.error) {
      if (isMissingOfficeRunStorageError(activeRunResponse.error)) {
        return NextResponse.json({ error: "Keine gespeicherte GS-Liste verfügbar." }, { status: 404 })
      }
      throw activeRunResponse.error
    }

    const activeRun = (activeRunResponse.data ?? null) as ActiveRunRow | null
    if (!activeRun) {
      return NextResponse.json({ error: "Keine aktive GS-Liste gefunden." }, { status: 404 })
    }

    const basisRows = toBasisRows(activeRun.rows)
    if (basisRows.length === 0) {
      return NextResponse.json({ error: "Aktive GS-Liste enthält keine auswertbaren Excel-Zeilen." }, { status: 409 })
    }

    const fileGroups = isStoredRunFileArray(activeRun.files)
      ? Array.from(new Set(activeRun.files.map((file) => parseOfficeUploadGroup(file.group)).filter((group): group is OfficeUploadGroup => Boolean(group))))
      : []

    const runGroups = fileGroups.length > 0
      ? fileGroups
      : Array.from(new Set(basisRows.map((row) => row.group)))

    const scopeGroups = requestedGroups.length > 0 ? requestedGroups : runGroups

    if (scopeGroups.length === 0) {
      return NextResponse.json({ error: "Keine gültigen Gruppen für den Sync verfügbar." }, { status: 409 })
    }

    if (requestedGroups.length > 0) {
      const runGroupSet = new Set(runGroups)
      const hasOutOfRunGroup = requestedGroups.some((group) => !runGroupSet.has(group))
      if (hasOutOfRunGroup) {
        return NextResponse.json({ error: "Angeforderte Gruppen sind nicht in der aktiven GS-Liste enthalten." }, { status: 400 })
      }
    }

    const scopeGroupSet = new Set(scopeGroups)
    const scopeRows = basisRows.filter((row) => scopeGroupSet.has(row.group))

    const membersResponse = await supabase
      .from("members")
      .select("id, first_name, last_name, birthdate, email, phone, base_group, office_list_group")

    if (membersResponse.error) {
      if (isMissingOfficeListColumnError(membersResponse.error)) {
        throw getOfficeListMigrationError()
      }
      throw membersResponse.error
    }

    const members = (membersResponse.data ?? []) as MemberRow[]
    const evaluated: EvaluatedMember[] = []
    const statusCounts = emptyStatusCounts()
    const reasonCounts = emptyReasonCounts()

    const scopeRowsByEmail = new Map<string, typeof scopeRows>()
    const scopeRowsByNameBirthdate = new Map<string, typeof scopeRows>()
    const scopeRowsByPhone = new Map<string, typeof scopeRows>()

    for (const row of scopeRows) {
      if (row.email) {
        const list = scopeRowsByEmail.get(row.email) ?? []
        list.push(row)
        scopeRowsByEmail.set(row.email, list)
      }

      const nameBirthdateKey = `${normalizeText(row.firstName)}|${normalizeText(row.lastName)}|${row.birthdate}`
      if (nameBirthdateKey !== "||") {
        const list = scopeRowsByNameBirthdate.get(nameBirthdateKey) ?? []
        list.push(row)
        scopeRowsByNameBirthdate.set(nameBirthdateKey, list)
      }

      if (row.phone) {
        const list = scopeRowsByPhone.get(row.phone) ?? []
        list.push(row)
        scopeRowsByPhone.set(row.phone, list)
      }
    }

    for (const member of members) {
      const memberGroup = getMemberUploadGroup(member)
      const memberIsLGroup = isLGroup(member.base_group)

      const hasScopeByGroup = Boolean(memberGroup && scopeGroupSet.has(memberGroup))
      const shouldCheckGroupOverarching = memberIsLGroup && !hasScopeByGroup

      if (!hasScopeByGroup && !shouldCheckGroupOverarching) {
        if (!memberGroup) {
          statusCounts.gray += 1
          statusCounts.skipped += 1
          reasonCounts.skipped_no_group += 1
          evaluated.push({
            memberId: member.id,
            status: "gray",
            reason: "skipped_no_group",
            officeGroup: null,
          })
          continue
        }

        statusCounts.gray += 1
        statusCounts.skipped += 1
        reasonCounts.skipped_no_uploaded_group += 1
        evaluated.push({
          memberId: member.id,
          status: "gray",
          reason: "skipped_no_uploaded_group",
          officeGroup: null,
        })
        continue
      }

      const { matched, reason: baseReason } = findMemberScopeMatch(
        member,
        scopeRowsByEmail,
        scopeRowsByNameBirthdate,
        scopeRowsByPhone,
      )

      if (!matched) {
        statusCounts.red += 1
        reasonCounts.not_found += 1
        evaluated.push({
          memberId: member.id,
          status: "red",
          reason: "not_found",
          officeGroup: null,
        })
        continue
      }

      const groupMismatch = !shouldCheckGroupOverarching && memberGroup !== matched.group
      const dataMismatch = hasDataMismatch(member, matched, baseReason)

      if (groupMismatch) {
        statusCounts.yellow += 1
        reasonCounts.group_mismatch += 1
        evaluated.push({
          memberId: member.id,
          status: "yellow",
          reason: "group_mismatch",
          officeGroup: matched.group,
        })
        continue
      }

      if (dataMismatch) {
        statusCounts.yellow += 1
        reasonCounts[baseReason] += 1
        evaluated.push({
          memberId: member.id,
          status: "yellow",
          reason: baseReason,
          officeGroup: matched.group,
        })
        continue
      }

      statusCounts.green += 1
      reasonCounts[baseReason] += 1
      evaluated.push({
        memberId: member.id,
        status: "green",
        reason: baseReason,
        officeGroup: matched.group,
      })
    }

    const checkedAt = new Date().toISOString()
    const writableEvaluations = evaluated.filter((entry) => entry.status === "green" || entry.status === "yellow" || entry.status === "red")

    if (mode === "apply" && writableEvaluations.length > 0) {
      for (const chunk of chunkArray(writableEvaluations, 50)) {
        const responses = await Promise.all(
          chunk.map((entry) =>
            supabase
              .from("members")
              .update({
                office_list_status: entry.status,
                office_list_group: entry.officeGroup,
                office_list_checked_at: checkedAt,
              })
              .eq("id", entry.memberId)
          )
        )

        for (const response of responses) {
          if (!response.error) continue

          if (isMissingOfficeListColumnError(response.error)) {
            throw getOfficeListMigrationError()
          }

          throw response.error
        }
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      dryRun: mode === "dry_run",
      checkedAt,
      runId: activeRun.id,
      runCheckedAt: activeRun.checked_at ?? null,
      scopeGroups,
      counts: statusCounts,
      reasons: reasonCounts,
      summary: {
        basisRowsTotal: basisRows.length,
        basisRowsInScope: scopeRows.length,
        membersTotal: members.length,
        membersInScope: writableEvaluations.length,
        updated: mode === "apply" ? writableEvaluations.length : 0,
      },
    })
  } catch (error) {
    console.error("admin excel abgleich sync failed", error)

    if (error instanceof Error && error.message === getOfficeListMigrationError().message) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }

    return NextResponse.json({ error: "Serverfehler" }, { status: 500 })
  }
}
