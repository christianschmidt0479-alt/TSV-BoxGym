"use client"

import { useMarkSectionSeen } from "@/lib/useMarkSectionSeen"

/**
 * Rendert nichts – feuert nur einmalig pro Mount den Seen-Call.
 * Für Server-Seiten-Komponenten gedacht, die einen Client-Trigger brauchen.
 */
export function MarkSectionSeen({ section }: { section: string }) {
  useMarkSectionSeen(section)
  return null
}
