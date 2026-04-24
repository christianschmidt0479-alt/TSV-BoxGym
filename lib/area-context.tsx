"use client"

import { createContext, useContext, useState } from "react"

type Area = "Sportler" | "Trainer" | "Admin"

const AreaContext = createContext<{
  area: Area
  setArea: (a: Area) => void
} | null>(null)

export function AreaProvider({ children }: { children: React.ReactNode }) {
  const [area, setArea] = useState<Area>("Sportler")

  return (
    <AreaContext.Provider value={{ area, setArea }}>
      {children}
    </AreaContext.Provider>
  )
}

export function useArea() {
  const ctx = useContext(AreaContext)
  if (!ctx) throw new Error("useArea must be used inside AreaProvider")
  return ctx
}
