"use client"

import { useArea } from "@/lib/area-context"
import Card from "@/components/Card"

export default function Home() {
  const { area } = useArea()

  return (
    <div
      style={{
        maxWidth: 520,
        margin: "0 auto",
        padding: 20,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {area === "Sportler" && (
          <>
            <Card
              href="/mein-bereich"
              title="Mein Bereich"
              subtitle="Zugang für Mitglieder"
              icon="👤"
            />
            <Card
              href="/registrieren"
              title="Registrierung"
              subtitle="Neu anmelden"
              icon="➕"
            />
            <Card
              href="/checkin"
              title="Check-in"
              subtitle="Training einchecken"
              icon="✔"
            />
          </>
        )}

        {area === "Trainer" && (
          <Card
            href="#"
            title="Trainerbereich (kommt später)"
            subtitle="Trainer-Funktionen"
            icon="🏋️"
          />
        )}

        {area === "Admin" && (
          <Card
            href="/verwaltung-neu"
            title="Verwaltung"
            subtitle="Admin-Funktionen"
            icon="🛠"
          />
        )}
      </div>
    </div>
  )
}