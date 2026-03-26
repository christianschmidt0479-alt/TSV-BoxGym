"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isValidPin, PIN_HINT, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type PendingMemberRecord = {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  birthdate?: string
  email?: string | null
  email_verified?: boolean
  email_verified_at?: string | null
  phone?: string | null
  guardian_name?: string | null
  is_trial?: boolean
  is_approved?: boolean
  base_group?: string | null
}

type CheckinCountRow = {
  member_id: string
}

const groupOptions = [
  "L-Gruppe",
  "Basic ab 18 Jahre",
  "Basic 10-14 Jahre",
  "Basic 15-18 Jahre",
  "Boxzwerge",
]

function getMemberDisplayName(member?: Partial<PendingMemberRecord> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
}

export default function FreigabenPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [pendingMembers, setPendingMembers] = useState<PendingMemberRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [usedByMember, setUsedByMember] = useState<Record<string, number>>({})
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({})
  const [pinDrafts, setPinDrafts] = useState<Record<string, string>>({})
  const [resendingVerification, setResendingVerification] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState("")
  const [emailFilter, setEmailFilter] = useState("alle")

  async function loadPending() {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/pending-overview", {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }

      const payload = (await response.json()) as {
        pendingMembers: PendingMemberRecord[]
        checkinRows: CheckinCountRow[]
      }

      const nextPending = payload.pendingMembers ?? []
      setPendingMembers(nextPending)

      const counts: Record<string, number> = {}
      for (const row of (payload.checkinRows ?? [])) {
        counts[row.member_id] = (counts[row.member_id] ?? 0) + 1
      }
      setUsedByMember(counts)
    } finally {
      setLoading(false)
    }
  }

  async function resendVerification(member: PendingMemberRecord) {
    if (!member.id || !member.email) {
      alert("Mitgliedsdaten unvollständig, kann E-Mail nicht erneut senden.")
      return
    }

    setResendingVerification((prev) => ({ ...prev, [member.id]: true }))

    try {
      const response = await fetch("/api/admin/member-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend_verification", memberId: member.id }),
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || "Bestätigungs-Mail konnte nicht versendet werden.")
      }

      alert("Bestätigungs-Mail wurde erneut versendet.")
      await loadPending()
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : "Bestätigungs-Mail konnte nicht versendet werden."
      alert(message)
    } finally {
      setResendingVerification((prev) => ({ ...prev, [member.id]: false }))
    }
  }

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }

    void loadPending()
  }, [authResolved, trainerRole])

  const filteredPending = useMemo(() => {
    const trimmedSearch = search.trim().toLowerCase()

    return pendingMembers.filter((member) => {
      const matchesSearch =
        trimmedSearch === "" ||
        getMemberDisplayName(member).toLowerCase().includes(trimmedSearch) ||
        (member.email ?? "").toLowerCase().includes(trimmedSearch) ||
        (member.guardian_name ?? "").toLowerCase().includes(trimmedSearch)

      const matchesEmail =
        emailFilter === "alle" ||
        (emailFilter === "bestaetigt" && !!member.email_verified) ||
        (emailFilter === "offen" && !member.email_verified)

      return matchesSearch && matchesEmail
    })
  }, [emailFilter, pendingMembers, search])

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Offene Freigaben</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Nur im Admin-Modus.</div>
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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Offene Freigaben</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/">Zurück zum Dashboard</Link>
        </Button>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Suche</Label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name oder E-Mail"
                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
              />
            </div>

            <div className="space-y-2">
              <Label>E-Mail-Status</Label>
              <Select value={emailFilter} onValueChange={setEmailFilter}>
                <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle</SelectItem>
                  <SelectItem value="offen">Wartet auf E-Mail-Bestätigung</SelectItem>
                  <SelectItem value="bestaetigt">E-Mail bestätigt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Freigabeliste</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Freigaben werden geladen...</div>
          ) : filteredPending.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine offenen Freigaben gefunden.</div>
          ) : (
            filteredPending.map((member) => {
              const used = usedByMember[member.id] ?? 0
              const remaining = Math.max(0, 6 - used)
              const selectedGroup = groupDrafts[member.id] ?? member.base_group ?? groupOptions[0]

              return (
                <div key={member.id} className="rounded-3xl border border-zinc-200 bg-white p-5">
                  <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr_1fr_auto] xl:items-end">
                    <div className="space-y-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-zinc-900">{getMemberDisplayName(member)}</div>
                        <Badge
                          variant="outline"
                          className={
                            member.email_verified
                              ? "border-blue-200 bg-blue-100 text-blue-800"
                              : "border-zinc-200 bg-zinc-100 text-zinc-700"
                          }
                        >
                          {member.email_verified ? "E-Mail bestätigt" : "Wartet auf E-Mail"}
                        </Badge>
                      </div>
                      <div className="text-zinc-600">Geburtsdatum: {member.birthdate || "—"}</div>
                      <div className="text-zinc-600">E-Mail: {member.email || "—"}</div>
                      <div className="text-zinc-600">Telefon: {member.phone || "—"}</div>
                      {member.base_group === "Boxzwerge" ? (
                        <div className="text-zinc-600">Eltern / Notfallkontakt: {member.guardian_name || "—"}</div>
                      ) : null}
                      <div className="text-zinc-600">Stammgruppe: {member.base_group || "—"}</div>
                      {member.email_verified_at && (
                        <div className="text-xs text-zinc-500">
                          Bestätigt am: {new Date(member.email_verified_at).toLocaleString("de-DE")}
                        </div>
                      )}
                      <div className="text-xs text-blue-700">
                        Bereits genutzt: {used} / 6 · Verbleibend: <span className="font-semibold">{remaining}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Stammgruppe</Label>
                      <Select
                        value={selectedGroup}
                        onValueChange={(value) => setGroupDrafts((prev) => ({ ...prev, [member.id]: value }))}
                      >
                        <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {groupOptions.map((group) => (
                            <SelectItem key={group} value={group}>
                              {group}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Neuer Zugangscode</Label>
                      <PasswordInput
                        value={pinDrafts[member.id] ?? ""}
                        onChange={(event) =>
                          setPinDrafts((prev) => ({ ...prev, [member.id]: event.target.value }))
                        }
                        placeholder="optional, 6 bis 16 Zeichen"
                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                      />
                      <div className="text-xs text-zinc-500">{PIN_HINT}</div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                        disabled={!member.email_verified}
                        onClick={async () => {
                          if (!member.email_verified) {
                            alert("E-Mail noch nicht bestätigt.")
                            return
                          }

                          const newPin = (pinDrafts[member.id] ?? "").trim()
                          if (newPin && !isValidPin(newPin)) {
                            alert(PIN_REQUIREMENTS_MESSAGE)
                            return
                          }

                          try {
                            const response = await fetch("/api/admin/member-action", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "approve",
                                memberId: member.id,
                                baseGroup: selectedGroup,
                                newPin: newPin || undefined,
                              }),
                            })

                            if (!response.ok) {
                              throw new Error(await response.text())
                            }
                            alert("Mitglied freigegeben.")
                            await loadPending()
                          } catch (error) {
                            console.error(error)
                            alert("Fehler bei der Freigabe.")
                          }
                        }}
                      >
                        Freigeben
                      </Button>

                      {!member.email_verified && (
                        <Button
                          variant="outline"
                          className="rounded-2xl border-[#c8d8ea] text-[#154c83]"
                          onClick={() => void resendVerification(member)}
                          disabled={Boolean(resendingVerification[member.id])}
                        >
                          {resendingVerification[member.id] ? "Sende..." : "Bestätigungs-Mail erneut senden"}
                        </Button>
                      )}
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
