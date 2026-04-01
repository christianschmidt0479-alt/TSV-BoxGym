import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
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
}

type ExcelRow = {
  index: number
  firstName: string
  lastName: string
  birthdate: string
  email: string
  phone: string
}

type ResultStatus = "green" | "yellow" | "red" | "gray"

type ResultRow = {
  id: string
  firstName: string
  lastName: string
  birthdate: string
  excel: "Ja" | "Nein"
  db: "Ja" | "Nein"
  tsvMember: "Ja" | "Nein" | "—"
  groupDb: string
  status: ResultStatus
  note: string
}

type ExcelFieldKey = "firstName" | "lastName" | "birthdate" | "email" | "phone"

type HeaderDetection = {
  headerRowIndex: number
  columns: Partial<Record<ExcelFieldKey, number>>
}

const HEADER_SCAN_LIMIT = 10

const HEADER_ALIASES: Record<ExcelFieldKey, string[]> = {
  firstName: ["vorname", "firstname", "first", "namevorname", "rufname", "name"],
  lastName: ["nachname", "lastname", "last", "namenachname", "surname", "familienname"],
  birthdate: ["birthdate", "geburtsdatum", "dob", "geburtstag", "gebdatum"],
  email: ["email", "mail", "emailadresse", "e-mail"],
  phone: ["phone", "telefon", "mobil", "mobile", "handy", "telefonnummer"],
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
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

function scoreHeaderRow(cells: unknown[]): HeaderDetection | null {
  const columns: Partial<Record<ExcelFieldKey, number>> = {}
  let score = 0

  cells.forEach((cell, index) => {
    const normalized = normalizeHeader(getCellText(cell))
    if (!normalized) return

    ;(Object.keys(HEADER_ALIASES) as ExcelFieldKey[]).forEach((field) => {
      if (columns[field] !== undefined) return
      if (!HEADER_ALIASES[field].includes(normalized)) return
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

function parseExcelRows(buffer: Buffer) {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    dense: true,
  })

  if (workbook.SheetNames.length === 0) {
    throw new Error("Die Excel-Datei enthält kein Tabellenblatt.")
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
    if (!header) continue

    headerFoundInAnySheet = true
    if (!firstHeaderSheetName) {
      firstHeaderSheetName = sheetName
    }

    const dataRows = sheetRows
      .slice(header.headerRowIndex + 1)
      .map<ExcelRow>((cells, index) => ({
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
      `In "${firstHeaderSheetName ?? "dem Tabellenblatt"}" wurde eine Kopfzeile erkannt, aber keine Personenzeilen mit Vor- oder Nachnamen gefunden.`
    )
  }

  throw new Error(
    "Keine passende Kopfzeile erkannt. Erwartet werden zum Beispiel Vorname/Name/Rufname, Nachname/Familienname, Geburtsdatum, E-Mail oder Telefon in den ersten Zeilen."
  )
}

function buildPrimaryKey(firstName: string, lastName: string, birthdate: string) {
  return [normalizeText(firstName), normalizeText(lastName), birthdate].join("|")
}

function buildEmailKey(email: string) {
  return normalizeText(email)
}

function buildPhoneKey(phone: string) {
  return normalizePhone(phone)
}

function isTsvMemberOk(member: MemberRow) {
  return Boolean(member.is_approved) && !member.is_trial
}

function buildHintParts(excelRow: ExcelRow, member: MemberRow, selectedGroup: TrainingGroup) {
  const hints: string[] = []
  const dbGroup = normalizeTrainingGroup(member.base_group) || member.base_group || "—"

  if (dbGroup !== selectedGroup) {
    hints.push(`Gruppe weicht ab (${dbGroup})`)
  }

  if (!isTsvMemberOk(member)) {
    hints.push(member.is_trial ? "Probemitglied" : "TSV-Mitglied nicht freigegeben")
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

  return hints
}

function statusLabel(status: ResultStatus) {
  switch (status) {
    case "green":
      return "OK"
    case "yellow":
      return "Abweichung"
    case "red":
      return "Nur Excel"
    case "gray":
      return "Nur DB"
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
    const selectedGroup = parseTrainingGroup(formData.get("group")?.toString())
    const file = formData.get("file")

    if (!selectedGroup) {
      return new NextResponse("Bitte eine gueltige Gruppe auswaehlen.", { status: 400 })
    }

    if (!(file instanceof File)) {
      return new NextResponse("Bitte eine Excel-Datei hochladen.", { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const excelRows = parseExcelRows(buffer)
    if (excelRows.length === 0) {
      return new NextResponse("Die Excel-Datei enthaelt keine lesbaren Datensaetze.", { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from("members")
      .select("id, first_name, last_name, birthdate, email, phone, base_group, is_approved, is_trial")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })

    if (error) throw error

    const members = ((data ?? []) as MemberRow[]).map((member) => ({
      ...member,
      base_group: normalizeTrainingGroup(member.base_group) || member.base_group,
    }))

    const membersByPrimaryKey = new Map<string, MemberRow[]>()
    const membersByEmail = new Map<string, MemberRow[]>()
    const membersByPhone = new Map<string, MemberRow[]>()

    for (const member of members) {
      const primaryKey = buildPrimaryKey(member.first_name || "", member.last_name || "", member.birthdate || "")
      if (!membersByPrimaryKey.has(primaryKey)) membersByPrimaryKey.set(primaryKey, [])
      membersByPrimaryKey.get(primaryKey)?.push(member)

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

    const matchedMemberIds = new Set<string>()
    const resultRows: ResultRow[] = []

    for (const excelRow of excelRows) {
      const primaryMatches = membersByPrimaryKey.get(buildPrimaryKey(excelRow.firstName, excelRow.lastName, excelRow.birthdate)) ?? []
      let member: MemberRow | null = primaryMatches.length === 1 ? primaryMatches[0] : null
      const hintParts: string[] = []

      if (primaryMatches.length > 1) {
        hintParts.push("Mehrere DB-Treffer über Name + Geburtsdatum")
      }

      if (!member) {
        const emailMatches = excelRow.email ? membersByEmail.get(buildEmailKey(excelRow.email)) ?? [] : []
        if (emailMatches.length === 1) {
          member = emailMatches[0]
          hintParts.push("Treffer über E-Mail")
        } else if (emailMatches.length > 1) {
          hintParts.push("Mehrere DB-Treffer über E-Mail")
        }
      }

      if (!member) {
        const phoneMatches = excelRow.phone ? membersByPhone.get(buildPhoneKey(excelRow.phone)) ?? [] : []
        if (phoneMatches.length === 1) {
          member = phoneMatches[0]
          hintParts.push("Treffer über Telefon")
        } else if (phoneMatches.length > 1) {
          hintParts.push("Mehrere DB-Treffer über Telefon")
        }
      }

      if (!member) {
        resultRows.push({
          id: `excel-${excelRow.index}`,
          firstName: excelRow.firstName,
          lastName: excelRow.lastName,
          birthdate: excelRow.birthdate || "—",
          excel: "Ja",
          db: "Nein",
          tsvMember: "—",
          groupDb: "—",
          status: "red",
          note: hintParts.join(" · ") || "In Excel vorhanden, aber nicht in der DB gefunden",
        })
        continue
      }

      matchedMemberIds.add(member.id)
      const dbGroup = normalizeTrainingGroup(member.base_group) || member.base_group || "—"
      const deviationHints = [...hintParts, ...buildHintParts(excelRow, member, selectedGroup)]
      const isOk = dbGroup === selectedGroup && isTsvMemberOk(member) && deviationHints.length === 0

      resultRows.push({
        id: member.id,
        firstName: member.first_name || excelRow.firstName,
        lastName: member.last_name || excelRow.lastName,
        birthdate: member.birthdate || excelRow.birthdate || "—",
        excel: "Ja",
        db: "Ja",
        tsvMember: isTsvMemberOk(member) ? "Ja" : "Nein",
        groupDb: dbGroup,
        status: isOk ? "green" : "yellow",
        note: deviationHints.join(" · ") || "Excel und DB stimmen ueberein",
      })
    }

    const onlyDbMembers = members.filter(
      (member) => (normalizeTrainingGroup(member.base_group) || member.base_group) === selectedGroup && !matchedMemberIds.has(member.id)
    )

    for (const member of onlyDbMembers) {
      resultRows.push({
        id: `db-${member.id}`,
        firstName: member.first_name || "",
        lastName: member.last_name || "",
        birthdate: member.birthdate || "—",
        excel: "Nein",
        db: "Ja",
        tsvMember: isTsvMemberOk(member) ? "Ja" : "Nein",
        groupDb: normalizeTrainingGroup(member.base_group) || member.base_group || "—",
        status: "gray",
        note: "In DB in dieser Gruppe vorhanden, aber nicht in Excel",
      })
    }

    const metrics = {
      excelTotal: excelRows.length,
      foundInDb: resultRows.filter((row) => row.excel === "Ja" && row.db === "Ja").length,
      notFound: resultRows.filter((row) => row.status === "red").length,
      tsvOk: resultRows.filter((row) => row.tsvMember === "Ja").length,
      deviations: resultRows.filter((row) => row.status === "yellow").length,
      onlyDb: resultRows.filter((row) => row.status === "gray").length,
      onlyExcel: resultRows.filter((row) => row.status === "red").length,
    }

    return NextResponse.json({
      group: selectedGroup,
      fileName: file.name,
      metrics,
      rows: resultRows.sort((a, b) => {
        const statusOrder: Record<ResultStatus, number> = { red: 0, yellow: 1, gray: 2, green: 3 }
        const statusCompare = statusOrder[a.status] - statusOrder[b.status]
        if (statusCompare !== 0) return statusCompare
        const lastNameCompare = a.lastName.localeCompare(b.lastName, "de")
        if (lastNameCompare !== 0) return lastNameCompare
        return a.firstName.localeCompare(b.firstName, "de")
      }).map((row) => ({
        ...row,
        statusLabel: statusLabel(row.status),
      })),
    })
  } catch (error) {
    console.error("admin excel abgleich failed", error)
    return new NextResponse(error instanceof Error ? error.message : "Internal server error", { status: 500 })
  }
}
