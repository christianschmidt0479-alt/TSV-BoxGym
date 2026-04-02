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
import { getRecommendedTrainingGroup, normalizeTrainingGroupOrFallback, TRAINING_GROUPS } from "@/lib/trainingGroups"
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

type ToastState = {
  message: string
  variant: "success" | "error"
}

type SendGsRequestOptions = {
  recipientEmail?: string
  subject?: string
  athleteLabel?: string
  mode?: "default" | "test"
}

const groupOptions = [...TRAINING_GROUPS]

async function copyTextToClipboard(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false
  }

  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

function getMemberDisplayName(member?: Partial<PendingMemberRecord> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
}

function formatBirthdateLabel(value?: string) {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    return "—"
  }

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmedValue)) {
    return trimmedValue
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    const [year, month, day] = trimmedValue.split("-").map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))

    if (
      !Number.isNaN(date.getTime()) &&
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(date)
    }
  }

  const parsed = new Date(trimmedValue)
  if (Number.isNaN(parsed.getTime())) {
    return trimmedValue
  }

  return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(parsed)
}

export default function FreigabenPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [pendingMembers, setPendingMembers] = useState<PendingMemberRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [usedByMember, setUsedByMember] = useState<Record<string, number>>({})
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({})
  const [pinDrafts, setPinDrafts] = useState<Record<string, string>>({})
  const [resendingVerification, setResendingVerification] = useState<Record<string, boolean>>({})
  const [sendingGsRequest, setSendingGsRequest] = useState<Record<string, boolean>>({})
  const [sendingGsTestRequest, setSendingGsTestRequest] = useState<Record<string, boolean>>({})
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [emailFilter, setEmailFilter] = useState("alle")
  const [toast, setToast] = useState<ToastState | null>(null)
  const [gsConfirmedAtByMemberId, setGsConfirmedAtByMemberId] = useState<Record<string, string>>({})

  function showToast(message: string, variant: ToastState["variant"]) {
    setToast({ message, variant })
  }

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
        gsConfirmedAtByMemberId?: Record<string, string>
      }

      const nextPending = payload.pendingMembers ?? []
      setPendingMembers(nextPending)
      setGsConfirmedAtByMemberId(payload.gsConfirmedAtByMemberId ?? {})

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

      const result = (await response.json()) as {
        verificationLink?: string
        delivery?: { messageId?: string | null }
      }
      const copied = result.verificationLink ? await copyTextToClipboard(result.verificationLink) : false
      const providerSuffix = result.delivery?.messageId ? ` Provider-ID: ${result.delivery.messageId}` : ""
      alert(
        copied
          ? `Bestätigungs-Mail wurde an den Mail-Dienst übergeben.${providerSuffix} Der Bestätigungslink wurde zusätzlich in die Zwischenablage kopiert.`
          : `Bestätigungs-Mail wurde an den Mail-Dienst übergeben.${providerSuffix}`
      )
      await loadPending()
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : "Bestätigungs-Mail konnte nicht versendet werden."
      alert(message)
    } finally {
      setResendingVerification((prev) => ({ ...prev, [member.id]: false }))
    }
  }

  async function deletePendingMember(member: PendingMemberRecord) {
    const displayName = getMemberDisplayName(member)
    const confirmed = window.confirm(`${displayName} wirklich löschen? Der Datensatz wird vollständig entfernt.`)
    if (!confirmed) return

    setDeletingMemberId(member.id)

    try {
      const response = await fetch("/api/admin/member-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_member",
          memberId: member.id,
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      await loadPending()
      alert("Freigabe-Eintrag gelöscht.")
    } catch (error) {
      console.error(error)
      alert("Das Mitglied konnte nicht gelöscht werden.")
    } finally {
      setDeletingMemberId(null)
    }
  }

  async function sendGsRequest(member: PendingMemberRecord, options?: SendGsRequestOptions) {
    const firstName = member.first_name?.trim() ?? ""
    const lastName = member.last_name?.trim() ?? ""
    const birthdate = member.birthdate?.trim() ?? ""
    const isTestMode = options?.mode === "test"

    if (!firstName || !lastName || !birthdate) {
      showToast("Vorname, Nachname oder Geburtsdatum fehlen.", "error")
      return
    }

    const setSendingState = isTestMode ? setSendingGsTestRequest : setSendingGsRequest
    setSendingState((prev) => ({ ...prev, [member.id]: true }))

    try {
      const response = await fetch("/api/admin/mail-gs-anfrage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: member.id,
          firstName,
          lastName,
          birthdate,
          recipientEmail: options?.recipientEmail,
          subject: options?.subject,
          athleteLabel: options?.athleteLabel,
        }),
      })

      if (!response.ok) {
        let message = "GS-Anfrage konnte nicht versendet werden."

        try {
          const payload = (await response.json()) as { error?: string }
          message = payload.error || message
        } catch {
          const fallback = await response.text()
          if (fallback) {
            message = fallback
          }
        }

        throw new Error(message)
      }

      showToast(
        isTestMode ? "Test-Anfrage an Christian gesendet" : "Anfrage an Geschäftsstelle gesendet",
        "success"
      )
    } catch (error) {
      console.error(error)
      showToast(error instanceof Error ? error.message : "GS-Anfrage konnte nicht versendet werden.", "error")
    } finally {
      setSendingState((prev) => ({ ...prev, [member.id]: false }))
    }
  }

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }

    void loadPending()
  }, [authResolved, trainerRole])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null)
    }, 4000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [toast])

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
      {toast ? (
        <div className="fixed top-4 right-4 z-50 max-w-sm">
          <div
            className={
              toast.variant === "success"
                ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg"
                : "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg"
            }
          >
            {toast.message}
          </div>
        </div>
      ) : null}

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
              const gsConfirmedAt = gsConfirmedAtByMemberId[member.id] ?? ""
              const isClaraTestMember =
                member.first_name?.trim() === "Clara" && member.last_name?.trim() === "Ullrich" && member.birthdate?.trim() === "2007-05-09"
              const selectedGroup =
                groupDrafts[member.id] ??
                normalizeTrainingGroupOrFallback(member.base_group, getRecommendedTrainingGroup(member.birthdate))

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
                      <div className="text-zinc-600">Geburtsdatum: {formatBirthdateLabel(member.birthdate)}</div>
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
                      {gsConfirmedAt ? (
                        <div className="text-xs font-medium text-emerald-700">
                          TSV-Mitgliedschaft bestätigt am {new Date(gsConfirmedAt).toLocaleString("de-DE")}
                        </div>
                      ) : null}
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
                        type="button"
                        variant="outline"
                        className="rounded-2xl border-[#c8d8ea] text-[#154c83]"
                        onClick={() => void sendGsRequest(member)}
                        disabled={Boolean(sendingGsRequest[member.id]) || Boolean(sendingGsTestRequest[member.id]) || deletingMemberId === member.id}
                      >
                        {sendingGsRequest[member.id] ? "Sende GS-Anfrage..." : "Anfrage an GS senden"}
                      </Button>

                      {isClaraTestMember ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl border-amber-200 text-amber-800 hover:bg-amber-50 hover:text-amber-900"
                          onClick={() =>
                            void sendGsRequest(member, {
                              recipientEmail: "christian.schmidt0479@gmail.com",
                              subject: "Test Mitgliedsabgleich Clara Ullrich",
                              athleteLabel: "Sportlerin",
                              mode: "test",
                            })
                          }
                          disabled={Boolean(sendingGsRequest[member.id]) || Boolean(sendingGsTestRequest[member.id]) || deletingMemberId === member.id}
                        >
                          {sendingGsTestRequest[member.id] ? "Sende Testmail..." : "Test an Christian senden"}
                        </Button>
                      ) : null}

                      <Button
                        className={
                          gsConfirmedAt
                            ? "rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                            : "rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                        }
                        disabled={!member.email_verified || deletingMemberId === member.id}
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
                        {gsConfirmedAt ? "Freigeben (GS bestätigt)" : "Freigeben"}
                      </Button>

                      {!member.email_verified && (
                        <>
                          <Button
                            variant="outline"
                            className="rounded-2xl border-[#c8d8ea] text-[#154c83]"
                            onClick={() => void resendVerification(member)}
                            disabled={Boolean(resendingVerification[member.id]) || deletingMemberId === member.id}
                          >
                            {resendingVerification[member.id] ? "Sende..." : "Bestätigungs-Mail erneut senden"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-2xl border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                            onClick={() => void deletePendingMember(member)}
                            disabled={deletingMemberId === member.id || Boolean(resendingVerification[member.id])}
                          >
                            {deletingMemberId === member.id ? "Löscht..." : "Eintrag löschen"}
                          </Button>
                        </>
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
