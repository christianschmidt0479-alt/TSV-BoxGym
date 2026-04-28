import { NextResponse } from "next/server"
import * as XLSX from "xlsx"

import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

export const runtime = "nodejs"

type RawRow = Record<string, unknown>

type ParsedGsMember = {
  firstName: string
  lastName: string
  birthdate: string | null
}

type MemberRow = {
  id: string
  first_name: string | null
  last_name: string | null
  birthdate: string | null
  base_group: string | null
}

type CompareStatus = "match" | "mismatch" | "not_found"

type CompareResult = {
  memberId: string | null
  firstName: string
  lastName: string
  birthdate: string | null
  group: string | null
  status: CompareStatus
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[\s_\-/.]+/g, "")
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function normalizeDate(value: unknown): string | null {
  if (value == null) return null

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null
    const y = String(parsed.y).padStart(4, "0")
    const m = String(parsed.m).padStart(2, "0")
    const d = String(parsed.d).padStart(2, "0")
    return `${y}-${m}-${d}`
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  const text = String(value).trim()
  if (!text) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text
  }

  const dotted = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/)
  if (dotted) {
    const day = dotted[1].padStart(2, "0")
    const month = dotted[2].padStart(2, "0")
    const year = dotted[3]
    return `${year}-${month}-${day}`
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return text.slice(0, 10)
  }

  return null
}

function findCellValue(row: RawRow, expectedHeaders: string[]) {
  const normalizedExpected = new Set(expectedHeaders.map(normalizeHeader))

  for (const [rawKey, cellValue] of Object.entries(row)) {
    if (normalizedExpected.has(normalizeHeader(rawKey))) {
      return cellValue
    }
  }

  return null
}

function parseGsRows(rows: RawRow[]): ParsedGsMember[] {
  const parsed: ParsedGsMember[] = []

  for (const row of rows) {
    const firstNameRaw = findCellValue(row, ["Vorname", "first_name", "firstname", "first name"])
    const lastNameRaw = findCellValue(row, ["Nachname", "last_name", "lastname", "last name"])
    const birthdateRaw = findCellValue(row, ["Geburtsdatum", "birthdate", "date_of_birth", "dob", "geburtstag"])

    const firstName = String(firstNameRaw ?? "").trim()
    const lastName = String(lastNameRaw ?? "").trim()

    if (!firstName && !lastName) {
      continue
    }

    parsed.push({
      firstName,
      lastName,
      birthdate: normalizeDate(birthdateRaw),
    })
  }

  return parsed
}

function compareMembers(gsMembers: ParsedGsMember[], memberRows: MemberRow[]) {
  const byName = new Map<string, MemberRow[]>()
  const memberStatuses: Record<string, CompareStatus> = {}

  for (const member of memberRows) {
    const key = `${normalizeName(member.first_name)}|${normalizeName(member.last_name)}`
    const existing = byName.get(key)
    if (existing) {
      existing.push(member)
    } else {
      byName.set(key, [member])
    }
  }

  const results = gsMembers.map((gsMember) => {
    const key = `${normalizeName(gsMember.firstName)}|${normalizeName(gsMember.lastName)}`
    const candidates = byName.get(key) ?? []

    if (candidates.length === 0) {
      return {
        memberId: null,
        firstName: gsMember.firstName,
        lastName: gsMember.lastName,
        birthdate: gsMember.birthdate,
        group: null,
        status: "not_found",
      }
    }

    const exact = candidates.find((candidate) => normalizeDate(candidate.birthdate) === gsMember.birthdate)
    if (exact) {
      memberStatuses[exact.id] = "match"
      return {
        memberId: exact.id,
        firstName: gsMember.firstName,
        lastName: gsMember.lastName,
        birthdate: gsMember.birthdate,
        group: exact.base_group,
        status: "match",
      }
    }

    if (candidates[0]?.id && memberStatuses[candidates[0].id] !== "match") {
      memberStatuses[candidates[0].id] = "mismatch"
    }

    return {
      memberId: candidates[0]?.id ?? null,
      firstName: gsMember.firstName,
      lastName: gsMember.lastName,
      birthdate: gsMember.birthdate,
      group: candidates[0]?.base_group ?? null,
      status: "mismatch",
    }
  })

  return {
    results,
    memberStatuses,
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

    const rateLimit = await checkRateLimitAsync(`admin-gs-abgleich:${getRequestIp(request)}`, 20, 5 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Datei fehlt" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const workbook = XLSX.read(bytes, { type: "array" })
    const firstSheetName = workbook.SheetNames[0]

    if (!firstSheetName) {
      return NextResponse.json({ error: "Leere Datei" }, { status: 400 })
    }

    const firstSheet = workbook.Sheets[firstSheetName]
    const rawRows = XLSX.utils.sheet_to_json<RawRow>(firstSheet, {
      defval: null,
      raw: true,
    })

    const gsMembers = parseGsRows(rawRows)

    const supabase = createServerSupabaseServiceClient()
    const { data, error } = await supabase
      .from("members")
      .select("id, first_name, last_name, birthdate, base_group")

    if (error) {
      throw error
    }

    const compared = compareMembers(gsMembers, (data ?? []) as MemberRow[])

    return NextResponse.json({ results: compared.results, memberStatuses: compared.memberStatuses })
  } catch (error) {
    console.error("admin gs-abgleich failed", error)
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 })
  }
}
