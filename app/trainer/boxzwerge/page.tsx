"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatIsoDateForDisplay } from "@/lib/dateFormat"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type BoxzwergeMemberRow = {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  birthdate?: string
  email?: string | null
  phone?: string | null
  guardian_name?: string | null
  is_approved?: boolean
  base_group?: string | null
}

type CheckinRow = {
  id: string
  member_id: string
  date: string
  created_at: string
}

function getMemberDisplayName(member: BoxzwergeMemberRow) {
  const full = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
  return full || member.name || "—"
}

function getAgeInYears(birthdate?: string) {
  if (!birthdate) return null

  const today = new Date()
  const birth = new Date(`${birthdate}T12:00:00`)

  if (Number.isNaN(birth.getTime())) return null

  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }

  return age
}

export default function TrainerBoxzwergePage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState("")
  const [search, setSearch] = useState("")
  const [birthdateFilter, setBirthdateFilter] = useState("")
  const [presenceFilter, setPresenceFilter] = useState<"alle" | "heute-da" | "offen">("alle")
  const [members, setMembers] = useState<BoxzwergeMemberRow[]>([])
  const [todayCheckins, setTodayCheckins] = useState<CheckinRow[]>([])
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/trainer/boxzwerge?today=${encodeURIComponent(today)}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }

      const payload = (await response.json()) as {
        members: BoxzwergeMemberRow[]
        todayCheckins: CheckinRow[]
      }

      setMembers(payload.members ?? [])
      setTodayCheckins(payload.todayCheckins ?? [])
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => {
    if (!authResolved || !trainerRole) {
      setLoading(false)
      return
    }

    void loadData()
  }, [authResolved, loadData, trainerRole])

  const presentIds = useMemo(() => new Set(todayCheckins.map((row) => row.member_id)), [todayCheckins])

  const filteredMembers = useMemo(() => {
    const trimmed = search.trim().toLowerCase()

    return members
      .filter((member) => {
        const isPresent = presentIds.has(member.id)
        const matchesSearch =
          trimmed === "" ||
          getMemberDisplayName(member).toLowerCase().includes(trimmed) ||
          (member.guardian_name ?? "").toLowerCase().includes(trimmed) ||
          (member.email ?? "").toLowerCase().includes(trimmed) ||
          (member.phone ?? "").toLowerCase().includes(trimmed)
        const matchesBirthdate = birthdateFilter === "" || member.birthdate === birthdateFilter
        const matchesPresence =
          presenceFilter === "alle" ||
          (presenceFilter === "heute-da" && isPresent) ||
          (presenceFilter === "offen" && !isPresent)

        return matchesSearch && matchesBirthdate && matchesPresence
      })
      .sort((a, b) => {
        const aWarning = (getAgeInYears(a.birthdate) ?? -1) >= 10
        const bWarning = (getAgeInYears(b.birthdate) ?? -1) >= 10

        if (aWarning !== bWarning) return aWarning ? -1 : 1

        return getMemberDisplayName(a).localeCompare(getMemberDisplayName(b))
      })
  }, [birthdateFilter, members, presenceFilter, presentIds, search])

  const summary = useMemo(() => {
    return {
      total: members.length,
      present: todayCheckins.length,
      open: Math.max(0, members.length - todayCheckins.length),
      missingContact: members.filter((member) => !(member.phone ?? "").trim() && !(member.email ?? "").trim()).length,
    }
  }, [members, todayCheckins])

  const openFilteredMembers = useMemo(() => {
    return filteredMembers.filter((member) => !presentIds.has(member.id))
  }, [filteredMembers, presentIds])

  async function createBoxzwergeCheckin(memberId: string) {
    const response = await fetch("/api/trainer/boxzwerge-checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        member_id: memberId,
        group_name: "Boxzwerge",
        date: today,
        time: new Date().toLocaleTimeString("de-DE", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        year: new Date(`${today}T12:00:00`).getFullYear(),
        month_key: today.slice(0, 7),
      }),
    })

    if (!response.ok) {
      throw new Error(await response.text())
    }
  }

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (!trainerRole) {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Boxzwerge</CardTitle>
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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Boxzwerge</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/trainer">Zurück zum Trainer-Dashboard</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Kinder gesamt</div>
            <div className="mt-1 text-3xl font-bold">{loading ? "…" : summary.total}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Heute aktiviert</div>
            <div className="mt-1 text-3xl font-bold text-emerald-700">{loading ? "…" : summary.present}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Noch offen</div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">{loading ? "…" : summary.open}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Ohne Kontaktangabe</div>
            <div className="mt-1 text-3xl font-bold text-amber-600">{loading ? "…" : summary.missingContact}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Suche und Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Suche</Label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Kind, Elternkontakt, Mail oder Telefon"
                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
              />
            </div>
            <div className="space-y-2">
              <Label>Geburtsdatum</Label>
              <Input
                type="date"
                value={birthdateFilter}
                onChange={(event) => setBirthdateFilter(event.target.value)}
                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant={presenceFilter === "alle" ? "default" : "outline"} className="rounded-2xl" onClick={() => setPresenceFilter("alle")}>
                  Alle
                </Button>
                <Button type="button" variant={presenceFilter === "heute-da" ? "default" : "outline"} className="rounded-2xl" onClick={() => setPresenceFilter("heute-da")}>
                  Heute da
                </Button>
                <Button type="button" variant={presenceFilter === "offen" ? "default" : "outline"} className="rounded-2xl" onClick={() => setPresenceFilter("offen")}>
                  Noch offen
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Heute aktivieren</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
              disabled={loading || openFilteredMembers.length === 0 || savingId === "__bulk__"}
              onClick={async () => {
                try {
                  setSavingId("__bulk__")

                  for (const member of openFilteredMembers) {
                    await createBoxzwergeCheckin(member.id)
                  }

                  await loadData()
                } catch (error) {
                  console.error(error)
                  alert("Fehler bei der Sammelaktivierung der Boxzwerge.")
                } finally {
                  setSavingId("")
                }
              }}
            >
              {savingId === "__bulk__"
                ? "Aktiviert..."
                : `Alle offenen aktivieren (${openFilteredMembers.length})`}
            </Button>
            <div className="rounded-2xl bg-zinc-100 px-4 py-2 text-sm text-zinc-600">
              Aktuelle Filterung: {filteredMembers.length} Kinder
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Boxzwerge werden geladen...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine passenden Boxzwerge gefunden.</div>
          ) : (
            filteredMembers.map((member) => {
              const isPresent = presentIds.has(member.id)
              const todayCheckin = todayCheckins.find((row) => row.member_id === member.id) ?? null
              const age = getAgeInYears(member.birthdate)
              const isAgingWarning = (age ?? -1) >= 10

              return (
                <div
                  key={member.id}
                  className={`rounded-3xl border p-5 ${isAgingWarning ? "border-red-200 bg-red-50/70" : "border-zinc-200 bg-white"}`}
                >
                  <div className="grid gap-5 xl:grid-cols-[1.3fr_auto] xl:items-end">
                    <div className="space-y-2 text-sm text-zinc-600">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-zinc-900">{getMemberDisplayName(member)}</div>
                        {isAgingWarning ? (
                          <Badge variant="outline" className="border-red-200 bg-red-100 text-red-800">
                            10+
                          </Badge>
                        ) : null}
                        <Badge
                          variant="outline"
                          className={
                            isPresent
                              ? "border-green-200 bg-green-100 text-green-800"
                              : "border-zinc-200 bg-zinc-100 text-zinc-700"
                          }
                        >
                          {isPresent ? "Heute aktiviert" : "Noch offen"}
                        </Badge>
                      </div>
                      <div className={isAgingWarning ? "font-semibold text-red-700" : undefined}>
                        Geburtsdatum: {formatIsoDateForDisplay(member.birthdate) || "—"}{age !== null ? ` · ${age} Jahre` : ""}
                      </div>
                      {isAgingWarning ? (
                        <div className="text-xs font-semibold text-red-700">Boxzwerge-Warnung ab 10 Jahren</div>
                      ) : null}
                      <div>Eltern / Notfallkontakt: {member.guardian_name || "—"}</div>
                      <div>Telefon: {member.phone || "—"}</div>
                      <div>E-Mail: {member.email || "—"}</div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <Button
                        type="button"
                        className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                        disabled={isPresent || savingId === member.id}
                        onClick={async () => {
                          try {
                            setSavingId(member.id)
                            await createBoxzwergeCheckin(member.id)
                            await loadData()
                          } catch (error) {
                            console.error(error)
                            alert("Fehler beim Aktivieren des Boxzwergs.")
                          } finally {
                            setSavingId("")
                          }
                        }}
                      >
                        {isPresent ? "Bereits heute da" : savingId === member.id ? "Aktiviert..." : "Für heute aktivieren"}
                      </Button>
                      {isPresent && todayCheckin ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl"
                          disabled={savingId === member.id}
                          onClick={async () => {
                            try {
                              setSavingId(member.id)
                              const response = await fetch(`/api/trainer/boxzwerge-checkin?id=${encodeURIComponent(todayCheckin.id)}`, {
                                method: "DELETE",
                              })
                              if (!response.ok) {
                                throw new Error(await response.text())
                              }
                              await loadData()
                            } catch (error) {
                              console.error(error)
                              alert("Fehler beim Zurücknehmen des heutigen Boxzwerge-Status.")
                            } finally {
                              setSavingId("")
                            }
                          }}
                        >
                          Heute zurücknehmen
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
