/**
 * Pure matching utilities for Office/GS list reconciliation.
 * These functions mirror the normalization and matching logic in
 * app/api/admin/excel-abgleich/route.ts so that automatic post-registration
 * matching can reuse the exact same rules without duplicating the Excel-parsing
 * infrastructure.
 */

import type { OfficeListStatus } from "./officeListStatus"

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
}

export function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/[^\d+]/g, "")
}

function getFirstNameTokens(value?: string | null): string[] {
  return normalizeText(value)
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
}

function areCompatibleFirstNames(left?: string | null, right?: string | null): boolean {
  const lt = getFirstNameTokens(left)
  const rt = getFirstNameTokens(right)
  if (!lt.length || !rt.length) return false
  return lt.some((l) => rt.some((r) => l === r || l.startsWith(r) || r.startsWith(l)))
}

function areCompatiblePersonNames(
  lFirst?: string | null,
  lLast?: string | null,
  rFirst?: string | null,
  rLast?: string | null,
): boolean {
  if (normalizeText(lLast) !== normalizeText(rLast)) return false
  const nLF = normalizeText(lFirst)
  const nRF = normalizeText(rFirst)
  if (nLF && nRF && nLF === nRF) return true
  return areCompatibleFirstNames(lFirst, rFirst)
}

function parseIsoDate(value?: string | null): number | null {
  if (!value) return null
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const n = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isFinite(n) ? n : null
}

function isCompatibleBirthdateMatch(left?: string | null, right?: string | null): boolean {
  if (!left || !right) return true
  if (left === right) return true
  const l = parseIsoDate(left)
  const r = parseIsoDate(right)
  if (l === null || r === null) return false
  return Math.abs(l - r) <= 24 * 60 * 60 * 1000
}

type ExcelRowCandidate = {
  firstName: string
  lastName: string
  birthdate: string
  email?: string
  phone?: string
  groupExcel: string
}

/**
 * Matches a newly registered member against the Excel rows stored in the
 * active `office_reconciliation_runs` entry.
 *
 * Priority (mirrors excel-abgleich matching):
 *  1. Exact primary key (normalised first + last + birthdate)  → green
 *  2. Email match                                               → yellow
 *  3. Phone match                                               → yellow
 *  4. Compatible name + compatible birthdate (relaxed)          → yellow
 *  5. No match                                                  → null (caller maps to red)
 *
 * Only rows where `excel === "Ja"` should be passed in.
 */
export function matchMemberAgainstExcelRows(
  member: { firstName: string; lastName: string; birthdate: string; email: string; phone: string },
  rows: ExcelRowCandidate[],
): { status: OfficeListStatus; group: string } | null {
  const normFirst = normalizeText(member.firstName)
  const normLast = normalizeText(member.lastName)
  const normEmail = member.email.trim().toLowerCase()
  const normPhone = normalizePhone(member.phone)

  // Tier 1 – exact primary key
  const primary = rows.find(
    (r) =>
      r.firstName &&
      r.lastName &&
      normalizeText(r.firstName) === normFirst &&
      normalizeText(r.lastName) === normLast &&
      r.birthdate === member.birthdate,
  )
  if (primary) return { status: "green", group: primary.groupExcel }

  // Tier 2 – email
  if (normEmail) {
    const byEmail = rows.find((r) => r.email && r.email.trim().toLowerCase() === normEmail)
    if (byEmail) return { status: "yellow", group: byEmail.groupExcel }
  }

  // Tier 3 – phone
  if (normPhone.length >= 6) {
    const byPhone = rows.find((r) => r.phone && normalizePhone(r.phone) === normPhone)
    if (byPhone) return { status: "yellow", group: byPhone.groupExcel }
  }

  // Tier 4 – relaxed name + compatible birthdate
  const relaxed = rows.find(
    (r) =>
      areCompatiblePersonNames(member.firstName, member.lastName, r.firstName, r.lastName) &&
      isCompatibleBirthdateMatch(member.birthdate, r.birthdate),
  )
  if (relaxed) return { status: "yellow", group: relaxed.groupExcel }

  return null
}
