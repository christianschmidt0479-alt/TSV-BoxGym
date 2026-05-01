import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { normalizePhone, normalizeText } from "@/lib/officeMatch"
import { parseOfficeUploadGroup, type OfficeUploadGroup } from "@/lib/officeUploadGroups"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

type RouteBody = {
  memberId?: unknown
  action?: unknown
  candidateRowId?: unknown
  confirmUncertain?: unknown
  linkFlowMode?: unknown
  focusedMemberId?: unknown
  adminConfirmed?: unknown
}

type MemberRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  birthdate?: string | null
  email?: string | null
  gs_match_email?: string | null
  phone?: string | null
  base_group?: string | null
  office_list_group?: string | null
}

type StoredRunRow = {
  id: string
  is_active?: boolean | null
  rows?: unknown
}

type StoredResultRow = {
  id?: unknown
  excel?: unknown
  firstName?: unknown
  lastName?: unknown
  birthdate?: unknown
  email?: unknown
  phone?: unknown
  groupExcel?: unknown
  source?: unknown
}

type Confidence = "exact" | "strong" | "possible" | "uncertain"

type Candidate = {
  rowId: string
  firstName: string
  lastName: string
  birthdate: string
  email: string
  phone: string
  groupExcel: OfficeUploadGroup | null
  source: string
  confidence: Confidence
  score: number
  reasons: string[]
}

type AnalyzeDebugSummary = {
  rowsChecked: number
  emailMatches: number
  nameMatches: number
  birthdateMatches: number
  reasonNoCandidate: string
}

const OFFICE_RUNS_TABLE = "office_reconciliation_runs"

function toText(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim()
}

function isLGroup(value?: string | null) {
  const normalized = normalizeText(value)
  return normalized === "l-gruppe" || normalized === "leistungsgruppe"
}

function isMissingOfficeRunStorageError(error: { message?: string; details?: string; code?: string } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  return message.includes(OFFICE_RUNS_TABLE) || message.includes(`relation \"${OFFICE_RUNS_TABLE}\"`)
}

function similarity(left: string, right: string) {
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.9

  const leftTokens = new Set(left.split(" ").filter(Boolean))
  const rightTokens = new Set(right.split(" ").filter(Boolean))
  const shared = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  if (union === 0) return 0
  return shared / union
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function areSimilarEmails(left: string, right: string) {
  if (!left || !right) return false
  if (left === right) return true

  const [lLocal, lDomain] = left.split("@")
  const [rLocal, rDomain] = right.split("@")
  if (!lLocal || !lDomain || !rLocal || !rDomain) return false

  if (lDomain === rDomain && (lLocal.includes(rLocal) || rLocal.includes(lLocal))) {
    return true
  }

  return similarity(lLocal, rLocal) >= 0.8 && similarity(lDomain, rDomain) >= 0.85
}

function classifyCandidate(member: MemberRow, candidate: Omit<Candidate, "confidence" | "score" | "reasons">) {
  const reasons: string[] = []

  const memberEmail = normalizeEmail(member.email ?? "")
  const memberGsMatchEmail = normalizeEmail(member.gs_match_email ?? "")
  const candidateEmail = normalizeEmail(candidate.email)
  const emailExactPrimary = Boolean(memberEmail && candidateEmail && memberEmail === candidateEmail)
  const emailExactGs = Boolean(memberGsMatchEmail && candidateEmail && memberGsMatchEmail === candidateEmail)
  const emailExact = emailExactPrimary || emailExactGs
  const emailSimilarPrimary = !emailExact && Boolean(memberEmail && candidateEmail && areSimilarEmails(memberEmail, candidateEmail))
  const emailSimilarGs = !emailExact && Boolean(memberGsMatchEmail && candidateEmail && areSimilarEmails(memberGsMatchEmail, candidateEmail))
  const emailSimilar = emailSimilarPrimary || emailSimilarGs

  const memberFirst = normalizeText(member.first_name)
  const memberLast = normalizeText(member.last_name)
  const candidateFirst = normalizeText(candidate.firstName)
  const candidateLast = normalizeText(candidate.lastName)
  const fullMember = normalizeText(`${member.first_name ?? ""} ${member.last_name ?? ""}`)
  const fullCandidate = normalizeText(`${candidate.firstName} ${candidate.lastName}`)

  const nameExact = Boolean(memberFirst && memberLast && candidateFirst && candidateLast && memberFirst === candidateFirst && memberLast === candidateLast)
  const nameSimilarity = similarity(fullMember, fullCandidate)
  const nameSimilar = nameSimilarity >= 0.6

  const birthdateEqual = Boolean(member.birthdate && candidate.birthdate && member.birthdate === candidate.birthdate)

  const memberPhone = normalizePhone(member.phone)
  const candidatePhone = normalizePhone(candidate.phone)
  const phoneEqual = Boolean(memberPhone && candidatePhone && memberPhone === candidatePhone)

  if (emailExactPrimary) reasons.push("Exakte E-Mail-Übereinstimmung")
  if (emailExactGs) reasons.push("Treffer über GS-Abgleich E-Mail")
  if (nameExact) reasons.push("Vorname/Nachname exakt gleich")
  if (birthdateEqual) reasons.push("Geburtsdatum gleich")
  if (nameSimilar && !nameExact) reasons.push("Name ähnlich")
  if (emailSimilarPrimary) reasons.push("E-Mail ähnlich")
  if (emailSimilarGs) reasons.push("GS-Abgleich E-Mail ähnlich")
  if (phoneEqual) reasons.push("Telefon gleich")

  if (emailExact) {
    return {
      confidence: "exact" as const,
      score: 100,
      reasons,
    }
  }

  if (nameExact && birthdateEqual) {
    return {
      confidence: "strong" as const,
      score: 90,
      reasons,
    }
  }

  if ((nameSimilar && birthdateEqual) || emailSimilar || phoneEqual) {
    return {
      confidence: "possible" as const,
      score: 70,
      reasons,
    }
  }

  if (nameSimilar) {
    return {
      confidence: "uncertain" as const,
      score: 45,
      reasons,
    }
  }

  return null
}

function sortCandidates(left: Candidate, right: Candidate) {
  const order: Record<Confidence, number> = {
    exact: 0,
    strong: 1,
    possible: 2,
    uncertain: 3,
  }
  const orderDiff = order[left.confidence] - order[right.confidence]
  if (orderDiff !== 0) return orderDiff

  if (right.score !== left.score) return right.score - left.score

  const sourceDiff = left.source.localeCompare(right.source, "de")
  if (sourceDiff !== 0) return sourceDiff

  return left.lastName.localeCompare(right.lastName, "de")
}

function parseExcelCandidates(rows: unknown) {
  if (!Array.isArray(rows)) return [] as Omit<Candidate, "confidence" | "score" | "reasons">[]

  return rows
    .filter((row): row is StoredResultRow => typeof row === "object" && row !== null)
    .filter((row) => row.excel === "Ja")
    .map((row) => {
      const rowId = toText(row.id)
      const firstName = toText(row.firstName)
      const lastName = toText(row.lastName)
      const birthdate = toText(row.birthdate)
      const email = toText(row.email)
      const phone = toText(row.phone)
      const source = toText(row.source)
      const groupExcel = parseOfficeUploadGroup(toText(row.groupExcel))

      return {
        rowId,
        firstName,
        lastName,
        birthdate,
        email,
        phone,
        groupExcel,
        source,
      }
    })
    .filter((row) => row.rowId.length > 0)
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

    const rateLimit = await checkRateLimitAsync(`admin-gs-match-member:${getRequestIp(request)}`, 40, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json().catch(() => ({}))) as RouteBody
    const memberId = toText(body.memberId)
    const action = body.action === "link" ? "link" : "analyze"
    const candidateRowId = toText(body.candidateRowId)
    const confirmUncertain = body.confirmUncertain === true
    const linkFlowMode = toText(body.linkFlowMode)
    const focusedMemberId = toText(body.focusedMemberId)
    const adminConfirmed = body.adminConfirmed === true

    if (!memberId) {
      return NextResponse.json({ ok: false, error: "memberId fehlt." }, { status: 400 })
    }

    if (action === "link") {
      if (!adminConfirmed) {
        return NextResponse.json({ ok: false, error: "Explizite Admin-Bestätigung fehlt." }, { status: 400 })
      }
      if (linkFlowMode !== "focused-member") {
        return NextResponse.json({ ok: false, error: "Manuelle Verknüpfung ist nur im fokussierten Mitglieds-Linkflow erlaubt." }, { status: 403 })
      }
      if (!focusedMemberId || focusedMemberId !== memberId) {
        return NextResponse.json({ ok: false, error: "Fokus-Mitglied stimmt nicht mit memberId überein." }, { status: 400 })
      }
    }

    const supabase = createServerSupabaseServiceClient()

    const [memberResponse, activeRunResponse] = await Promise.all([
      supabase
        .from("members")
        .select("id, first_name, last_name, birthdate, email, gs_match_email, phone, base_group, office_list_group")
        .eq("id", memberId)
        .maybeSingle(),
      supabase
        .from(OFFICE_RUNS_TABLE)
        .select("id, is_active, rows")
        .eq("is_active", true)
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (memberResponse.error || !memberResponse.data) {
      return NextResponse.json({ ok: false, error: "Mitglied nicht gefunden." }, { status: 404 })
    }

    if (activeRunResponse.error) {
      if (isMissingOfficeRunStorageError(activeRunResponse.error)) {
        return NextResponse.json({ ok: false, error: "Kein aktiver GS-Run vorhanden." }, { status: 404 })
      }
      throw activeRunResponse.error
    }

    const activeRun = (activeRunResponse.data ?? null) as StoredRunRow | null
    if (!activeRun) {
      return NextResponse.json({ ok: false, error: "Kein aktiver GS-Run vorhanden." }, { status: 404 })
    }

    const member = memberResponse.data as MemberRow
    const excelCandidates = parseExcelCandidates(activeRun.rows)
    const analyzedCandidates: Candidate[] = []
    const memberEmail = normalizeEmail(member.email ?? "")
    const memberGsMatchEmail = normalizeEmail(member.gs_match_email ?? "")
    const memberFirst = normalizeText(member.first_name)
    const memberLast = normalizeText(member.last_name)
    const memberFullName = normalizeText(`${member.first_name ?? ""} ${member.last_name ?? ""}`)

    let emailMatches = 0
    let nameMatches = 0
    let birthdateMatches = 0

    for (const candidate of excelCandidates) {
      const candidateEmail = normalizeEmail(candidate.email)
      const candidateFirst = normalizeText(candidate.firstName)
      const candidateLast = normalizeText(candidate.lastName)
      const candidateFullName = normalizeText(`${candidate.firstName} ${candidate.lastName}`)

      if (
        (memberEmail && candidateEmail && areSimilarEmails(memberEmail, candidateEmail)) ||
        (memberGsMatchEmail && candidateEmail && areSimilarEmails(memberGsMatchEmail, candidateEmail))
      ) {
        emailMatches += 1
      }

      const nameExact = Boolean(
        memberFirst &&
        memberLast &&
        candidateFirst &&
        candidateLast &&
        memberFirst === candidateFirst &&
        memberLast === candidateLast,
      )
      const nameSimilar = similarity(memberFullName, candidateFullName) >= 0.6
      if (nameExact || nameSimilar) {
        nameMatches += 1
      }

      if (member.birthdate && candidate.birthdate && member.birthdate === candidate.birthdate) {
        birthdateMatches += 1
      }

      const classified = classifyCandidate(member, candidate)
      if (!classified) continue
      analyzedCandidates.push({
        ...candidate,
        confidence: classified.confidence,
        score: classified.score,
        reasons: classified.reasons,
      })
    }

    analyzedCandidates.sort(sortCandidates)

    const debugSummary: AnalyzeDebugSummary = {
      rowsChecked: excelCandidates.length,
      emailMatches,
      nameMatches,
      birthdateMatches,
      reasonNoCandidate:
        analyzedCandidates.length > 0
          ? "Kandidaten gefunden"
          : excelCandidates.length === 0
            ? "Keine GS-Excel-Zeilen im aktiven Run vorhanden."
            : emailMatches === 0 && nameMatches === 0 && birthdateMatches === 0
              ? "Keine relevanten Übereinstimmungen für E-Mail, Name oder Geburtsdatum."
              : "Treffer vorhanden, aber Confidence-Regeln liefern keinen auswählbaren Kandidaten.",
    }

    if (action === "analyze") {
      return NextResponse.json({
        ok: true,
        action,
        member: {
          id: member.id,
          firstName: member.first_name ?? "",
          lastName: member.last_name ?? "",
          birthdate: member.birthdate ?? "",
          email: member.email ?? "",
          phone: member.phone ?? "",
          baseGroup: member.base_group ?? "",
          officeGroup: member.office_list_group ?? "",
          isLGroup: isLGroup(member.base_group),
        },
        candidates: analyzedCandidates,
        debugSummary,
      })
    }

    if (!candidateRowId) {
      return NextResponse.json({ ok: false, error: "candidateRowId fehlt." }, { status: 400 })
    }

    const selectedCandidate = analyzedCandidates.find((candidate) => candidate.rowId === candidateRowId)
    if (!selectedCandidate) {
      return NextResponse.json({ ok: false, error: "Ausgewählter GS-Datensatz nicht gefunden." }, { status: 404 })
    }

    if (selectedCandidate.confidence === "uncertain" && !confirmUncertain) {
      return NextResponse.json({
        ok: false,
        error: "Unsicherer Treffer muss explizit bestätigt werden.",
        code: "confirm_required",
      }, { status: 409 })
    }

    const linkedStatus = selectedCandidate.confidence === "exact" || selectedCandidate.confidence === "strong" ? "green" : "yellow"
    const checkedAt = new Date().toISOString()

    const updateResponse = await supabase
      .from("members")
      .update({
        office_list_status: linkedStatus,
        office_list_group: selectedCandidate.groupExcel,
        office_list_checked_at: checkedAt,
      })
      .eq("id", member.id)

    if (updateResponse.error) {
      throw updateResponse.error
    }

    return NextResponse.json({
      ok: true,
      action,
      linked: {
        memberId: member.id,
        status: linkedStatus,
        officeGroup: selectedCandidate.groupExcel,
        checkedAt,
        confidence: selectedCandidate.confidence,
        rowId: selectedCandidate.rowId,
      },
    })
  } catch (error) {
    console.error("admin gs match member failed", error)
    return NextResponse.json({ ok: false, error: "Serverfehler" }, { status: 500 })
  }
}