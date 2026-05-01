export const NORMAL_OFFICE_UPLOAD_GROUPS = [
  "Basic 10 - 14 Jahre",
  "Basic 15 - 18 Jahre",
  "Basic Ü18",
] as const

export const BOXZWERGE_UPLOAD_GROUP = "Boxzwerge" as const

export const ALL_OFFICE_UPLOAD_GROUPS = [...NORMAL_OFFICE_UPLOAD_GROUPS, BOXZWERGE_UPLOAD_GROUP] as const

export type NormalOfficeUploadGroup = (typeof NORMAL_OFFICE_UPLOAD_GROUPS)[number]
export type OfficeUploadGroup = (typeof ALL_OFFICE_UPLOAD_GROUPS)[number]

export type OfficeUploadScope = "normal" | "boxzwerge"

export function parseOfficeUploadGroup(value?: string | null): OfficeUploadGroup | null {
  const sanitized = (value ?? "").trim().replace(/\s+/g, " ")
  return (ALL_OFFICE_UPLOAD_GROUPS.find((group) => group === sanitized) ?? null) as OfficeUploadGroup | null
}

export function parseOfficeUploadScope(value?: string | null): OfficeUploadScope {
  return value === "boxzwerge" ? "boxzwerge" : "normal"
}

export function validateUploadGroupsForScope(params: {
  groups: Array<OfficeUploadGroup | null>
  filesCount: number
  scope: OfficeUploadScope
}) {
  const { groups, filesCount, scope } = params

  if (groups.length !== filesCount || groups.some((group) => !group)) {
    return {
      ok: false as const,
      status: 400,
      message: "Bitte jeder Datei eine gueltige Gruppe zuordnen.",
    }
  }

  const validGroups = groups.filter((group): group is OfficeUploadGroup => Boolean(group))

  if (scope === "normal" && validGroups.includes(BOXZWERGE_UPLOAD_GROUP)) {
    return {
      ok: false as const,
      status: 400,
      message: "Boxzwerge werden über den separaten Boxzwerge-Upload abgeglichen.",
    }
  }

  if (scope === "boxzwerge" && validGroups.some((group) => group !== BOXZWERGE_UPLOAD_GROUP)) {
    return {
      ok: false as const,
      status: 400,
      message: "Im Boxzwerge-Upload ist nur die Gruppe Boxzwerge erlaubt.",
    }
  }

  return {
    ok: true as const,
    groups: validGroups,
  }
}

export function shouldReplaceStoredRowForUploadedGroups(
  row: { excel: "Ja" | "Nein"; groupExcel: string; groupDb: string },
  uploadedGroups: Set<OfficeUploadGroup>
) {
  if (row.excel === "Ja") {
    const excelGroup = parseOfficeUploadGroup(row.groupExcel)
    return excelGroup ? uploadedGroups.has(excelGroup) : false
  }

  const dbGroup = parseOfficeUploadGroup(row.groupDb)
  return dbGroup ? uploadedGroups.has(dbGroup) : false
}
