"use client"
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memberId }),
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
        isFighter: data.is_competition_member,
      })
    }
    if (!memberId || member) return
    loadMember()
  }, [memberId, member])

  if (!member) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">
        Lade Mitglied...
      </div>
    )
  }

  const groupValue = TRAINING_GROUPS.includes(member.group) ? member.group : ""
  console.log("DB Gruppe:", member.group)

  return (
    <div className="space-y-4">
      <div className="text-base font-semibold text-zinc-900">{member.name}</div>

      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 shadow-sm space-y-3">
        <div className="text-sm font-semibold text-zinc-900">Mitgliedsdaten</div>
        <div className="text-xs text-zinc-700">E-Mail: {member.email}</div>

        {editMode ? (
          <>
            <div className="text-xs text-zinc-700">
              Geburtsdatum:{" "}
              <input
                type="date"
                value={member.birthdate || ""}
                onChange={(e) => setMember((m: any) => ({ ...m, birthdate: e.target.value }))}
                className="ml-2 rounded border border-zinc-300 px-2 py-1 text-sm"
              />
            </div>
            {(member.isFighter || member.group === "L-Gruppe") && (
              <div className="text-xs text-zinc-700">
                Gewicht:{" "}
                <input
                  value={member.weight || ""}
                  onChange={(e) => setMember({ ...member, weight: e.target.value })}
                  className="ml-2 rounded border border-zinc-300 px-2 py-1 text-sm"
                />
              </div>
            )}
            <div className="text-xs text-zinc-700">
              Stammgruppe:{" "}
              <select
                value={groupValue}
                onChange={(e) => setMember((m: any) => ({ ...m, group: e.target.value }))}
                className="ml-2 w-40 rounded border border-zinc-300 px-2 py-1 text-sm"
              >
                <option value="">– bitte wählen –</option>
                {TRAINING_GROUPS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="text-xs text-zinc-700">
              Wettkämpfer:{" "}
              <input
                type="checkbox"
                checked={!!member.isFighter}
                onChange={(e) => setMember((m: any) => ({ ...m, isFighter: e.target.checked }))}
                className="ml-2"
              />
            </div>
            {!(member.isFighter || member.group === "L-Gruppe") && (
              <div className="text-xs text-zinc-400">Gewicht nur relevant für Wettkämpfer oder L-Gruppe</div>
            )}
          </>
        ) : (
          <>
            <div className="text-xs text-zinc-700">Geburtsdatum: {member.birthdate}</div>
            {(member.isFighter || member.group === "L-Gruppe") && (
              <div className="text-xs text-zinc-700">Gewicht: {member.weight || "—"}</div>
            )}
            <div className="text-xs text-zinc-700">Stammgruppe: {member.group || "—"}</div>
            <div className="text-xs text-zinc-700">Wettkämpfer: {member.isFighter ? "Ja" : "Nein"}</div>
            {!(member.isFighter || member.group === "L-Gruppe") && (
              <div className="text-xs text-zinc-400">Gewicht nur relevant für Wettkämpfer oder L-Gruppe</div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/verwaltung-neu/mitglieder">
          <button type="button" className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400">
            Zurück
          </button>
        </Link>

        {editMode ? (
          <button
            type="button"
            className="rounded-md bg-[#154c83] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f3d6b]"
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
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: member.id,
                  birthdate: member.birthdate,
                  weight: member.weight,
                  group: member.group,
                  isFighter: member.isFighter,
                }),
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
          <button
            type="button"
            className="rounded-md bg-[#154c83] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f3d6b]"
            onClick={() => setEditMode(true)}
          >
            Bearbeiten
          </button>
        )}

        <button
          type="button"
          className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800"
          onClick={async () => {
            const confirmStep1 = confirm("Mitglied wirklich löschen?")
            if (!confirmStep1) return
            const confirmStep2 = confirm("Wirklich endgültig löschen?")
            if (!confirmStep2) return
            const res = await fetch("/api/admin/delete-member", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: member.id }),
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
