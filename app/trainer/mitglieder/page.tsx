"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatIsoDateForDisplay } from "@/lib/dateFormat"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type MemberRow = {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  birthdate?: string
  email?: string | null
  phone?: string | null
  base_group?: string | null
  is_trial?: boolean
}

type AttendanceRow = {
  id: string
  member_id: string
  group_name: string
  date: string
  time: string
  created_at: string
}

function getMemberDisplayName(member: MemberRow) {
  const full = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
  return full || member.name || "—"
}

export default function TrainerMitgliederPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deletingAttendanceId, setDeletingAttendanceId] = useState("")
  const [search, setSearch] = useState("")
  const [members, setMembers] = useState<MemberRow[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState("")
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([])

  useEffect(() => {
    if (!authResolved || !trainerRole) {
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        const response = await fetch("/api/trainer/members", {
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error(await response.text())
        }

        const payload = (await response.json()) as {
          members: MemberRow[]
        }

        setMembers(payload.members ?? [])
      } finally {
        setLoading(false)
      }
    })()
  }, [authResolved, trainerRole])

  useEffect(() => {
    if (!selectedMemberId || !trainerRole) {
      setAttendanceRows([])
      return
    }

    void loadAttendance(selectedMemberId)
  }, [selectedMemberId, trainerRole])

  async function loadAttendance(memberId: string) {
    try {
      setDetailLoading(true)
      const response = await fetch(`/api/trainer/members?memberId=${encodeURIComponent(memberId)}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }

      const payload = (await response.json()) as {
        attendanceRows: AttendanceRow[]
      }

      setAttendanceRows(payload.attendanceRows ?? [])
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleDeleteAttendance(row: AttendanceRow) {
    if (!selectedMember) return

    const confirmed = window.confirm(
      `${getMemberDisplayName(selectedMember)} aus dem Check-in vom ${row.date} um ${row.time} entfernen?`
    )
    if (!confirmed) return

    try {
      setDeletingAttendanceId(row.id)
      const response = await fetch("/api/admin/checkins", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkinId: row.id }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }

      setAttendanceRows((current) => current.filter((entry) => entry.id !== row.id))
    } catch (error) {
      console.error(error)
      alert("Fehler beim Entfernen des Check-ins.")
    } finally {
      setDeletingAttendanceId("")
    }
  }

  const filteredMembers = useMemo(() => {
    const trimmed = search.trim().toLowerCase()

    return members.filter((member) => {
      if (trimmed === "") return true

      return (
        getMemberDisplayName(member).toLowerCase().includes(trimmed) ||
        (member.email ?? "").toLowerCase().includes(trimmed) ||
        (member.phone ?? "").toLowerCase().includes(trimmed) ||
        (member.birthdate ?? "").includes(trimmed) ||
        (member.base_group ?? "").toLowerCase().includes(trimmed)
      )
    })
  }, [members, search])

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId]
  )

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (!trainerRole) {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Mitgliedersuche</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Nur mit Trainer- oder Adminzugang.</div>
          <Button asChild className="rounded-2xl">
            <Link href="/">Zur Startseite</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Mitgliedersuche</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/trainer">Zurück zum Trainer-Dashboard</Link>
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Mitglieder finden</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Suche</Label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, Geburtsdatum, Telefon, E-Mail oder Gruppe"
                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
              />
            </div>

            {loading ? (
              <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Mitglieder werden geladen...</div>
            ) : filteredMembers.length === 0 ? (
              <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine passenden Mitglieder gefunden.</div>
            ) : (
              <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                {filteredMembers.map((member) => {
                  const isSelected = member.id === selectedMemberId

                  return (
                    <button
                      key={member.id}
                      type="button"
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? "border-[#154c83] bg-[#eef4fb]"
                          : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
                      }`}
                      onClick={() => setSelectedMemberId(member.id)}
                    >
                      <div className="font-semibold text-zinc-900">{getMemberDisplayName(member)}</div>
                      <div className="mt-1 text-sm text-zinc-600">
                        {formatIsoDateForDisplay(member.birthdate) || "Geburtsdatum offen"} · {member.base_group || "Keine Stammgruppe"}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Anwesenheit</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedMember ? (
              <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">
                Links ein Mitglied auswählen, um den Anwesenheitsverlauf zu sehen.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-lg font-semibold text-zinc-900">{getMemberDisplayName(selectedMember)}</div>
                  <div className="mt-2 text-sm text-zinc-600">
                    Geburtsdatum: {formatIsoDateForDisplay(selectedMember.birthdate) || "—"} · Stammgruppe: {selectedMember.base_group || "—"}
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">
                    Kontakt: {selectedMember.phone || "—"} · {selectedMember.email || "—"}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl bg-zinc-100 p-4">
                    <div className="text-sm text-zinc-500">Check-ins gesamt</div>
                    <div className="mt-1 text-3xl font-bold text-[#154c83]">{detailLoading ? "…" : attendanceRows.length}</div>
                  </div>
                  <div className="rounded-2xl bg-zinc-100 p-4">
                    <div className="text-sm text-zinc-500">Zuletzt da</div>
                    <div className="mt-1 text-sm font-medium text-zinc-800">
                      {attendanceRows[0] ? `${attendanceRows[0].date} · ${attendanceRows[0].time}` : "Noch kein Check-in"}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-zinc-100 p-4">
                    <div className="text-sm text-zinc-500">Letzte Gruppe</div>
                    <div className="mt-1 text-sm font-medium text-zinc-800">{attendanceRows[0]?.group_name || "—"}</div>
                  </div>
                </div>

                {detailLoading ? (
                  <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Anwesenheit wird geladen...</div>
                ) : attendanceRows.length === 0 ? (
                  <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Für dieses Mitglied gibt es noch keine Anwesenheit.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead>Uhrzeit</TableHead>
                        <TableHead>Gruppe</TableHead>
                        <TableHead className="text-right">Aktion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendanceRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.date}</TableCell>
                          <TableCell>{row.time}</TableCell>
                          <TableCell>{row.group_name}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-2xl"
                              disabled={deletingAttendanceId === row.id}
                              onClick={() => {
                                void handleDeleteAttendance(row)
                              }}
                            >
                              {deletingAttendanceId === row.id ? "Entfernt..." : "Entfernen"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
