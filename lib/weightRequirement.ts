// Gruppen mit Gewichtspflicht
export const GROUPS_WITH_WEIGHT_REQUIREMENT = [
  "L-Gruppe"
] as const;

export function hasWeightRequirement(group?: string | null): boolean {
  if (!group) return false;
  return GROUPS_WITH_WEIGHT_REQUIREMENT.includes(group as any);
}
