import { TRAINING_GROUPS } from "@/lib/trainingGroups"

export type Session = {
  id: string
  dayKey: "Montag" | "Dienstag" | "Mittwoch" | "Donnerstag" | "Freitag"
  title: string
  group: string
  start: string
  end: string
}

export const sessions: Session[] = [
  { id: "S-001", dayKey: "Montag", title: "Montag · L-Gruppe · 17:00-18:30", group: "L-Gruppe", start: "17:00", end: "18:30" },
  { id: "S-002", dayKey: "Montag", title: "Montag · Basic Ü18 · 18:30-20:00", group: "Basic Ü18", start: "18:30", end: "20:00" },
  { id: "S-003", dayKey: "Dienstag", title: "Dienstag · Basic 10 - 14 Jahre · 16:00-17:30", group: "Basic 10 - 14 Jahre", start: "16:00", end: "17:30" },
  { id: "S-004", dayKey: "Dienstag", title: "Dienstag · Basic 15 - 18 Jahre · 17:30-19:00", group: "Basic 15 - 18 Jahre", start: "17:30", end: "19:00" },
  { id: "S-005", dayKey: "Mittwoch", title: "Mittwoch · L-Gruppe · 17:00-18:30", group: "L-Gruppe", start: "17:00", end: "18:30" },
  { id: "S-006", dayKey: "Donnerstag", title: "Donnerstag · Basic 10 - 14 Jahre · 16:00-17:30", group: "Basic 10 - 14 Jahre", start: "16:00", end: "17:30" },
  { id: "S-007", dayKey: "Donnerstag", title: "Donnerstag · Basic 15 - 18 Jahre · 17:30-19:00", group: "Basic 15 - 18 Jahre", start: "17:30", end: "19:00" },
  { id: "S-008", dayKey: "Donnerstag", title: "Donnerstag · Basic Ü18 · 19:00-20:30", group: "Basic Ü18", start: "19:00", end: "20:30" },
  { id: "S-009", dayKey: "Freitag", title: "Freitag · Boxzwerge · 16:30-17:30", group: "Boxzwerge", start: "16:30", end: "17:30" },
  { id: "S-010", dayKey: "Freitag", title: "Freitag · L-Gruppe · 17:30-19:00", group: "L-Gruppe", start: "17:30", end: "19:00" },
]

export const groupOptions = [...TRAINING_GROUPS]

export function getGroupSlug(group: string) {
  return group
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function getGroupBySlug(slug: string) {
  return groupOptions.find((group) => getGroupSlug(group) === slug) ?? null
}
