"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { getTodayIsoDateInBerlin } from "@/lib/dateFormat"
import { getMemberCheckinModeLabel } from "@/lib/memberCheckin"
import { buildTrainingGroupOptions, compareTrainingGroupOrder, normalizeTrainingGroup } from "@/lib/trainingGroups"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type CheckinMember = {
  id?: string
  name?: string
  first_name?: string
  last_name?: string
  birthdate?: string
  is_trial?: boolean
  is_approved?: boolean
  base_group?: string | null
}

type CheckinRow = {
  id: string
  member_id: string
  group_name: string
  checkin_mode?: string | null
  date: string
  time: string
  created_at: string
  members?: CheckinMember | CheckinMember[] | null
}

function getRelatedMember(member?: CheckinRow["members"]) {
  if (Array.isArray(member)) return member[0] ?? null
  return member ?? null
}

function getMemberDisplayName(member?: CheckinRow["members"]) {
  const resolvedMember = getRelatedMember(member)
  const first = resolvedMember?.first_name ?? ""
  const last = resolvedMember?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || resolvedMember?.name || "—"
}

function getCheckinModeBadgeClassName(mode?: string | null) {
  return mode === "ferien"
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : "border-[#cfe0ef] bg-[#f4f9ff] text-[#154c83]"
}

function isTrialCheckin(row: CheckinRow) {
  return Boolean(getRelatedMember(row.members)?.is_trial)
}

function getBaseGroup(row: CheckinRow) {
  return getRelatedMember(row.members)?.base_group ?? "—"
}

function getBirthdate(row: CheckinRow) {
  return getRelatedMember(row.members)?.birthdate ?? "—"
}

function getMemberType(row: CheckinRow) {
  const member = getRelatedMember(row.members)
  if (member?.is_trial) return "Probetraining"
  if (member?.is_approved === false) return "Registriert"
  return "Mitglied"
}

export default function CheckinsPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [rows, setRows] = useState<CheckinRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState("")
  const [groupFilter, setGroupFilter] = useState("alle")
  const [typeFilter, setTypeFilter] = useState("alle")
  const [nameFilter, setNameFilter] = useState("")
  const [dateFilter, setDateFilter] = useState(() => getTodayIsoDateInBerlin())

  useEffect(() => {
    if (!authResolved || !trainerRole) {
      setLoading(false)
      return
    }

    void loadRows()
  }, [authResolved, trainerRole])

  async function loadRows() {
    try {
      setLoading(true)
      const response = await fetch("/api/admin/checkins", {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }

      const payload = (await response.json()) as {
        rows: CheckinRow[]
      }

      setRows(payload.rows ?? [])
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteCheckin(row: CheckinRow) {
    const memberName = getMemberDisplayName(row.members)
    const confirmed = window.confirm(
      `${memberName} aus dem Check-in vom ${row.date} um ${row.time} entfernen?`
    )
    if (!confirmed) return

    try {
      setDeletingId(row.id)
      const response = await fetch("/api/admin/checkins", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkinId: row.id }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }

      setRows((current) => current.filter((entry) => entry.id !== row.id))
    } catch (error) {
      console.error(error)
      alert("Fehler beim Entfernen des Check-ins.")
    } finally {
      setDeletingId("")
    }
  }

  const groupOptions = useMemo(() => {
    return buildTrainingGroupOptions(rows.map((row) => row.group_name))
  }, [rows])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesDate = row.date === dateFilter
      const normalizedGroup = normalizeTrainingGroup(row.group_name) || row.group_name
      const matchesGroup = groupFilter === "alle" || normalizedGroup === groupFilter
      const matchesType =
        typeFilter === "alle" ||
        (typeFilter === "mitglied" && !isTrialCheckin(row)) ||
        (typeFilter === "probetraining" && isTrialCheckin(row))
      const matchesName =
        nameFilter.trim() === "" ||
        getMemberDisplayName(row.members).toLowerCase().includes(nameFilter.trim().toLowerCase())

      return matchesDate && matchesGroup && matchesType && matchesName
    })
  }, [dateFilter, groupFilter, nameFilter, rows, typeFilter])

  const groupStats = useMemo(() => {
    const counts = new Map<string, { count: number; trial: number; members: number }>()

    for (const row of filteredRows) {
      const normalizedGroup = normalizeTrainingGroup(row.group_name) || row.group_name
      const current = counts.get(normalizedGroup) ?? { count: 0, trial: 0, members: 0 }
      current.count += 1
      if (isTrialCheckin(row)) current.trial += 1
      else current.members += 1
      counts.set(normalizedGroup, current)
    }

    return Array.from(counts.entries())
      .map(([group, values]) => ({ group, ...values }))
      .sort((a, b) => compareTrainingGroupOrder(a.group, b.group) || a.group.localeCompare(b.group, "de"))
  }, [filteredRows])

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (!trainerRole) {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Check-ins</CardTitle>
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Check-ins</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Check-ins am Tag</div>
            <div className="mt-1 text-3xl font-bold">{filteredRows.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Mitglieder</div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">
              {filteredRows.filter((row) => !isTrialCheckin(row)).length}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Probetraining</div>
            <div className="mt-1 text-3xl font-bold text-emerald-700">
              {filteredRows.filter((row) => isTrialCheckin(row)).length}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Gruppen</div>
            <div className="mt-1 text-3xl font-bold">{groupStats.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
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

            <div className="space-y-2">
              <Label>Typ</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle</SelectItem>
                  <SelectItem value="mitglied">Mitglied</SelectItem>
                  <SelectItem value="probetraining">Probetraining</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={nameFilter}
                onChange={(event) => setNameFilter(event.target.value)}
                placeholder="Name eingeben"
                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Gruppenübersicht</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {groupStats.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine Check-ins für die aktuelle Filterung.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {groupStats.map((group) => (
                <div key={group.group} className="rounded-2xl bg-zinc-100 p-4">
                  <div className="font-semibold text-zinc-900">{group.group}</div>
                  <div className="mt-2 text-sm text-zinc-600">Gesamt: {group.count}</div>
                  <div className="text-sm text-zinc-600">Mitglieder: {group.members}</div>
                  <div className="text-sm text-zinc-600">Probetraining: {group.trial}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Check-in-Liste</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Check-ins werden geladen...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Uhrzeit</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Geburtsdatum</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Stammgruppe</TableHead>
                  <TableHead>Gruppe heute</TableHead>
                  <TableHead>Modus</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-zinc-500">
                      Keine Check-ins für die aktuelle Filterung vorhanden.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.time}</TableCell>
                      <TableCell className="font-medium">{getMemberDisplayName(row.members)}</TableCell>
                      <TableCell>{getBirthdate(row)}</TableCell>
                      <TableCell>{getMemberType(row)}</TableCell>
                      <TableCell>{getBaseGroup(row)}</TableCell>
                      <TableCell>{row.group_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getCheckinModeBadgeClassName(row.checkin_mode)}>
                          {getMemberCheckinModeLabel(row.checkin_mode)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl"
                          disabled={deletingId === row.id}
                          onClick={() => {
                            void handleDeleteCheckin(row)
                          }}
                        >
                          {deletingId === row.id ? "Entfernt..." : "Entfernen"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
