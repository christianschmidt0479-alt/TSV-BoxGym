function normalizeGroupName(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : ""
}

export function isWeightRequiredGroup(groupName: unknown) {
  const normalized = normalizeGroupName(groupName)
  return normalized === "l-gruppe" || normalized === "leistungsgruppe"
}

export function needsWeight(member: any) {
  if (!member) return false

  const isLeistungsgruppe = isWeightRequiredGroup(member.base_group)

  const isWettkaempfer =
    member.is_wettkaempfer === true || member.is_competition_member === true || member.isCompetitionMember === true

  return isLeistungsgruppe || isWettkaempfer
}
