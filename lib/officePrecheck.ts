import { createServerSupabaseServiceClient } from "./serverSupabase"
import { matchMemberAgainstExcelRows } from "./officeMatch"

type StoredRunRow = {
  checked_at?: string | null
  rows?: unknown
}

type StoredResultRow = {
  excel?: unknown
  firstName?: unknown
  lastName?: unknown
  birthdate?: unknown
  email?: unknown
  phone?: unknown
  groupExcel?: unknown
}

type PrecheckInput = {
  firstName: string
  lastName: string
  birthdate: string
  email: string
  phone: string
}

function isMissingOfficeRunStorageError(error: { message?: string; details?: string; code?: string } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  return (
    error?.code === "PGRST204" ||
    message.includes("office_reconciliation_runs") ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  )
}

function toExcelCandidates(rows: unknown) {
  if (!Array.isArray(rows)) return []

  return rows
    .filter((row): row is StoredResultRow => typeof row === "object" && row !== null)
    .filter((row) => row.excel === "Ja")
    .map((row) => ({
      firstName: typeof row.firstName === "string" ? row.firstName : "",
      lastName: typeof row.lastName === "string" ? row.lastName : "",
      birthdate: typeof row.birthdate === "string" ? row.birthdate : "",
      email: typeof row.email === "string" ? row.email : "",
      phone: typeof row.phone === "string" ? row.phone : "",
      groupExcel: typeof row.groupExcel === "string" ? row.groupExcel : "",
    }))
    .filter((row) => row.firstName.length > 0 && row.lastName.length > 0)
}

export async function runRegistrationOfficePrecheck(input: PrecheckInput) {
  const supabase = createServerSupabaseServiceClient()

  const latestRunResponse = await supabase
    .from("office_reconciliation_runs")
    .select("checked_at, rows")
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestRunResponse.error) {
    if (isMissingOfficeRunStorageError(latestRunResponse.error)) {
      return null
    }
    throw latestRunResponse.error
  }

  const latestRun = (latestRunResponse.data ?? null) as StoredRunRow | null
  if (!latestRun) return null

  const candidates = toExcelCandidates(latestRun.rows)
  if (candidates.length === 0) {
    return {
      checkedAt: latestRun.checked_at ?? null,
      matched: false,
    }
  }

  const match = matchMemberAgainstExcelRows(
    {
      firstName: input.firstName,
      lastName: input.lastName,
      birthdate: input.birthdate,
      email: input.email,
      phone: input.phone,
    },
    candidates,
  )

  return {
    checkedAt: latestRun.checked_at ?? null,
    matched: Boolean(match),
    proposedStatus: match?.status ?? null,
    proposedGroup: match?.group ?? null,
  }
}
