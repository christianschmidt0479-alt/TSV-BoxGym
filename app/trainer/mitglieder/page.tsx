"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatIsoDateForDisplay } from "@/lib/dateFormat"
import { buildTrainingGroupOptions, normalizeTrainingGroup } from "@/lib/trainingGroups"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type MemberRow = {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  birthdate?: string
  base_group?: string | null
  is_trial?: boolean
  lastCheckin?: string
  recentCheckinCount?: number
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

function daysSince(isoDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const last = new Date(`${isoDate}T12:00:00`)
  return Math.max(0, Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)))
}

export default function TrainerMitgliederPage() {
  const { resolved: authResolved, role: trainerRole, accountRole } = useTrainerAccess()
  const isAdmin = accountRole === "admin"
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deletingAttendanceId, setDeletingAttendanceId] = useState("")
  const [search, setSearch] = useState("")
  const [groupFilter, setGroupFilter] = useState("alle")
  const [members, setMembers] = useState<MemberRow[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState("")
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([])
  const [mobileTab, setMobileTab] = useState<"suche" | "anwesenheit">("suche")
  const [inaktivMode, setInaktivMode] = useState(false)
  const [urlChecked, setUrlChecked] = useState(false)

  useEffect(() => {
    const isInaktiv = new URLSearchParams(window.location.search).get("filter") === "inaktiv"
    setInaktivMode(isInaktiv)
    setUrlChecked(true)
  }, [])

  useEffect(() => {
    if (!urlChecked || !authResolved || !trainerRole) {
      if (!urlChecked || !authResolved) setLoading(true)
      else setLoading(false)
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        const url = inaktivMode
          ? `/api/trainer/members?inaktiv=1&today=${new Date().toISOString().slice(0, 10)}`
          : "/api/trainer/members"
        const response = await fetch(url, {
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
  }, [authResolved, trainerRole, inaktivMode, urlChecked])

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
      const normalizedGroup = normalizeTrainingGroup(member.base_group) || member.base_group || ""
      const matchesGroup = groupFilter === "alle" || normalizedGroup === groupFilter
      if (!matchesGroup) return false

      if (trimmed === "") return true

      return (
        getMemberDisplayName(member).toLowerCase().includes(trimmed) ||
        (member.birthdate ?? "").includes(trimmed) ||
        (member.base_group ?? "").toLowerCase().includes(trimmed)
      )
    })
  }, [groupFilter, members, search])

  const groupOptions = useMemo(() => {
    return buildTrainingGroupOptions(members.map((member) => member.base_group))
  }, [members])

  const selectedMember = useMemo(
    () => filteredMembers.find((member) => member.id === selectedMemberId) ?? null,
    [filteredMembers, selectedMemberId]
  )

  useEffect(() => {
    if (!selectedMemberId) return
    if (filteredMembers.some((member) => member.id === selectedMemberId)) return

    setSelectedMemberId("")
    setAttendanceRows([])
  }, [filteredMembers, selectedMemberId])

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

      {/* Mobile tab navigation */}
      <div className="flex rounded-2xl border border-zinc-200 bg-zinc-100 p-1 xl:hidden">
        <button
          type="button"
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${mobileTab === "suche" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
          onClick={() => setMobileTab("suche")}
        >
          Suche
        </button>
        <button
          type="button"
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${mobileTab === "anwesenheit" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
          onClick={() => setMobileTab("anwesenheit")}
        >
          Anwesenheit{selectedMemberId ? ` · ${getMemberDisplayName(members.find(m => m.id === selectedMemberId) ?? { id: selectedMemberId })}`.slice(0, 28) : ""}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className={mobileTab !== "suche" ? "hidden xl:block" : ""}>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Mitglieder finden</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {inaktivMode && (
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <span>Inaktiv-Filter: Mitglieder, die 3–8 Wochen lang zuletzt da waren und seitdem fehlen.</span>
                <button
                  type="button"
                  className="shrink-0 font-medium underline underline-offset-2"
                  onClick={() => { setInaktivMode(false); setSelectedMemberId(""); setAttendanceRows([]); setMobileTab("suche") }}
                >
                  Alle anzeigen
                </button>
              </div>
            )}
            <div className="space-y-2">
              <Label>Suche</Label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, Geburtsdatum oder Gruppe"
                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
              />
            </div>

            <div className="space-y-2">
              <Label>Gruppe</Label>
              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Gruppen</SelectItem>
                  {groupOptions.map((group) => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                      onClick={() => { setSelectedMemberId(member.id); setMobileTab("anwesenheit") }}
                    >
                      <div className="font-semibold text-zinc-900">{getMemberDisplayName(member)}</div>
                      <div className="mt-1 text-sm text-zinc-600">
                        {formatIsoDateForDisplay(member.birthdate) || "Geburtsdatum offen"} · {member.base_group || "Keine Stammgruppe"}
                      </div>
                      {member.lastCheckin ? (
                        <div className="mt-1 text-xs text-amber-700">
                          Zuletzt: {formatIsoDateForDisplay(member.lastCheckin)} · Seit {daysSince(member.lastCheckin)} Tagen · {member.recentCheckinCount ?? 0}× vorher
                        </div>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        <div className={mobileTab !== "anwesenheit" ? "hidden xl:block" : ""}>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Anwesenheit</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedMember ? (
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-2xl xl:hidden"
                  onClick={() => setMobileTab("suche")}
                >
                  ← Zurück zur Suche
                </Button>
                <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">
                  Zuerst ein Mitglied auswählen, um den Anwesenheitsverlauf zu sehen.
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-lg font-semibold text-zinc-900">{getMemberDisplayName(selectedMember)}</div>
                  <div className="mt-2 text-sm text-zinc-600">
                    Geburtsdatum: {formatIsoDateForDisplay(selectedMember.birthdate) || "—"} · Stammgruppe: {selectedMember.base_group || "—"}
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
                        {isAdmin ? <TableHead className="text-right">Aktion</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendanceRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.date}</TableCell>
                          <TableCell>{row.time}</TableCell>
                          <TableCell>{row.group_name}</TableCell>
                          {isAdmin ? (
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
                          ) : null}
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
    </div>
  )
}
