"use client"

import { useEffect, useRef } from "react"

/**
 * Markiert einen Admin-Nav-Bereich einmalig pro Seitenaufruf als gesehen.
 * After success dispatches "admin-nav-badges-refresh" so navbars re-fetch badges.
 */
export function useMarkSectionSeen(section: string) {
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true

    void fetch("/api/admin/nav-badges/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section }),
    })
      .then((res) => {
        if (res.ok) {
          window.dispatchEvent(new CustomEvent("admin-nav-badges-refresh"))
        }
      })
      .catch(() => {
        // defensiv: Netzwerkfehler ignorieren
      })
  }, [section])
}
