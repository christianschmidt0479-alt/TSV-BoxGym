"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronDown, ChevronUp } from "lucide-react"
import { buildAdminMailComposeHref } from "@/lib/adminMailComposeClient"
import { formatDateInputForDisplay, formatDisplayDateTime } from "@/lib/dateFormat"
import { MEMBER_PASSWORD_HINT, MEMBER_PASSWORD_REQUIREMENTS_MESSAGE, isValidMemberPassword } from "@/lib/memberPassword"
import { getRecommendedTrainingGroup, normalizeTrainingGroupOrFallback, TRAINING_GROUPS } from "@/lib/trainingGroups"
import { useTrainerAccess } from "@/lib/useTrainerAccess"
import { useMarkSectionSeen } from "@/lib/useMarkSectionSeen"

type PendingMemberRecord = {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  birthdate?: string
  gender?: string | null
  email?: string | null
  email_verified?: boolean
  email_verified_at?: string | null
  phone?: string | null
  guardian_name?: string | null
  is_trial?: boolean
  is_approved?: boolean
  base_group?: string | null
  office_list_status?: string | null
  office_list_group?: string | null
  office_list_checked_at?: string | null
  last_verification_sent_at?: string | null
  created_from_excel?: boolean | null
}

type PendingTrainerRecord = {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  email_verified?: boolean | null
  email_verified_at?: string | null
  is_approved?: boolean | null
  role?: string | null
  phone?: string | null
  trainer_license?: string | null
  has_password?: boolean
  created_at?: string | null
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
}

type PendingEditDraft = {
  firstName: string
  lastName: string
  birthdate: string
  gender: string
  baseGroup: string
  email: string
  phone: string
  guardianName: string
  memberPin: string
}

type OfficeRunRow = {
  memberId: string | null
  status: "green" | "yellow" | "red" | "gray"
  note: string
  source: string
  groupExcel: string
}

type OfficeRunMemberInfo = {
  status: "green" | "yellow" | "red" | "gray"
  note: string
  source: string
  groupExcel: string
}

function getOfficeRunPriority(status: OfficeRunMemberInfo["status"]) {
  switch (status) {
    case "yellow":
      return 3
    case "red":
      return 2
    case "gray":
      return 1
    case "green":
      return 0
  }
}

const groupOptions = [...TRAINING_GROUPS]

function getMemberDisplayName(member?: Partial<PendingMemberRecord> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
}

function formatBirthdateLabel(value?: string) {
  return formatDateInputForDisplay(value) || value?.trim() || "—"
}

function formatVerificationSentAt(value: string | null | undefined): string {
  if (!value) return "noch nie gesendet"
  const sent = new Date(value)
  const diffMs = Date.now() - sent.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "gerade eben gesendet"
  if (diffMin < 60) return `vor ${diffMin} Minute${diffMin === 1 ? "" : "n"} gesendet`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `vor ${diffH} Stunde${diffH === 1 ? "" : "n"} gesendet`
  return `Zuletzt gesendet: ${formatDisplayDateTime(sent)}`
}

function getOfficeDifferenceParts(note?: string | null) {
  if (!note || note === "Excel und DB stimmen überein") return []

  return note
    .split(" · ")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export default function FreigabenPage() {
  useMarkSectionSeen("approvals")
  const router = useRouter()
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [pendingMembers, setPendingMembers] = useState<PendingMemberRecord[]>([])
  const [pendingTrainers, setPendingTrainers] = useState<PendingTrainerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [usedByMember, setUsedByMember] = useState<Record<string, number>>({})
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({})
  const [pinDrafts, setPinDrafts] = useState<Record<string, string>>({})
  const [verificationSentAtByMember, setVerificationSentAtByMember] = useState<Record<string, string | null>>({})
  const [approvingTrainer, setApprovingTrainer] = useState<Record<string, boolean>>({})
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null)
  const [deletingTrainerId, setDeletingTrainerId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [emailFilter, setEmailFilter] = useState("alle")
  const [toast, setToast] = useState<ToastState | null>(null)
  const [gsConfirmedAtByMemberId, setGsConfirmedAtByMemberId] = useState<Record<string, string>>({})
  const [gsRejectedAtByMemberId, setGsRejectedAtByMemberId] = useState<Record<string, string>>({})
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<PendingEditDraft | null>(null)
  const [savingEditMemberId, setSavingEditMemberId] = useState<string | null>(null)
  const [officeRunInfoByMember, setOfficeRunInfoByMember] = useState<Record<string, OfficeRunMemberInfo>>({})

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
        pendingTrainers?: PendingTrainerRecord[]
        checkinRows: CheckinCountRow[]
        gsConfirmedAtByMemberId?: Record<string, string>
        gsRejectedAtByMemberId?: Record<string, string>
      }

      const nextPending = payload.pendingMembers ?? []
      setPendingMembers(nextPending)
      setPendingTrainers(payload.pendingTrainers ?? [])
      setGsConfirmedAtByMemberId(payload.gsConfirmedAtByMemberId ?? {})
      setGsRejectedAtByMemberId(payload.gsRejectedAtByMemberId ?? {})

      const nextSentAt: Record<string, string | null> = {}
      for (const m of nextPending) {
        if (m.last_verification_sent_at !== undefined) {
          nextSentAt[m.id] = m.last_verification_sent_at ?? null
        }
      }
      setVerificationSentAtByMember(nextSentAt)

      const counts: Record<string, number> = {}
      for (const row of (payload.checkinRows ?? [])) {
        counts[row.member_id] = (counts[row.member_id] ?? 0) + 1
      }
      setUsedByMember(counts)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") return

    let cancelled = false

    void (async () => {
      try {
        const response = await fetch("/api/admin/excel-abgleich", { method: "GET", cache: "no-store" })

        if (response.status === 204) {
          if (!cancelled) setOfficeRunInfoByMember({})
          return
        }

        if (!response.ok) {
          return
        }

        const payload = (await response.json()) as { rows?: OfficeRunRow[] }
        const nextMap: Record<string, OfficeRunMemberInfo> = {}

        for (const row of Array.isArray(payload.rows) ? payload.rows : []) {
          if (!row.memberId) continue
          const nextInfo = {
            status: row.status,
            note: row.note,
            source: row.source,
            groupExcel: row.groupExcel,
          }
          const currentInfo = nextMap[row.memberId]

          if (!currentInfo || getOfficeRunPriority(nextInfo.status) > getOfficeRunPriority(currentInfo.status)) {
            nextMap[row.memberId] = nextInfo
          }
        }

        if (!cancelled) {
          setOfficeRunInfoByMember(nextMap)
        }
      } catch {
        if (!cancelled) {
          setOfficeRunInfoByMember({})
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authResolved, trainerRole])

  function openMemberCommunication(member: PendingMemberRecord) {
    if (!member.email?.trim()) {
      showToast("Keine Mitglieds-E-Mail vorhanden.", "error")
      return
    }

    const topicIds: Array<"email_confirmation" | "data_review" | "gs_correction" | "missing_details" | "general_followup"> = []
    if (!member.email_verified) topicIds.push("email_confirmation")
    if (!member.first_name || !member.last_name || !member.birthdate || !member.email) topicIds.push("missing_details")
    topicIds.push("data_review")

    router.push(
      buildAdminMailComposeHref({
        title: "Nachricht an Mitglied vorbereiten",
        returnTo: "/verwaltung/freigaben",
        requests: [
          {
            kind: "approval_followup",
            memberId: member.id,
            email: member.email,
            name: getMemberDisplayName(member),
            targetKind: member.base_group === "Boxzwerge" ? "boxzwerge" : "member",
            topicIds,
          },
        ],
      })
    )
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

  function getTrainerDisplayName(trainer: PendingTrainerRecord) {
    const full = `${trainer.first_name ?? ""} ${trainer.last_name ?? ""}`.trim()
    return full || trainer.email || "—"
  }

  function openTrainerCommunication(trainer: PendingTrainerRecord) {
    if (!trainer.email?.trim()) {
      showToast("Keine Trainer-E-Mail vorhanden.", "error")
      return
    }

    const topicIds: Array<"email_confirmation" | "data_review" | "gs_correction" | "missing_details" | "general_followup"> = []
    if (!trainer.email_verified) topicIds.push("email_confirmation")
    if (!trainer.first_name || !trainer.last_name || !trainer.phone) topicIds.push("missing_details")
    topicIds.push("data_review")

    router.push(
      buildAdminMailComposeHref({
        title: "Nachricht an Trainer vorbereiten",
        returnTo: "/verwaltung/freigaben",
        requests: [
          {
            kind: "approval_followup",
            email: trainer.email,
            name: getTrainerDisplayName(trainer),
            targetKind: "trainer",
            topicIds,
          },
        ],
      })
    )
  }

  async function deletePendingTrainer(trainer: PendingTrainerRecord) {
    const name = getTrainerDisplayName(trainer)
    const confirmed = window.confirm(
      `Offenen Trainerzugang löschen?\n\nName: ${name}\nE-Mail: ${trainer.email ?? "—"}\n\nEs wird nur dieser noch nicht freigegebene Zugang entfernt.\nFreigegebene Trainer und Admin-Konten sind nicht betroffen.`
    )
    if (!confirmed) return
    setDeletingTrainerId(trainer.id)
    try {
      const response = await fetch(`/api/admin/trainer-account/${trainer.id}`, { method: "DELETE" })
      if (!response.ok) {
        const text = await response.text()
        let msg = text
        try { msg = (JSON.parse(text) as { details?: string; error?: string }).details ?? (JSON.parse(text) as { error?: string }).error ?? text } catch { /* plain text */ }
        showToast(`Fehler: ${msg}`, "error")
        return
      }
      await loadPending()
      showToast(`Trainerzugang "${name}" wurde gelöscht.`, "success")
    } catch (error) {
      console.error(error)
      showToast("Fehler beim Löschen des Trainerzugangs.", "error")
    } finally {
      setDeletingTrainerId(null)
    }
  }

  async function approveTrainer(trainer: PendingTrainerRecord) {
    if (!trainer.email_verified) {
      showToast("E-Mail noch nicht bestätigt. Freigabe erst nach E-Mail-Bestätigung möglich.", "error")
      return
    }
    setApprovingTrainer((prev) => ({ ...prev, [trainer.id]: true }))
    try {
      const response = await fetch("/api/admin/person-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_trainer", trainerId: trainer.id }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      await loadPending()
      router.push(
        buildAdminMailComposeHref({
          title: "Trainer-Freigabemail bearbeiten",
          returnTo: "/verwaltung/freigaben",
          requests: [
            {
              kind: "approval_notice",
              email: trainer.email ?? "",
              name: getTrainerDisplayName(trainer),
              targetKind: "trainer",
            },
          ],
        })
      )
    } catch (error) {
      console.error(error)
      showToast(error instanceof Error ? error.message : "Fehler bei der Trainerfreigabe.", "error")
    } finally {
      setApprovingTrainer((prev) => ({ ...prev, [trainer.id]: false }))
    }
  }

  function openPendingEditor(member: PendingMemberRecord) {
    setExpandedMemberId(member.id)
    setEditingMemberId(member.id)
    setEditDraft({
      firstName: member.first_name ?? "",
      lastName: member.last_name ?? "",
      birthdate: member.birthdate ?? "",
      gender: member.gender ?? "",
      baseGroup: normalizeTrainingGroupOrFallback(member.base_group, getRecommendedTrainingGroup(member.birthdate)),
      email: member.email ?? "",
      phone: member.phone ?? "",
      guardianName: member.guardian_name ?? "",
      memberPin: pinDrafts[member.id] ?? "",
    })
  }

  function closePendingEditor() {
    setEditingMemberId(null)
    setEditDraft(null)
  }

  function togglePendingCard(memberId: string) {
    setExpandedMemberId((current) => (current === memberId ? null : memberId))

    if (editingMemberId === memberId) {
      closePendingEditor()
    }
  }

  async function savePendingEditor(member: PendingMemberRecord) {
    if (!editDraft) {
      return
    }

    const firstName = editDraft.firstName.trim()
    const lastName = editDraft.lastName.trim()
    const birthdate = editDraft.birthdate.trim()
    const gender = editDraft.gender.trim()
    const baseGroup = editDraft.baseGroup.trim()
    const memberPin = editDraft.memberPin.trim()

    if (!firstName || !lastName || !birthdate) {
      alert("Vorname, Nachname und Geburtsdatum sind erforderlich.")
      return
    }

    if (!gender) {
      alert("Geschlecht ist erforderlich.")
      return
    }

    if (!baseGroup) {
      alert("Stammgruppe ist erforderlich.")
      return
    }

    if (memberPin && !isValidMemberPassword(memberPin)) {
      alert(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE)
      return
    }

    try {
      setSavingEditMemberId(member.id)

      const response = await fetch("/api/admin/member-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_profile",
          memberId: member.id,
          firstName,
          lastName,
          birthdate,
          gender,
          baseGroup,
          email: editDraft.email.trim(),
          phone: editDraft.phone.trim(),
          guardianName: editDraft.guardianName.trim() || undefined,
          memberPin: memberPin || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const payload = (await response.json()) as { member: PendingMemberRecord }
      const updated = payload.member

      setPendingMembers((current) =>
        current.map((entry) =>
          entry.id === member.id
            ? {
                ...entry,
                name: updated.name,
                first_name: updated.first_name,
                last_name: updated.last_name,
                birthdate: updated.birthdate,
                gender: updated.gender,
                base_group: updated.base_group,
                email: updated.email,
                phone: updated.phone,
                guardian_name: updated.guardian_name,
              }
            : entry
        )
      )
      setGroupDrafts((current) => ({ ...current, [member.id]: updated.base_group || baseGroup }))
      setPinDrafts((current) => ({ ...current, [member.id]: memberPin }))
      showToast("Sportlerdaten aktualisiert", "success")
      closePendingEditor()
    } catch (error) {
      console.error(error)
      alert("Die Daten konnten nicht gespeichert werden.")
    } finally {
      setSavingEditMemberId(null)
    }
  }

  function sendGsRequest(member: PendingMemberRecord, options?: SendGsRequestOptions) {
    const firstName = member.first_name?.trim() ?? ""
    const lastName = member.last_name?.trim() ?? ""
    const birthdate = member.birthdate?.trim() ?? ""

    if (!firstName || !lastName || !birthdate) {
      showToast("Vorname, Nachname oder Geburtsdatum fehlen.", "error")
      return
    }

    router.push(
      buildAdminMailComposeHref({
        title: "GS-Anfrage bearbeiten",
        returnTo: "/verwaltung/freigaben",
        requests: [
          {
            kind: "gs_request",
            memberId: member.id,
            firstName,
            lastName,
            birthdate,
            recipientEmail: options?.recipientEmail,
            subject: options?.subject,
            athleteLabel: options?.athleteLabel,
          },
        ],
      })
    )
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
              const gsRejectedAt = gsRejectedAtByMemberId[member.id] ?? ""
              const isEditing = editingMemberId === member.id && editDraft
              const isExpanded = expandedMemberId === member.id || isEditing
              const officeRunInfo = officeRunInfoByMember[member.id] ?? null
              const officeDifferences = getOfficeDifferenceParts(officeRunInfo?.note)
              const selectedGroup =
                groupDrafts[member.id] ??
                normalizeTrainingGroupOrFallback(member.base_group, getRecommendedTrainingGroup(member.birthdate))

              return (
                <div key={member.id} className="rounded-3xl border border-zinc-200 bg-white p-5">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-4 text-left"
                    onClick={() => togglePendingCard(member.id)}
                  >
                    <div className="min-w-0 space-y-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-zinc-900">{getMemberDisplayName(member)}</div>
                        <Badge
                          variant="outline"
                          className={
                            member.email_verified
                              ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                              : "border-red-200 bg-red-100 text-red-700"
                          }
                        >
                          {member.email_verified ? "E-Mail bestätigt" : "E-Mail nicht bestätigt"}
                        </Badge>
                        {member.created_from_excel ? (
                          <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                            Aus Excel
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-600">
                        <span>Geburtsdatum: {formatBirthdateLabel(member.birthdate)}</span>
                        <span>Stammgruppe: {member.base_group || "—"}</span>
                        <span>E-Mail: {member.email || "—"}</span>
                      </div>
                      {member.email_verified_at && (
                        <div className="text-xs text-zinc-500">
                          Bestätigt am: {formatDisplayDateTime(new Date(member.email_verified_at))}
                        </div>
                      )}
                      <div className="text-xs text-blue-700">
                        Bereits genutzt: {used} / 6 · Verbleibend: <span className="font-semibold">{remaining}</span>
                      </div>
                      {gsConfirmedAt ? (
                        <div className="text-xs font-medium text-emerald-700">
                          TSV-Mitgliedschaft bestätigt am {formatDisplayDateTime(new Date(gsConfirmedAt))}
                        </div>
                      ) : null}
                      {gsRejectedAt ? (
                        <div className="text-xs font-medium text-red-700">
                          TSV-Mitgliedschaft verneint am {formatDisplayDateTime(new Date(gsRejectedAt))}
                        </div>
                      ) : null}
                    </div>

                    <div className="shrink-0 rounded-full border border-zinc-200 p-2 text-zinc-500">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="mt-5 grid gap-5 border-t border-zinc-200 pt-5 xl:grid-cols-[1.5fr_1fr_1fr_auto] xl:items-end">
                    <div className="space-y-2 text-sm">
                      <div className="text-zinc-600">Telefon: {member.phone || "—"}</div>
                      {member.base_group === "Boxzwerge" ? (
                        <div className="text-zinc-600">Eltern / Notfallkontakt: {member.guardian_name || "—"}</div>
                      ) : null}
                      <div className="text-zinc-600">Geschlecht: {member.gender || "—"}</div>
                      {member.office_list_checked_at ? (
                        <div className="text-xs text-zinc-500">
                          GS-Abgleich: {formatDisplayDateTime(new Date(member.office_list_checked_at))}
                          {member.office_list_group ? ` · ${member.office_list_group}` : ""}
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
                      <Label>Neues Passwort</Label>
                      <PasswordInput
                        value={pinDrafts[member.id] ?? ""}
                        onChange={(event) =>
                          setPinDrafts((prev) => ({ ...prev, [member.id]: event.target.value }))
                        }
                        placeholder="optional, 8 bis 64 Zeichen"
                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                      />
                      <div className="text-xs text-zinc-500">{MEMBER_PASSWORD_HINT}</div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl border-[#c8d8ea] text-[#154c83]"
                        onClick={() => (isEditing ? closePendingEditor() : openPendingEditor(member))}
                        disabled={savingEditMemberId === member.id || deletingMemberId === member.id}
                      >
                        {isEditing ? "Änderung schließen" : "Daten ändern"}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl border-[#c8d8ea] text-[#154c83]"
                        onClick={() => openMemberCommunication(member)}
                        disabled={!member.email?.trim() || deletingMemberId === member.id}
                      >
                        Bestätigungs-Mail / Nachricht
                      </Button>

                      {!member.email_verified && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          Freigabe erst nach E-Mail-Bestätigung möglich
                        </div>
                      )}

                      <Button
                        className={
                          gsConfirmedAt
                            ? "rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                            : gsRejectedAt
                              ? "rounded-2xl bg-red-600 text-white hover:bg-red-700"
                              : "rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                        }
                        disabled={!member.email_verified || deletingMemberId === member.id}
                        onClick={async () => {
                          if (!member.email_verified) {
                            alert("E-Mail noch nicht bestätigt.")
                            return
                          }

                          const newPin = (pinDrafts[member.id] ?? "").trim()
                          if (newPin && !isValidMemberPassword(newPin)) {
                            alert(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE)
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
                            const payload = (await response.json()) as {
                              ok: true
                              member?: {
                                email?: string | null
                                first_name?: string | null
                                last_name?: string | null
                                name?: string | null
                              }
                            }

                            const memberEmail = (payload.member?.email || member.email || "").trim()
                            const memberName =
                              `${payload.member?.first_name ?? member.first_name ?? ""} ${payload.member?.last_name ?? member.last_name ?? ""}`.trim() ||
                              payload.member?.name ||
                              member.name ||
                              getMemberDisplayName(member)

                            const mailRequests = []

                            if (newPin && memberEmail) {
                              mailRequests.push({
                                kind: "access_code_changed" as const,
                                email: memberEmail,
                                name: memberName,
                                targetKind: "member" as const,
                              })
                            }

                            if (memberEmail) {
                              mailRequests.push({
                                kind: "approval_notice" as const,
                                email: memberEmail,
                                name: memberName,
                                targetKind: "member" as const,
                                group: selectedGroup,
                              })
                            }

                            await loadPending()

                            if (memberEmail) {
                              const outboxResponse = await fetch("/api/admin/manual-mail-outbox", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  request: {
                                    kind: "approval_notice",
                                    email: memberEmail,
                                    name: memberName,
                                    targetKind: "member",
                                    group: selectedGroup,
                                  },
                                }),
                              })

                              if (!outboxResponse.ok) {
                                throw new Error((await outboxResponse.text()) || "Freigabe-Mail konnte nicht in den Postausgang gelegt werden.")
                              }
                            }

                            if (mailRequests.length > 0) {
                              router.push(
                                buildAdminMailComposeHref({
                                  title: "Passwort-Mail bearbeiten",
                                  returnTo: "/verwaltung/freigaben",
                                  requests: mailRequests,
                                })
                              )
                              return
                            }

                            alert(memberEmail ? "Mitglied freigegeben. Die Freigabe-Mail liegt jetzt im Postausgang." : "Mitglied freigegeben.")
                          } catch (error) {
                            console.error(error)
                            alert("Fehler bei der Freigabe.")
                          }
                        }}
                      >
                        {gsConfirmedAt ? "Freigeben (GS bestätigt)" : gsRejectedAt ? "Freigeben (GS verneint)" : "Freigeben"}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                        onClick={() => void deletePendingMember(member)}
                        disabled={deletingMemberId === member.id}
                      >
                        {deletingMemberId === member.id ? "Löscht..." : "Löschen"}
                      </Button>

                      {member.email?.trim() ? (
                        <div className="text-xs text-zinc-400">
                          {formatVerificationSentAt(verificationSentAtByMember[member.id] ?? member.last_verification_sent_at)}
                        </div>
                      ) : null}

                      {officeRunInfo && officeRunInfo.status !== "green" ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl border-[#c8d8ea] text-[#154c83]"
                          onClick={() => void sendGsRequest(member)}
                          disabled={deletingMemberId === member.id}
                        >
                          Anfrage an GS senden
                        </Button>
                      ) : null}
                    </div>
                    </div>
                  ) : null}

                  {isEditing ? (
                    <form
                      className="mt-5 grid gap-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-2 xl:grid-cols-3"
                      onSubmit={async (event) => {
                        event.preventDefault()
                        await savePendingEditor(member)
                      }}
                    >
                      {officeRunInfo && officeDifferences.length > 0 ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 md:col-span-2 xl:col-span-3">
                          <div className="font-semibold">GS-Abweichungen</div>
                          <div className="mt-2 space-y-1">
                            {officeDifferences.map((entry) => (
                              <div key={entry}>• {entry}</div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        <Label>Vorname</Label>
                        <Input
                          value={editDraft.firstName}
                          onChange={(event) => setEditDraft((current) => (current ? { ...current, firstName: event.target.value } : current))}
                          className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Nachname</Label>
                        <Input
                          value={editDraft.lastName}
                          onChange={(event) => setEditDraft((current) => (current ? { ...current, lastName: event.target.value } : current))}
                          className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Geburtsdatum</Label>
                        <Input
                          type="date"
                          value={editDraft.birthdate}
                          onChange={(event) => setEditDraft((current) => (current ? { ...current, birthdate: event.target.value } : current))}
                          className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Geschlecht</Label>
                        <Select
                          value={editDraft.gender}
                          onValueChange={(value) => setEditDraft((current) => (current ? { ...current, gender: value } : current))}
                        >
                          <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                            <SelectValue placeholder="Bitte auswählen" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="männlich">männlich</SelectItem>
                            <SelectItem value="weiblich">weiblich</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Stammgruppe</Label>
                        <Select
                          value={editDraft.baseGroup}
                          onValueChange={(value) => setEditDraft((current) => (current ? { ...current, baseGroup: value } : current))}
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
                        <Label>E-Mail</Label>
                        <Input
                          type="email"
                          value={editDraft.email}
                          onChange={(event) => setEditDraft((current) => (current ? { ...current, email: event.target.value } : current))}
                          className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Passwort</Label>
                        <PasswordInput
                          value={editDraft.memberPin}
                          onChange={(event) => setEditDraft((current) => (current ? { ...current, memberPin: event.target.value } : current))}
                          placeholder="optional, 8 bis 64 Zeichen"
                          className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                        />
                        <div className="text-xs text-zinc-500">{MEMBER_PASSWORD_HINT}</div>
                      </div>

                      <div className="space-y-2">
                        <Label>Telefon</Label>
                        <Input
                          value={editDraft.phone}
                          onChange={(event) => setEditDraft((current) => (current ? { ...current, phone: event.target.value } : current))}
                          className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                        />
                      </div>

                      {member.base_group === "Boxzwerge" ? (
                        <div className="space-y-2">
                          <Label>Eltern / Notfallkontakt</Label>
                          <Input
                            value={editDraft.guardianName}
                            onChange={(event) => setEditDraft((current) => (current ? { ...current, guardianName: event.target.value } : current))}
                            className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                          />
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
                        <Button
                          type="submit"
                          className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                          disabled={savingEditMemberId === member.id}
                        >
                          {savingEditMemberId === member.id ? "Speichert..." : "Korrekturen speichern"}
                        </Button>
                        <Button type="button" variant="outline" className="rounded-2xl" onClick={closePendingEditor} disabled={savingEditMemberId === member.id}>
                          Abbrechen
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Offene Trainer-Freigaben</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Trainer werden geladen...</div>
          ) : pendingTrainers.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine offenen Trainer-Freigaben.</div>
          ) : (
            pendingTrainers.map((trainer) => (
              <div key={trainer.id} className="rounded-3xl border border-zinc-200 bg-white p-5">
                <div className="grid gap-4 xl:grid-cols-[1.4fr_auto] xl:items-start">
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold text-zinc-900">{getTrainerDisplayName(trainer)}</div>
                      <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                        Trainer
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          trainer.email_verified
                            ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                            : "border-red-200 bg-red-100 text-red-700"
                        }
                      >
                        {trainer.email_verified ? "E-Mail bestätigt" : "E-Mail nicht bestätigt"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-600">
                      <span>E-Mail: {trainer.email || "—"}</span>
                      {trainer.phone ? <span>Telefon: {trainer.phone}</span> : null}
                      {trainer.trainer_license ? <span>Lizenz: {trainer.trainer_license}</span> : null}
                    </div>
                    {trainer.email_verified_at ? (
                      <div className="text-xs text-zinc-500">
                        Bestätigt am: {formatDisplayDateTime(new Date(trainer.email_verified_at))}
                      </div>
                    ) : null}
                    {trainer.created_at ? (
                      <div className="text-xs text-zinc-500">
                        Registriert am: {formatDisplayDateTime(new Date(trainer.created_at))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2">
                    {!trainer.email_verified && (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        Freigabe erst nach E-Mail-Bestätigung möglich
                      </div>
                    )}

                    <Button asChild variant="outline" className="rounded-2xl border-[#c8d8ea] text-[#154c83]">
                      <Link href={`/verwaltung/trainer/${trainer.id}/bearbeiten`}>Daten ändern</Link>
                    </Button>

                    <Button
                      variant="outline"
                      className="rounded-2xl border-[#c8d8ea] text-[#154c83]"
                      onClick={() => openTrainerCommunication(trainer)}
                      disabled={!trainer.email?.trim()}
                    >
                      Bestätigungs-Mail / Nachricht
                    </Button>

                    <Button
                      className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                      disabled={!trainer.email_verified || Boolean(approvingTrainer[trainer.id])}
                      onClick={() => void approveTrainer(trainer)}
                    >
                      {approvingTrainer[trainer.id] ? "Wird freigegeben…" : "Freigeben"}
                    </Button>

                    <Button
                      variant="outline"
                      className="rounded-2xl border-red-200 text-red-700 hover:bg-red-50"
                      disabled={deletingTrainerId === trainer.id}
                      onClick={() => void deletePendingTrainer(trainer)}
                    >
                      {deletingTrainerId === trainer.id ? "Wird gelöscht…" : "Löschen"}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
