import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { getOfficeListStatusLabel, type OfficeListResultStatus, type OfficeListStatus } from "@/lib/officeListStatus"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup, parseTrainingGroup, type TrainingGroup } from "@/lib/trainingGroups"

export const runtime = "nodejs"

type MemberRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  birthdate?: string | null
  email?: string | null
  phone?: string | null
  base_group?: string | null
  is_approved?: boolean | null
  is_trial?: boolean | null
  office_list_status?: string | null
  office_list_group?: string | null
  office_list_checked_at?: string | null
}

type TrainerAccountRow = {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  linked_member_id?: string | null
}

type ParsedExcelRow = {
  fileName: string
  group: TrainingGroup
  fileIndex: number
  index: number
  firstName: string
  lastName: string
  birthdate: string
  email: string
  phone: string
}

type ResultRow = {
  id: string
  memberId: string | null
  isTrainerLinked?: boolean
  firstName: string
  lastName: string
  birthdate: string
  source: string
  excel: "Ja" | "Nein"
  db: "Ja" | "Nein"
  tsvMember: "Ja" | "Nein" | "—"
  groupExcel: string
  groupDb: string
  status: OfficeListResultStatus
  note: string
}

type ReconcileMetricSummary = {
  excelTotal: number
  foundInDb: number
  green: number
  yellow: number
  red: number
  gray: number
}

type ReconcileResponsePayload = {
  runId: string | null
  runStatus: "green" | "gray"
  isActive: boolean
  storageAvailable: boolean
  checkedAt: string
  fileCount: number
  files: FileSummary[]
  metrics: ReconcileMetricSummary
  history: RunHistoryEntry[]
  rows: Array<ResultRow & { statusLabel: string }>
}

type RunHistoryEntry = {
  id: string
  checkedAt: string
  isActive: boolean
  runStatus: "green" | "gray"
  fileCount: number
  metrics: ReconcileMetricSummary
}

type FileSummary = {
  fileName: string
  group: TrainingGroup
  rowCount: number
}

type ExcelFieldKey = "firstName" | "lastName" | "birthdate" | "email" | "phone"

type HeaderDetection = {
  headerRowIndex: number
  columns: Partial<Record<ExcelFieldKey, number>>
}

type MemberUpdateEntry = {
  status: OfficeListStatus
  groups: Set<string>
}

type StoredRunRow = {
  id: string
  checked_at?: string | null
  is_active?: boolean | null
  run_status?: string | null
  file_count?: number | null
  files?: unknown
  metrics?: unknown
  rows?: unknown
}

const HEADER_SCAN_LIMIT = 15
const DATA_START_ROW_FALLBACK_INDEX = 4
const HEURISTIC_SAMPLE_LIMIT = 25
const OFFICE_LIST_REQUIRED_COLUMNS = ["office_list_status", "office_list_group", "office_list_checked_at"] as const
const OFFICE_RUNS_TABLE = "office_reconciliation_runs"
const NON_BLOCKING_MATCH_HINTS = new Set([
  "Treffer über E-Mail",
  "Treffer über Telefon",
  "Treffer über Vor- und Nachname",
  "Treffer über ähnlichen Namen",
  "Treffer über Trainerkonto",
  "Geburtsdatum abweichend",
  "Vorname abweichend",
  "Nachname abweichend",
  "E-Mail abweichend",
  "Telefon abweichend",
])

const HEADER_ALIASES: Record<ExcelFieldKey, string[]> = {
  firstName: [
    "vorname",
    "vornamen",
    "firstname",
    "first",
    "namevorname",
    "mitgliedvorname",
    "rufname",
    "rufnamen",
  ],
  lastName: [
    "nachname",
    "lastname",
    "last",
    "namenachname",
    "mitgliednachname",
    "surname",
    "familienname",
    "name",
    "namen",
  ],
  birthdate: [
    "birthdate",
    "geburtsdatum",
    "geburtsdat",
    "gebdatum",
    "gebdat",
    "geburtstag",
    "dob",
    "geb",
  ],
  email: ["email", "mail", "emailadresse", "mailadresse", "e-mail"],
  phone: [
    "phone",
    "telefon",
    "telefonnummer",
    "telefonnr",
    "tel",
    "mobil",
    "mobile",
    "mobilnummer",
    "mobiltelefon",
    "handy",
    "handynummer",
  ],
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
  return OFFICE_LIST_REQUIRED_COLUMNS.some((column) => isMissingColumnError(error, column))
}

function getOfficeListMigrationError() {
  return new Error(
    "Die Datenbank kennt den GS-Abgleich noch nicht. Bitte fuehre zuerst supabase/member_office_list_fields.sql in Supabase aus."
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

function isMissingTrainerLinkError(error: { message?: string; details?: string; code?: string } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  return isMissingColumnError(error, "linked_member_id") || message.includes("trainer_accounts")
}

function getOfficeRunStorageMigrationError() {
  return new Error(
    "Die Datenbank kennt den gespeicherten GS-Sammelabgleich noch nicht. Bitte fuehre zuerst supabase/member_office_list_fields.sql in Supabase aus."
  )
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? "").replace(/[^\d+]/g, "")
}

function normalizeHeader(value: string | null | undefined) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "")
}

function matchesHeaderAlias(normalizedHeader: string, alias: string) {
  if (normalizedHeader === alias) return true
  if (alias.length < 5) return false
  return normalizedHeader.startsWith(alias) || alias.startsWith(normalizedHeader)
}

function getCellText(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  return String(value ?? "").trim()
}

function toIsoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      const year = String(parsed.y).padStart(4, "0")
      const month = String(parsed.m).padStart(2, "0")
      const day = String(parsed.d).padStart(2, "0")
      return `${year}-${month}-${day}`
    }
  }

  const text = String(value ?? "").trim()
  if (!text) return ""

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) return text

  const dottedMatch = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dottedMatch) {
    const day = dottedMatch[1].padStart(2, "0")
    const month = dottedMatch[2].padStart(2, "0")
    const year = dottedMatch[3]
    return `${year}-${month}-${day}`
  }

  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return text
}

function getRowValue(cells: unknown[], index?: number) {
  if (index === undefined) return ""
  return getCellText(cells[index])
}

function isPlausibleIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (year < 1900 || year > 2100) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false

  return true
}

function hasLetterContent(value: string) {
  return /[a-zA-ZäöüÄÖÜß]/.test(value)
}

function splitFullName(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length <= 1) {
    return {
      firstName: value.trim(),
      lastName: "",
    }
  }

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  }
}

function detectBestColumn(rows: unknown[][], predicate: (value: string) => boolean, excludedColumns = new Set<number>()) {
  const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0)
  let bestColumn: number | undefined
  let bestScore = 0

  for (let columnIndex = 0; columnIndex < maxColumns; columnIndex += 1) {
    if (excludedColumns.has(columnIndex)) continue

    let score = 0
    for (const row of rows) {
      const value = getCellText(row[columnIndex])
      if (predicate(value)) {
        score += 1
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestColumn = columnIndex
    }
  }

  return bestScore > 0 ? bestColumn : undefined
}

function parseExcelRowsWithoutHeader(rows: unknown[][], fileName: string, group: TrainingGroup, fileIndex: number) {
  const candidateRows = rows
    .slice(DATA_START_ROW_FALLBACK_INDEX)
    .filter((row) => row.some((cell) => normalizeText(getCellText(cell)) !== ""))

  if (candidateRows.length === 0) return []

  const sampleRows = candidateRows.slice(0, HEURISTIC_SAMPLE_LIMIT)
  const excludedColumns = new Set<number>()

  const birthdateColumn = detectBestColumn(sampleRows, (value) => isPlausibleIsoDate(toIsoDate(value)))
  if (birthdateColumn !== undefined) excludedColumns.add(birthdateColumn)

  const emailColumn = detectBestColumn(sampleRows, (value) => /@/.test(value), excludedColumns)
  if (emailColumn !== undefined) excludedColumns.add(emailColumn)

  const phoneColumn = detectBestColumn(
    sampleRows,
    (value) => normalizePhone(value).length >= 6,
    excludedColumns,
  )
  if (phoneColumn !== undefined) excludedColumns.add(phoneColumn)

  let firstNameColumn: number | undefined
  let lastNameColumn: number | undefined
  let fullNameColumn: number | undefined

  const maxColumns = sampleRows.reduce((max, row) => Math.max(max, row.length), 0)
  let bestPairScore = 0

  for (let columnIndex = 0; columnIndex < maxColumns - 1; columnIndex += 1) {
    if (excludedColumns.has(columnIndex) || excludedColumns.has(columnIndex + 1)) continue

    let pairScore = 0
    for (const row of sampleRows) {
      const left = getCellText(row[columnIndex])
      const right = getCellText(row[columnIndex + 1])
      if (hasLetterContent(left) && hasLetterContent(right)) {
        pairScore += 1
      }
    }

    if (pairScore > bestPairScore) {
      bestPairScore = pairScore
      firstNameColumn = columnIndex
      lastNameColumn = columnIndex + 1
    }
  }

  if (bestPairScore < 3) {
    firstNameColumn = undefined
    lastNameColumn = undefined
    fullNameColumn = detectBestColumn(sampleRows, (value) => hasLetterContent(value), excludedColumns)
  }

  const parsedRows = candidateRows
    .map<ParsedExcelRow>((cells, index) => {
      const rawFirstName = firstNameColumn !== undefined ? getRowValue(cells, firstNameColumn) : ""
      const rawLastName = lastNameColumn !== undefined ? getRowValue(cells, lastNameColumn) : ""
      const fallbackName = fullNameColumn !== undefined ? splitFullName(getRowValue(cells, fullNameColumn)) : { firstName: "", lastName: "" }
      const firstName = rawFirstName || fallbackName.firstName
      const lastName = rawLastName || fallbackName.lastName

      return {
        fileName,
        group,
        fileIndex,
        index: DATA_START_ROW_FALLBACK_INDEX + index + 1,
        firstName,
        lastName,
        birthdate: toIsoDate(getRowValue(cells, birthdateColumn)),
        email: getRowValue(cells, emailColumn),
        phone: getRowValue(cells, phoneColumn),
      }
    })
    .filter((row) => row.firstName || row.lastName)

  return parsedRows.length >= 2 ? parsedRows : []
}

function scoreHeaderRow(cells: unknown[]): HeaderDetection | null {
  const columns: Partial<Record<ExcelFieldKey, number>> = {}
  let score = 0

  cells.forEach((cell, index) => {
    const normalized = normalizeHeader(getCellText(cell))
    if (!normalized) return

    ;(Object.keys(HEADER_ALIASES) as ExcelFieldKey[]).forEach((field) => {
      if (columns[field] !== undefined) return
      if (!HEADER_ALIASES[field].some((alias) => matchesHeaderAlias(normalized, alias))) return
      columns[field] = index
      score += field === "firstName" || field === "lastName" ? 3 : 1
    })
  })

  const hasNameData = columns.firstName !== undefined || columns.lastName !== undefined
  if (!hasNameData) return null

  if (columns.firstName !== undefined && columns.lastName !== undefined) {
    score += 4
  }

  if (columns.birthdate !== undefined) {
    score += 2
  }

  if (score < 6) return null

  return {
    headerRowIndex: -1,
    columns,
  }
}

function findHeaderRow(rows: unknown[][]): HeaderDetection | null {
  let bestMatch: HeaderDetection | null = null
  let bestScore = -1

  for (let index = 0; index < Math.min(rows.length, HEADER_SCAN_LIMIT); index += 1) {
    const cells = rows[index] ?? []
    const filledCells = cells.filter((cell) => normalizeText(getCellText(cell)) !== "")
    if (filledCells.length === 0) continue

    const candidate = scoreHeaderRow(cells)
    if (!candidate) continue

    let score = 0
    if (candidate.columns.firstName !== undefined) score += 3
    if (candidate.columns.lastName !== undefined) score += 3
    if (candidate.columns.birthdate !== undefined) score += 2
    if (candidate.columns.email !== undefined) score += 1
    if (candidate.columns.phone !== undefined) score += 1
    if (candidate.columns.firstName !== undefined && candidate.columns.lastName !== undefined) score += 4

    if (score > bestScore) {
      bestScore = score
      bestMatch = {
        headerRowIndex: index,
        columns: candidate.columns,
      }
    }
  }

  return bestMatch
}

function parseExcelRows(buffer: Buffer, fileName: string, group: TrainingGroup, fileIndex: number) {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    dense: true,
  })

  if (workbook.SheetNames.length === 0) {
    throw new Error(`Die Excel-Datei \"${fileName}\" enthält kein Tabellenblatt.`)
  }

  let headerFoundInAnySheet = false
  let firstHeaderSheetName: string | null = null

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName]
    if (!worksheet) continue

    const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
      raw: true,
      dateNF: "yyyy-mm-dd",
      blankrows: false,
    })

    const header = findHeaderRow(sheetRows)
    if (!header) {
      const fallbackRows = parseExcelRowsWithoutHeader(sheetRows, fileName, group, fileIndex)
      if (fallbackRows.length > 0) {
        return fallbackRows
      }
      continue
    }

    headerFoundInAnySheet = true
    if (!firstHeaderSheetName) {
      firstHeaderSheetName = sheetName
    }

    const dataRows = sheetRows
      .slice(header.headerRowIndex + 1)
      .map<ParsedExcelRow>((cells, index) => ({
        fileName,
        group,
        fileIndex,
        index: header.headerRowIndex + index + 1,
        firstName: getRowValue(cells, header.columns.firstName),
        lastName: getRowValue(cells, header.columns.lastName),
        birthdate: toIsoDate(getRowValue(cells, header.columns.birthdate)),
        email: getRowValue(cells, header.columns.email),
        phone: getRowValue(cells, header.columns.phone),
      }))
      .filter((row) => row.firstName || row.lastName)

    if (dataRows.length > 0) {
      return dataRows
    }
  }

  if (headerFoundInAnySheet) {
    throw new Error(
      `In \"${firstHeaderSheetName ?? "dem Tabellenblatt"}\" von \"${fileName}\" wurde eine Kopfzeile erkannt, aber keine Personenzeilen mit Vor- oder Nachnamen gefunden.`
    )
  }

  throw new Error(
    `In \"${fileName}\" wurde keine passende Kopfzeile erkannt. Erwartet werden zum Beispiel Vorname/Name/Rufname, Nachname/Familienname, Geburtsdatum, E-Mail oder Telefon in den ersten Zeilen.`
  )
}

function buildPrimaryKey(firstName: string, lastName: string, birthdate: string) {
  return [normalizeText(firstName), normalizeText(lastName), birthdate].join("|")
}

function buildNameKey(firstName: string, lastName: string) {
  return [normalizeText(firstName), normalizeText(lastName)].join("|")
}

function buildLastNameKey(lastName: string) {
  return normalizeText(lastName)
}

function buildEmailKey(email: string) {
  return normalizeText(email)
}

function buildPhoneKey(phone: string) {
  return normalizePhone(phone)
}

function getFirstNameTokens(value?: string | null) {
  return normalizeText(value)
    .split(" ")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function areCompatibleFirstNames(left?: string | null, right?: string | null) {
  const leftTokens = getFirstNameTokens(left)
  const rightTokens = getFirstNameTokens(right)

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false
  }

  return leftTokens.some((leftToken) => rightTokens.some((rightToken) => leftToken === rightToken || leftToken.startsWith(rightToken) || rightToken.startsWith(leftToken)))
}

function areCompatiblePersonNames(leftFirst?: string | null, leftLast?: string | null, rightFirst?: string | null, rightLast?: string | null) {
  if (normalizeText(leftLast) !== normalizeText(rightLast)) {
    return false
  }

  const normalizedLeftFirst = normalizeText(leftFirst)
  const normalizedRightFirst = normalizeText(rightFirst)
  if (normalizedLeftFirst && normalizedRightFirst && normalizedLeftFirst === normalizedRightFirst) {
    return true
  }

  return areCompatibleFirstNames(leftFirst, rightFirst)
}

function parseIsoDateValue(value?: string | null) {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const parsed = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isFinite(parsed) ? parsed : null
}

function isCloseBirthdateMatch(left?: string | null, right?: string | null) {
  if (!left || !right) return false
  if (left === right) return true

  const leftValue = parseIsoDateValue(left)
  const rightValue = parseIsoDateValue(right)
  if (leftValue === null || rightValue === null) return false

  return Math.abs(leftValue - rightValue) <= 24 * 60 * 60 * 1000
}

function isCompatibleBirthdateMatch(left?: string | null, right?: string | null) {
  if (!left || !right) return true
  return isCloseBirthdateMatch(left, right)
}

function isTsvMember(member: MemberRow) {
  return Boolean(member.is_approved) && !member.is_trial
}

function isRelevantOfficeMember(member: MemberRow) {
  return !member.is_approved && !member.is_trial
}

function collectMatchHints(excelRow: ParsedExcelRow, member: MemberRow, _excelGroup: TrainingGroup, matchSource: string) {
  const hints: string[] = []

  if (matchSource === "email") {
    hints.push("Treffer über E-Mail")
  }

  if (matchSource === "phone") {
    hints.push("Treffer über Telefon")
  }

  if (matchSource === "name") {
    hints.push("Treffer über Vor- und Nachname")
  }

  if (matchSource === "relaxed-name") {
    hints.push("Treffer über ähnlichen Namen")
  }

  if (matchSource === "trainer-linked") {
    hints.push("Treffer über Trainerkonto")
  }

  if (excelRow.birthdate && member.birthdate && excelRow.birthdate !== member.birthdate) {
    hints.push("Geburtsdatum abweichend")
  }

  if (normalizeText(excelRow.firstName) !== normalizeText(member.first_name || "")) {
    hints.push("Vorname abweichend")
  }

  if (normalizeText(excelRow.lastName) !== normalizeText(member.last_name || "")) {
    hints.push("Nachname abweichend")
  }

  const excelEmail = buildEmailKey(excelRow.email)
  const dbEmail = buildEmailKey(member.email || "")
  if (excelEmail && dbEmail && excelEmail !== dbEmail) {
    hints.push("E-Mail abweichend")
  }

  const excelPhone = buildPhoneKey(excelRow.phone)
  const dbPhone = buildPhoneKey(member.phone || "")
  if (excelPhone && dbPhone && excelPhone !== dbPhone) {
    hints.push("Telefon abweichend")
  }

  return Array.from(new Set(hints))
}

function hasBlockingMismatch(hints: string[]) {
  return hints.some((hint) => !NON_BLOCKING_MATCH_HINTS.has(hint))
}

function buildMetrics(rows: ResultRow[]): ReconcileMetricSummary {
  return {
    excelTotal: rows.filter((row) => row.excel === "Ja").length,
    foundInDb: rows.filter((row) => row.excel === "Ja" && row.db === "Ja").length,
    green: rows.filter((row) => row.status === "green").length,
    yellow: rows.filter((row) => row.status === "yellow").length,
    red: rows.filter((row) => row.status === "red").length,
    gray: rows.filter((row) => row.status === "gray").length,
  }
}

function buildResponsePayload(input: {
  runId: string | null
  runStatus: "green" | "gray"
  isActive: boolean
  storageAvailable?: boolean
  checkedAt: string
  files: FileSummary[]
  metrics: ReconcileMetricSummary
  history?: RunHistoryEntry[]
  rows: ResultRow[]
}): ReconcileResponsePayload {
  return {
    runId: input.runId,
    runStatus: input.runStatus,
    isActive: input.isActive,
    storageAvailable: input.storageAvailable ?? true,
    checkedAt: input.checkedAt,
    fileCount: input.files.length,
    files: input.files,
    metrics: input.metrics,
    history: input.history ?? [],
    rows: input.rows.map((row) => ({
      ...row,
      statusLabel: getOfficeListStatusLabel(row.status),
    })),
  }
}

function isFileSummaryArray(value: unknown): value is FileSummary[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as FileSummary).fileName === "string" &&
        typeof (entry as FileSummary).group === "string" &&
        typeof (entry as FileSummary).rowCount === "number"
    )
  )
}

function isMetricSummary(value: unknown): value is ReconcileMetricSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ReconcileMetricSummary).excelTotal === "number" &&
    typeof (value as ReconcileMetricSummary).foundInDb === "number" &&
    typeof (value as ReconcileMetricSummary).green === "number" &&
    typeof (value as ReconcileMetricSummary).yellow === "number" &&
    typeof (value as ReconcileMetricSummary).red === "number" &&
    typeof (value as ReconcileMetricSummary).gray === "number"
  )
}

function isResultRowArray(value: unknown): value is ResultRow[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as ResultRow).id === "string" &&
        typeof (entry as ResultRow).firstName === "string" &&
        typeof (entry as ResultRow).lastName === "string" &&
        typeof (entry as ResultRow).birthdate === "string" &&
        typeof (entry as ResultRow).source === "string" &&
        typeof (entry as ResultRow).excel === "string" &&
        typeof (entry as ResultRow).db === "string" &&
        typeof (entry as ResultRow).tsvMember === "string" &&
        typeof (entry as ResultRow).groupExcel === "string" &&
        typeof (entry as ResultRow).groupDb === "string" &&
        typeof (entry as ResultRow).status === "string" &&
        typeof (entry as ResultRow).note === "string"
    )
  )
}

function mapStoredRunToResponsePayload(run: StoredRunRow): ReconcileResponsePayload | null {
  const checkedAt = run.checked_at || null
  const files = isFileSummaryArray(run.files) ? run.files : []
  const metrics = isMetricSummary(run.metrics) ? run.metrics : null
  const rows = isResultRowArray(run.rows) ? run.rows : []

  if (!checkedAt || !metrics) return null

  return buildResponsePayload({
    runId: run.id,
    runStatus: run.run_status === "gray" ? "gray" : "green",
    isActive: run.is_active !== false,
    checkedAt,
    files,
    metrics,
    history: [],
    rows,
  })
}

function mapStoredRunToHistoryEntry(run: StoredRunRow): RunHistoryEntry | null {
  const checkedAt = run.checked_at || null
  const metrics = isMetricSummary(run.metrics) ? run.metrics : null

  if (!checkedAt || !metrics) return null

  return {
    id: run.id,
    checkedAt,
    isActive: run.is_active !== false,
    runStatus: run.run_status === "gray" ? "gray" : "green",
    fileCount: typeof run.file_count === "number" ? run.file_count : 0,
    metrics,
  }
}

async function storeActiveReconcileRun(
  supabase: ReturnType<typeof getServerSupabase>,
  payload: Omit<ReconcileResponsePayload, "rows"> & { rows: ResultRow[] }
) {
  const deactivateResponse = await supabase
    .from(OFFICE_RUNS_TABLE)
    .update({ is_active: false, run_status: "gray" })
    .eq("is_active", true)

  if (deactivateResponse.error) {
    if (isMissingOfficeRunStorageError(deactivateResponse.error)) {
      throw getOfficeRunStorageMigrationError()
    }

    throw deactivateResponse.error
  }

  const insertResponse = await supabase
    .from(OFFICE_RUNS_TABLE)
    .insert({
      checked_at: payload.checkedAt,
      is_active: true,
      run_status: "green",
      file_count: payload.fileCount,
      files: payload.files,
      metrics: payload.metrics,
      rows: payload.rows,
    })
    .select("id, checked_at, is_active, run_status, file_count, files, metrics, rows")
    .single()

  if (insertResponse.error) {
    if (isMissingOfficeRunStorageError(insertResponse.error)) {
      throw getOfficeRunStorageMigrationError()
    }

    throw insertResponse.error
  }

  return mapStoredRunToResponsePayload(insertResponse.data as StoredRunRow)
}

async function getActiveReconcileRun(supabase: ReturnType<typeof getServerSupabase>) {
  const response = await supabase
    .from(OFFICE_RUNS_TABLE)
    .select("id, checked_at, is_active, run_status, file_count, files, metrics, rows")
    .eq("is_active", true)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (response.error) {
    if (isMissingOfficeRunStorageError(response.error)) {
      return null
    }

    throw response.error
  }

  if (!response.data) return null
  return mapStoredRunToResponsePayload(response.data as StoredRunRow)
}

async function getRecentReconcileRunHistory(supabase: ReturnType<typeof getServerSupabase>, limit = 5) {
  const response = await supabase
    .from(OFFICE_RUNS_TABLE)
    .select("id, checked_at, is_active, run_status, file_count, metrics")
    .order("checked_at", { ascending: false })
    .limit(limit)

  if (response.error) {
    if (isMissingOfficeRunStorageError(response.error)) {
      return null
    }

    throw response.error
  }

  return ((response.data ?? []) as StoredRunRow[])
    .map(mapStoredRunToHistoryEntry)
    .filter((entry): entry is RunHistoryEntry => Boolean(entry))
}

async function getLinkedTrainerMemberIds(supabase: ReturnType<typeof getServerSupabase>) {
  const response = await supabase.from("trainer_accounts").select("linked_member_id").not("linked_member_id", "is", null)

  if (response.error) {
    if (isMissingTrainerLinkError(response.error)) {
      return new Set<string>()
    }

    throw response.error
  }

  return new Set(
    ((response.data ?? []) as Array<{ linked_member_id?: string | null }>)
      .map((row) => row.linked_member_id?.trim() ?? "")
      .filter(Boolean)
  )
}

async function getTrainerAccountsForReconcile(supabase: ReturnType<typeof getServerSupabase>) {
  const response = await supabase.from("trainer_accounts").select("first_name, last_name, email, linked_member_id")

  if (response.error) {
    if (isMissingTrainerLinkError(response.error)) {
      return [] as TrainerAccountRow[]
    }

    throw response.error
  }

  return ((response.data ?? []) as TrainerAccountRow[]).map((row) => ({
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    email: row.email ?? null,
    linked_member_id: row.linked_member_id ?? null,
  }))
}

async function resetRelevantMembersToRed(supabase: ReturnType<typeof getServerSupabase>, memberIds: string[], checkedAt: string) {
  for (const chunk of chunkArray(memberIds, 200)) {
    const response = await supabase
      .from("members")
      .update({
        office_list_status: "red",
        office_list_group: null,
        office_list_checked_at: checkedAt,
      })
      .in("id", chunk)

    if (response.error) {
      if (isMissingOfficeListColumnError(response.error)) {
        throw getOfficeListMigrationError()
      }

      throw response.error
    }
  }
}

async function applyMemberOfficeUpdates(
  supabase: ReturnType<typeof getServerSupabase>,
  updates: Array<{ memberId: string; status: OfficeListStatus; group: string; checkedAt: string }>
) {
  for (const chunk of chunkArray(updates, 25)) {
    const responses = await Promise.all(
      chunk.map((entry) =>
        supabase
          .from("members")
          .update({
            office_list_status: entry.status,
            office_list_group: entry.group || null,
            office_list_checked_at: entry.checkedAt,
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

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-excel-abgleich-fetch:${getRequestIp(request)}`, 40, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const activeRun = await getActiveReconcileRun(supabase)

    if (!activeRun) {
      return new NextResponse(null, { status: 204 })
    }

    const history = (await getRecentReconcileRunHistory(supabase)) ?? []

    return NextResponse.json({
      ...activeRun,
      storageAvailable: true,
      history,
    } satisfies ReconcileResponsePayload)
  } catch (error) {
    console.error("admin excel abgleich fetch failed", error)
    return new NextResponse(error instanceof Error ? error.message : "Internal server error", { status: 500 })
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

    const rateLimit = await checkRateLimitAsync(`admin-excel-abgleich:${getRequestIp(request)}`, 20, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const formData = await request.formData()
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File)
    const groups = formData.getAll("groups").map((entry) => parseTrainingGroup(entry?.toString()))

    if (files.length === 0) {
      return new NextResponse("Bitte mindestens eine Excel-Datei hochladen.", { status: 400 })
    }

    if (groups.length !== files.length || groups.some((group) => !group)) {
      return new NextResponse("Bitte jeder Datei eine gültige Gruppe zuordnen.", { status: 400 })
    }

    const fileSummaries: FileSummary[] = []
    const excelRows: ParsedExcelRow[] = []

    for (const [index, file] of files.entries()) {
      const group = groups[index]
      if (!group) {
        return new NextResponse("Bitte jeder Datei eine gültige Gruppe zuordnen.", { status: 400 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const parsedRows = parseExcelRows(buffer, file.name, group, index)

      if (parsedRows.length === 0) {
        return new NextResponse(`Die Excel-Datei \"${file.name}\" enthaelt keine lesbaren Datensaetze.`, { status: 400 })
      }

      fileSummaries.push({ fileName: file.name, group, rowCount: parsedRows.length })
      excelRows.push(...parsedRows)
    }

    const supabase = getServerSupabase()
    const [membersResponse, linkedTrainerMemberIds, trainerAccounts] = await Promise.all([
      supabase
        .from("members")
        .select(
          "id, first_name, last_name, birthdate, email, phone, base_group, is_approved, is_trial, office_list_status, office_list_group, office_list_checked_at"
        )
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true }),
      getLinkedTrainerMemberIds(supabase),
      getTrainerAccountsForReconcile(supabase),
    ])

    if (membersResponse.error) {
      if (isMissingOfficeListColumnError(membersResponse.error)) {
        throw getOfficeListMigrationError()
      }
      throw membersResponse.error
    }

    const members = ((membersResponse.data ?? []) as MemberRow[]).map((member) => ({
      ...member,
      base_group: normalizeTrainingGroup(member.base_group) || member.base_group,
    }))

    const relevantMembers = members.filter(isRelevantOfficeMember)
    const checkedAt = new Date().toISOString()

    if (relevantMembers.length > 0) {
      await resetRelevantMembersToRed(
        supabase,
        relevantMembers.map((member) => member.id),
        checkedAt
      )
    }

    const membersByPrimaryKey = new Map<string, MemberRow[]>()
    const membersByNameKey = new Map<string, MemberRow[]>()
    const membersByLastName = new Map<string, MemberRow[]>()
    const membersByEmail = new Map<string, MemberRow[]>()
    const membersByPhone = new Map<string, MemberRow[]>()
    const membersById = new Map<string, MemberRow>()
    const trainerAccountsByLastName = new Map<string, TrainerAccountRow[]>()
    const trainerAccountsByEmail = new Map<string, TrainerAccountRow[]>()

    for (const member of members) {
      membersById.set(member.id, member)

      const primaryKey = buildPrimaryKey(member.first_name || "", member.last_name || "", member.birthdate || "")
      if (!membersByPrimaryKey.has(primaryKey)) membersByPrimaryKey.set(primaryKey, [])
      membersByPrimaryKey.get(primaryKey)?.push(member)

      const nameKey = buildNameKey(member.first_name || "", member.last_name || "")
      if (!membersByNameKey.has(nameKey)) membersByNameKey.set(nameKey, [])
      membersByNameKey.get(nameKey)?.push(member)

      const lastNameKey = buildLastNameKey(member.last_name || "")
      if (lastNameKey) {
        if (!membersByLastName.has(lastNameKey)) membersByLastName.set(lastNameKey, [])
        membersByLastName.get(lastNameKey)?.push(member)
      }

      const emailKey = buildEmailKey(member.email || "")
      if (emailKey) {
        if (!membersByEmail.has(emailKey)) membersByEmail.set(emailKey, [])
        membersByEmail.get(emailKey)?.push(member)
      }

      const phoneKey = buildPhoneKey(member.phone || "")
      if (phoneKey) {
        if (!membersByPhone.has(phoneKey)) membersByPhone.set(phoneKey, [])
        membersByPhone.get(phoneKey)?.push(member)
      }
    }

    for (const trainer of trainerAccounts) {
      const lastNameKey = buildLastNameKey(trainer.last_name || "")
      if (lastNameKey) {
        if (!trainerAccountsByLastName.has(lastNameKey)) trainerAccountsByLastName.set(lastNameKey, [])
        trainerAccountsByLastName.get(lastNameKey)?.push(trainer)
      }

      const emailKey = buildEmailKey(trainer.email || "")
      if (emailKey) {
        if (!trainerAccountsByEmail.has(emailKey)) trainerAccountsByEmail.set(emailKey, [])
        trainerAccountsByEmail.get(emailKey)?.push(trainer)
      }
    }

    const matchedRelevantMemberIds = new Set<string>()
    const memberUpdates = new Map<string, MemberUpdateEntry>()
    const resultRows: ResultRow[] = []

    for (const excelRow of excelRows) {
      const primaryMatches = membersByPrimaryKey.get(buildPrimaryKey(excelRow.firstName, excelRow.lastName, excelRow.birthdate)) ?? []
      const nameMatches = membersByNameKey.get(buildNameKey(excelRow.firstName, excelRow.lastName)) ?? []
      const relaxedNameMatches = (membersByLastName.get(buildLastNameKey(excelRow.lastName)) ?? []).filter(
        (candidate) =>
          areCompatiblePersonNames(excelRow.firstName, excelRow.lastName, candidate.first_name || "", candidate.last_name || "") &&
          isCompatibleBirthdateMatch(excelRow.birthdate, candidate.birthdate || "")
      )
      const emailMatches = excelRow.email ? membersByEmail.get(buildEmailKey(excelRow.email)) ?? [] : []
      const phoneMatches = excelRow.phone ? membersByPhone.get(buildPhoneKey(excelRow.phone)) ?? [] : []
      const trainerEmailMatches = excelRow.email ? trainerAccountsByEmail.get(buildEmailKey(excelRow.email)) ?? [] : []
      const trainerNameMatches = (trainerAccountsByLastName.get(buildLastNameKey(excelRow.lastName)) ?? []).filter((trainer) =>
        areCompatiblePersonNames(excelRow.firstName, excelRow.lastName, trainer.first_name || "", trainer.last_name || "")
      )

      let member: MemberRow | null = null
      let matchSource = "primary"
      let note = ""

      if (primaryMatches.length === 1) {
        member = primaryMatches[0]
      } else if (primaryMatches.length > 1) {
        note = "Mehrere DB-Treffer über Name und Geburtsdatum"
      } else if (emailMatches.length === 1) {
        member = emailMatches[0]
        matchSource = "email"
      } else if (emailMatches.length > 1) {
        note = "Mehrere DB-Treffer über E-Mail"
      } else if (phoneMatches.length === 1) {
        member = phoneMatches[0]
        matchSource = "phone"
      } else if (phoneMatches.length > 1) {
        note = "Mehrere DB-Treffer über Telefon"
      } else if (relaxedNameMatches.length === 1) {
        member = relaxedNameMatches[0]
        matchSource = "relaxed-name"
      } else if (relaxedNameMatches.length > 1) {
        note = "Mehrere DB-Treffer über ähnlichen Namen"
      } else if (nameMatches.length === 1) {
        member = nameMatches[0]
        matchSource = "name"
      } else if (nameMatches.length > 1) {
        note = "Mehrere DB-Treffer über Vor- und Nachname"
      } else {
        const trainerMatches = trainerEmailMatches.length > 0 ? trainerEmailMatches : trainerNameMatches

        if (trainerMatches.length === 1) {
          const linkedMemberId = trainerMatches[0]?.linked_member_id?.trim()
          if (linkedMemberId) {
            const linkedMember = membersById.get(linkedMemberId) ?? null
            if (linkedMember) {
              member = linkedMember
              matchSource = "trainer-linked"
            }
          } else {
            continue
          }
        } else if (trainerMatches.length > 1) {
          note = "Mehrere Trainer-Treffer ohne passendes Mitglied"
        }
      }

      if (!member) {
        const status: OfficeListResultStatus = note ? "yellow" : "gray"
        resultRows.push({
          id: `excel-${excelRow.fileIndex}-${excelRow.index}`,
          memberId: null,
          isTrainerLinked: false,
          firstName: excelRow.firstName,
          lastName: excelRow.lastName,
          birthdate: excelRow.birthdate || "—",
          source: excelRow.fileName,
          excel: "Ja",
          db: "Nein",
          tsvMember: "—",
          groupExcel: excelRow.group,
          groupDb: "—",
          status,
          note: note || "In Excel vorhanden, aber kein passender DB-Datensatz gefunden",
        })
        continue
      }

      const hints = collectMatchHints(excelRow, member, excelRow.group, matchSource)
      const status: OfficeListStatus = hasBlockingMismatch(hints) ? "yellow" : "green"
      const dbGroup = normalizeTrainingGroup(member.base_group) || member.base_group || "—"

      resultRows.push({
        id: `match-${member.id}-${excelRow.fileIndex}-${excelRow.index}`,
        memberId: member.id,
        isTrainerLinked: linkedTrainerMemberIds.has(member.id),
        firstName: member.first_name || excelRow.firstName,
        lastName: member.last_name || excelRow.lastName,
        birthdate: member.birthdate || excelRow.birthdate || "—",
        source: excelRow.fileName,
        excel: "Ja",
        db: "Ja",
        tsvMember: isTsvMember(member) ? "Ja" : "Nein",
        groupExcel: excelRow.group,
        groupDb: dbGroup,
        status,
        note: hints.join(" · ") || "Excel und DB stimmen überein",
      })

      if (!isRelevantOfficeMember(member)) {
        continue
      }

      matchedRelevantMemberIds.add(member.id)
      const existingUpdate = memberUpdates.get(member.id)

      if (!existingUpdate) {
        memberUpdates.set(member.id, {
          status,
          groups: new Set([excelRow.group]),
        })
        continue
      }

      existingUpdate.groups.add(excelRow.group)
      if (existingUpdate.status !== "yellow" && status === "yellow") {
        existingUpdate.status = "yellow"
      }
    }

    const relevantOnlyDbMembers = relevantMembers.filter((member) => !matchedRelevantMemberIds.has(member.id))

    for (const member of relevantOnlyDbMembers) {
      resultRows.push({
        id: `missing-${member.id}`,
        memberId: member.id,
        isTrainerLinked: linkedTrainerMemberIds.has(member.id),
        firstName: member.first_name || "",
        lastName: member.last_name || "",
        birthdate: member.birthdate || "—",
        source: "—",
        excel: "Nein",
        db: "Ja",
        tsvMember: isTsvMember(member) ? "Ja" : "Nein",
        groupExcel: "—",
        groupDb: normalizeTrainingGroup(member.base_group) || member.base_group || "—",
        status: "red",
        note: "Offene Freigabe wurde in keiner der hochgeladenen GS-Listen gefunden",
      })
    }

    const memberUpdatesPayload = Array.from(memberUpdates.entries()).map(([memberId, entry]) => ({
      memberId,
      status: entry.status,
      group: Array.from(entry.groups).sort((left, right) => left.localeCompare(right, "de")).join(" | "),
      checkedAt,
    }))

    if (memberUpdatesPayload.length > 0) {
      await applyMemberOfficeUpdates(supabase, memberUpdatesPayload)
    }

    const sortedRows = resultRows.sort((left, right) => {
      const statusOrder: Record<OfficeListResultStatus, number> = { yellow: 0, red: 1, gray: 2, green: 3 }
      const statusCompare = statusOrder[left.status] - statusOrder[right.status]
      if (statusCompare !== 0) return statusCompare

      const groupCompare = left.groupExcel.localeCompare(right.groupExcel, "de")
      if (groupCompare !== 0) return groupCompare

      const lastNameCompare = left.lastName.localeCompare(right.lastName, "de")
      if (lastNameCompare !== 0) return lastNameCompare

      return left.firstName.localeCompare(right.firstName, "de")
    })

    const responsePayload = buildResponsePayload({
      runId: null,
      runStatus: "green",
      isActive: true,
      storageAvailable: true,
      checkedAt,
      files: fileSummaries,
      metrics: buildMetrics(sortedRows),
      history: [],
      rows: sortedRows,
    })

    try {
      const storedRun = await storeActiveReconcileRun(supabase, {
        ...responsePayload,
        rows: sortedRows,
      })
      const history = (await getRecentReconcileRunHistory(supabase)) ?? []

      return NextResponse.json(
        storedRun
          ? {
              ...storedRun,
              storageAvailable: true,
              history,
            }
          : {
              ...responsePayload,
              storageAvailable: true,
              history,
            }
      )
    } catch (error) {
      if (error instanceof Error && error.message === getOfficeRunStorageMigrationError().message) {
        return NextResponse.json({
          ...responsePayload,
          storageAvailable: false,
          history: [],
        } satisfies ReconcileResponsePayload)
      }

      throw error
    }
  } catch (error) {
    console.error("admin excel abgleich failed", error)
    return new NextResponse(error instanceof Error ? error.message : "Internal server error", { status: 500 })
  }
}