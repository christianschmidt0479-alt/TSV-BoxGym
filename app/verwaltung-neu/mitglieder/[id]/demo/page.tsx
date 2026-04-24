"use client"
import { container, pageTitle, card, cardTitle, buttonPrimary, buttonSecondary } from "@/lib/ui"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { TRAINING_GROUPS } from "@/lib/groups"

export default function MemberDemoPage() {
  const router = useRouter()
  const params = useParams()
  const memberId = params?.id as string

  const [editMode, setEditMode] = useState(false)
  const [member, setMember] = useState<any>(null)


  useEffect(() => {
    async function loadMember() {
      console.log("LOAD MEMBER TRIGGERED")
      const res = await fetch("/api/admin/get-member", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id: memberId })
      })
      if (!res.ok) {
        const err = await res.json()
        console.error(err)
        alert("Fehler beim Laden: " + err.error)
        return
      }
      const data = await res.json()
      setMember({
        id: data.id,
        name: data.name,
        email: data.email,
        birthdate: data.birthdate,
        weight: data.weight,
        group: data.base_group,
        isFighter: data.is_competition_member
      })
    }
    if (!memberId || member) return
    loadMember()
  }, [memberId, member])


  if (!member) {
    return <div style={container}>Lade Mitglied...</div>
  }

  const groupValue = TRAINING_GROUPS.includes(member.group) ? member.group : ""
  console.log("DB Gruppe:", member.group)

  return (
    <div style={container}>
      <div style={pageTitle}>{member.name}</div>
      <div style={card}>
        <div style={cardTitle}>Mitgliedsdaten</div>
        <div style={{ marginTop: 8 }}>E-Mail: {member.email}</div>
        {editMode ? (
          <>
            <div>
              Geburtsdatum: <input
                type="date"
                value={member.birthdate || ""}
                onChange={e => setMember((m: any) => ({ ...m, birthdate: e.target.value }))}
                style={{ marginLeft: 8 }}
              />
            </div>
            {(member.isFighter || member.group === "L-Gruppe") && (
              <div>
                Gewicht: <input
                  value={member.weight || ""}
                  onChange={e => setMember({ ...member, weight: e.target.value })}
                />
              </div>
            )}
            <div>
              Stammgruppe: <select
                value={member.group || ""}
                onChange={e => setMember((m: any) => ({ ...m, group: e.target.value }))}
                style={{ marginLeft: 8, width: 140 }}
              >
                <option value="">– bitte wählen –</option>
                {TRAINING_GROUPS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              Wettkämpfer: <input
                type="checkbox"
                checked={!!member.isFighter}
                onChange={e => setMember((m: any) => ({ ...m, isFighter: e.target.checked }))}
                style={{ marginLeft: 8 }}
              />
            </div>
            {!(member.isFighter || member.group === "L-Gruppe") && (
              <div style={{ fontSize: 12, color: "#888" }}>
                Gewicht nur relevant für Wettkämpfer oder L-Gruppe
              </div>
            )}
          </>
        ) : (
          <>
            <div>Geburtsdatum: {member.birthdate}</div>
            {(member.isFighter || member.group === "L-Gruppe") && (
              <div>Gewicht: {member.weight || "—"}</div>
            )}
            <div>Stammgruppe: {member.group || "—"}</div>
            <div>Wettkämpfer: {member.isFighter ? "Ja" : "Nein"}</div>
            {!(member.isFighter || member.group === "L-Gruppe") && (
              <div style={{ fontSize: 12, color: "#888" }}>
                Gewicht nur relevant für Wettkämpfer oder L-Gruppe
              </div>
            )}
          </>
        )}
      </div>
      <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
        <Link href="/verwaltung-neu/mitglieder">
          <button style={buttonSecondary}>Zurück</button>
        </Link>
        {editMode ? (
          <button
            style={buttonPrimary}
            onClick={async () => {
              if (!member.birthdate) {
                alert("Bitte Geburtsdatum ausfüllen")
                return
              }
              if (!member.group) {
                alert("Bitte eine Gruppe auswählen")
                return
              }
              const res = await fetch("/api/admin/update-member", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  id: member.id,
                  birthdate: member.birthdate,
                  weight: member.weight,
                  group: member.group,
                  isFighter: member.isFighter
                })
              })
              if (!res.ok) {
                alert("Fehler beim Speichern")
                return
              }
              alert("Gespeichert")
              setEditMode(false)
            }}
          >
            Speichern
          </button>
        ) : (
          <button style={buttonPrimary} onClick={() => setEditMode(true)}>
            Bearbeiten
          </button>
        )}
        <button
          style={{
            background: "#c62828",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer"
          }}
          onClick={async () => {
            const confirmStep1 = confirm("Mitglied wirklich löschen?")
            if (!confirmStep1) return

            const confirmStep2 = confirm("Wirklich endgültig löschen?")
            if (!confirmStep2) return

            const res = await fetch("/api/admin/delete-member", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ id: member.id })
            })

            if (!res.ok) {
              const err = await res.json()
              alert("Fehler: " + err.error)
              return
            }

            router.push("/verwaltung-neu/mitglieder")
          }}
        >
          Mitglied löschen
        </button>
      </div>
    </div>
  )
}
