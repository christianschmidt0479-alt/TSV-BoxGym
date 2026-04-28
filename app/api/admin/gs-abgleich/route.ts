

import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { TRAINING_GROUPS, type TrainingGroup } from "@/lib/trainingGroups"

export const runtime = "nodejs"

type MatchStatus = "match" | "mismatch" | "not_found"
type MemberRow = {
  id: string
  first_name: string | null
  last_name: string | null
  birthdate: string | null
  base_group: string | null
}
type ParsedGsMember = {
  firstName: string
  lastName: string
  birthdate: string
}

type RawRow = Record<string, unknown>

const LAST_NAME_HEADER_CANDIDATES = ["name", "nachname", "last_name", "lastname", "last name", "surname", "family_name"]
const FIRST_NAME_HEADER_CANDIDATES = ["vorname", "first_name", "firstname", "first name"]
const BIRTHDATE_HEADER_CANDIDATES = ["geburtsdatum", "gebdatum", "geburtstag", "geburts-datum", "birthdate", "date_of_birth", "dateofbirth", "dob"]

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

function findCellValue(row: Record<string, unknown>, expectedHeaders: string[]) {
  const normalizedExpected = new Set(expectedHeaders.map(normalizeHeader))
  for (const [rawKey, cellValue] of Object.entries(row)) {
    if (normalizedExpected.has(normalizeHeader(rawKey))) {
      return cellValue
    }
  }
  return null
}

function hasAnyHeader(normalizedHeaders: Set<string>, candidates: string[]) {
  return candidates.some((candidate) => normalizedHeaders.has(normalizeHeader(candidate)))
}

function findHeaderRowIndex(sheetRows: unknown[][]) {
  const maxRowsToScan = Math.min(10, sheetRows.length)

  if (process.env.NODE_ENV === "development") {
    console.log("[GS-Abgleich] Scanning first", maxRowsToScan, "rows for header")
  }

  for (let index = 0; index < maxRowsToScan; index += 1) {
    const row = sheetRows[index] ?? []
    const normalizedHeaders = new Set(
      row
        .map((cell) => normalizeHeader(String(cell ?? "")))
        .filter((value) => value.length > 0)
    )

    if (process.env.NODE_ENV === "development") {
      console.log(`[GS-Abgleich] Row ${index} raw:`, row.slice(0, 8))
      console.log(`[GS-Abgleich] Row ${index} normalized:`, [...normalizedHeaders].slice(0, 8))
    }

    const hasLastName = hasAnyHeader(normalizedHeaders, LAST_NAME_HEADER_CANDIDATES)
    const hasFirstName = hasAnyHeader(normalizedHeaders, FIRST_NAME_HEADER_CANDIDATES)
    const hasBirthdate = hasAnyHeader(normalizedHeaders, BIRTHDATE_HEADER_CANDIDATES)

    if (hasLastName && hasFirstName && hasBirthdate) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[GS-Abgleich] Header row detected at index ${index}`)
      }
      return index
    }
  }

  return -1
}

function looksLikeDataRow(row: unknown[]): boolean {
  const colA = String(row[0] ?? "").trim()
  const colB = String(row[1] ?? "").trim()
  const colC = row[2]
  if (!colA || !colB) return false
  // col C must be a number (Excel date serial) or a parseable date string
  if (typeof colC === "number" && Number.isFinite(colC) && colC > 1000) return true
  if (colC instanceof Date) return true
  if (typeof colC === "string" && colC.trim() && normalizeDate(colC) !== null) return true
  return false
}

function findFirstDataRowIndex(sheetRows: unknown[][]): number {
  for (let index = 0; index < sheetRows.length; index += 1) {
    if (looksLikeDataRow(sheetRows[index] ?? [])) return index
  }
  return -1
}

function parseGsRowsFixedColumns(dataRows: unknown[][]): ParsedGsMember[] {
  const parsed: ParsedGsMember[] = []
  for (const row of dataRows) {
    const firstName = String(row[0] ?? "").trim()
    const lastName = String(row[1] ?? "").trim()
    const birthdateRaw = row[2]
    if (!firstName && !lastName) continue
    parsed.push({
      firstName,
      lastName,
      birthdate: normalizeDate(birthdateRaw) ?? "",
    })
  }
  return parsed
}

function mapSheetRowsToObjects(headers: string[], dataRows: unknown[][]): RawRow[] {
  return dataRows.map((row) => {
    const next: RawRow = {}
    headers.forEach((header, index) => {
      const key = String(header ?? "").trim()
      if (!key) return
      next[key] = row[index] ?? null
    })
    return next
  })
}

function parseGsRows(rows: Record<string, unknown>[]): ParsedGsMember[] {
  const parsed: ParsedGsMember[] = []
  for (const row of rows) {
    const firstNameRaw = findCellValue(row, FIRST_NAME_HEADER_CANDIDATES)
    const lastNameRaw = findCellValue(row, LAST_NAME_HEADER_CANDIDATES)
    const birthdateRaw = findCellValue(row, BIRTHDATE_HEADER_CANDIDATES)
    const firstName = String(firstNameRaw ?? "").trim()
    const lastName = String(lastNameRaw ?? "").trim()
    if (!firstName && !lastName) continue
    parsed.push({
      firstName,
      lastName,
      birthdate: normalizeDate(birthdateRaw) ?? "",
    })
  }
  return parsed
}

function compareMembers(gsMembers: ParsedGsMember[], memberRows: MemberRow[]) {
  const byName = new Map<string, MemberRow[]>()
  const memberStatuses: Record<string, MatchStatus> = {}
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
        status: "not_found" as MatchStatus,
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
        status: "match" as MatchStatus,
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
      status: "mismatch" as MatchStatus,
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
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
    }
    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return NextResponse.json({ ok: false, error: "Nicht autorisiert" }, { status: 401 })
    }
    const rateLimit = await checkRateLimitAsync(`admin-gs-abgleich:${getRequestIp(request)}`, 20, 5 * 60 * 1000)
    if (!rateLimit.ok) {
      return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 })
    }
    const formData = await request.formData()
    const file = formData.get("file")
    const groupNameRaw = formData.get("groupName")
    const groupName = typeof groupNameRaw === "string" ? groupNameRaw : ""
    const validGroup = TRAINING_GROUPS.includes(groupName as TrainingGroup)
    if (!validGroup) {
      return NextResponse.json({ error: "Ungültige oder fehlende Gruppe" }, { status: 400 })
    }
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
    const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
      header: 1,
      raw: true,
      defval: "",
    })

    // 1. Versuche Kopfzeile in ersten 10 Zeilen zu finden
    const headerRowIndex = findHeaderRowIndex(sheetRows)
    let gsMembers: ParsedGsMember[]
    let parseMode: string

    if (headerRowIndex >= 0) {
      // Header-Modus: Kopfzeile gefunden
      parseMode = "header-row"
      const headers = (sheetRows[headerRowIndex] ?? []).map((cell) => String(cell ?? "").trim())
      const dataRows = sheetRows.slice(headerRowIndex + 1)
      if (process.env.NODE_ENV === "development") {
        console.log("[GS-Abgleich] parseMode", parseMode, "at index", headerRowIndex)
        console.log("[GS-Abgleich] headers raw", headers)
        console.log("[GS-Abgleich] first data rows", dataRows.slice(0, 3))
      }
      const rawRows = mapSheetRowsToObjects(headers, dataRows)
      gsMembers = parseGsRows(rawRows)
    } else {
      // Fixed-Column-Fallback: erste Datenzeile finden (A=Text, B=Text, C=Datum)
      parseMode = "fixed-columns"
      const firstDataIndex = findFirstDataRowIndex(sheetRows)
      if (process.env.NODE_ENV === "development") {
        console.log("[GS-Abgleich] parseMode", parseMode, "first data row index", firstDataIndex)
        console.log("[GS-Abgleich] first data rows", sheetRows.slice(firstDataIndex, firstDataIndex + 3))
      }
      if (firstDataIndex < 0) {
        return NextResponse.json(
          { error: "Keine Daten erkannt. Erwartet werden Spalten: Vorname (A), Nachname (B), Geburtsdatum (C)." },
          { status: 400 }
        )
      }
      gsMembers = parseGsRowsFixedColumns(sheetRows.slice(firstDataIndex))
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[GS-Abgleich] parsedMembers count", gsMembers.length)
      console.log("[GS-Abgleich] groupName", groupName)
    }
    const supabase = createServerSupabaseServiceClient()
    const { data, error } = await supabase
      .from("members")
      .select("id, first_name, last_name, birthdate, base_group")
      .eq("base_group", groupName)
    if (error) {
      throw error
    }
    const compared = compareMembers(gsMembers, (data ?? []) as MemberRow[])
    if (process.env.NODE_ENV === "development") {
      console.log("[GS-Abgleich] appMembers count", (data ?? []).length)
      console.log("[GS-Abgleich] results counts", {
        match: compared.results.filter((entry) => entry.status === "match").length,
        mismatch: compared.results.filter((entry) => entry.status === "mismatch").length,
        not_found: compared.results.filter((entry) => entry.status === "not_found").length,
      })
    }
    return NextResponse.json({ groupName, results: compared.results, memberStatuses: compared.memberStatuses })
  } catch (error) {
    console.error("admin gs-abgleich failed", error)
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 })
  }
}

