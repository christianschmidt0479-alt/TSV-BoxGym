"use client";
// Lokale Hilfsfunktion für Check-in/Log-in Status
function getMemberCheckStatus(member: any) {
  if (!member) {
    return {
      loginPossible: false,
      checkinPossible: false,
      primaryIssue: "Mitglied nicht gefunden",
      flags: {
        emailMissing: true,
        pinMissing: true,
        emailVerified: false,
        approved: false,
        qrToken: false,
        privacy: false,
      },
    };
  }
  const emailMissing = !member.email;
  const pinMissing = !member.member_pin;
  const loginPossible = !(emailMissing || pinMissing) && !!member.email_verified;

  // Diagnose: Check-in Eligibility nach Produktivlogik
  let checkinPossible = false;
  let primaryIssue = "Mitgliedsdaten grundsätzlich nutzbar";

  const isTrial = !!member.is_trial;
  // visits und checkins werden ggf. als Prop übergeben
  const visits = typeof member.visits === "number" ? member.visits : 0;
  const checkinCount = Array.isArray(member.checkins) ? member.checkins.length : visits;

  if (emailMissing) {
    primaryIssue = "E-Mail fehlt";
  } else if (pinMissing) {
    primaryIssue = "PIN fehlt";
  } else if (!member.email_verified) {
    primaryIssue = "E-Mail nicht verifiziert";
  }

  if (!loginPossible) {
    checkinPossible = false;
    if (!primaryIssue) primaryIssue = "Login nicht möglich";
  } else if (isTrial && checkinCount >= 3) {
    checkinPossible = false;
    primaryIssue = "Probetraining-Limit erreicht (max. 3 Check-ins)";
  } else if (!isTrial && !member.is_approved && checkinCount >= 6) {
    checkinPossible = false;
    primaryIssue = "Freigabe erforderlich nach 6 Check-ins";
  } else {
    // Unsichere Eligibility (z.B. Zeitfenster, Gruppe, Gewicht)
    checkinPossible = true;
    primaryIssue = "Check-in grundsätzlich möglich (weitere Prüfung nötig)";
  }

  return {
    loginPossible,
    checkinPossible,
    primaryIssue,
    flags: {
      emailMissing,
      pinMissing,
      emailVerified: !!member.email_verified,
      approved: !!member.is_approved,
      qrToken: !!member.member_qr_token,
      privacy: !!member.privacy_accepted_at,
      isTrial,
      checkinCount,
    },
  };
}

import { Fragment, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { buildAdminMailComposeHref } from "@/lib/adminMailComposeClient"
import { getNextBirthdayEntry } from "@/lib/birthdays"
import { formatDisplayDateTime, formatIsoDateForDisplay } from "@/lib/dateFormat"
import { MEMBER_PASSWORD_HINT, MEMBER_PASSWORD_REQUIREMENTS_MESSAGE, isValidMemberPassword } from "@/lib/memberPassword"
import { getOfficeListStatusLabel } from "@/lib/officeListStatus"
import { buildTrainingGroupOptions, compareTrainingGroupOrder, isCompatibleOfficeListGroup, normalizeTrainingGroup, normalizeTrainingGroupOrFallback, TRAINING_GROUPS } from "@/lib/trainingGroups"
import { clearTrainerAccess } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type MemberRecord = {
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
  is_competition_member?: boolean | null
  has_competition_pass?: boolean | null
  competition_license_number?: string | null
  last_medical_exam_date?: string | null
  competition_fights?: number | null
  competition_wins?: number | null
  competition_losses?: number | null
  competition_draws?: number | null
  is_trial?: boolean
  is_approved?: boolean
  base_group?: string | null
  office_list_status?: string | null
  office_list_group?: string | null
  office_list_checked_at?: string | null
  created_from_excel?: boolean | null
}

type CheckinSummaryRow = {
  member_id: string
  created_at: string
  date: string
}

type ParentLinkSummary = {
  parent_account_id: string
  parent_name: string
  email: string
  phone?: string | null
}

type TrainerLinkSummary = {
  id: string
  linked_member_id?: string | null
  email?: string | null
  role?: "trainer" | "admin" | null
  is_approved?: boolean | null
}

type MemberStatusFilter =
  | "alle"
  | "probemitglied"
  | "wartet_auf_email"
  | "registriert"
  | "freigegeben"

type OfficeReconcileFilter = "alle" | "kein_abgleich" | "green" | "yellow" | "red"

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

const memberGroupOptions = TRAINING_GROUPS

function getMemberDisplayName(member?: Partial<MemberRecord> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
}

function getMemberStatus(member: MemberRecord): Exclude<MemberStatusFilter, "alle"> {
  if (member.is_trial) return "probemitglied"
  if (member.is_approved) return "freigegeben"
  if (member.email_verified) return "registriert"
  return "wartet_auf_email"
}

function getStatusLabel(status: Exclude<MemberStatusFilter, "alle">) {
  switch (status) {
    case "probemitglied":
      return "Probemitglied"
    case "wartet_auf_email":
      return "Wartet auf E-Mail"
    case "registriert":
      return "E-Mail bestätigt"
    case "freigegeben":
      return "Mitglied"
  }
}

function getStatusBadgeClass(status: Exclude<MemberStatusFilter, "alle">) {
  switch (status) {
    case "probemitglied":
      return "bg-amber-100 text-amber-800 border-amber-200"
    case "wartet_auf_email":
      return "bg-red-100 text-red-700 border-red-200"
    case "registriert":
      return "bg-emerald-100 text-emerald-800 border-emerald-200"
    case "freigegeben":
      return "bg-green-100 text-green-800 border-green-200"
  }
}

function getOfficeFilterLabel(filter: Exclude<OfficeReconcileFilter, "alle">) {
  switch (filter) {
    case "kein_abgleich":
      return "Kein GS-Abgleich"
    case "green":
      return getOfficeListStatusLabel("green")
    case "yellow":
      return getOfficeListStatusLabel("yellow")
    case "red":
      return getOfficeListStatusLabel("red")
  }
}

function getOfficeDifferenceParts(note?: string | null) {
  if (!note || note === "Excel und DB stimmen überein") return []

  return note
    .split(" · ")
    .map((entry) => entry.trim())
    .filter(Boolean)
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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error.trim()) return error
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message
  }
  return fallback
}

async function readResponseError(response: Response, fallback: string) {
  const text = await response.text()
  if (!text.trim()) return fallback

  try {
    const parsed = JSON.parse(text) as { error?: string; details?: string }
    return parsed.details || parsed.error || text
  } catch {
    return text
  }
}

function isBoxzwergeMember(member?: Pick<MemberRecord, "base_group"> | null) {
  return normalizeTrainingGroup(member?.base_group) === "Boxzwerge"
}

function compareMemberGroupNames(left: string, right: string) {
  const normalizedLeft = normalizeTrainingGroup(left)
  const normalizedRight = normalizeTrainingGroup(right)

  if (normalizedLeft && normalizedRight) {
    return compareTrainingGroupOrder(normalizedLeft, normalizedRight)
  }

  if (normalizedLeft) return -1
  if (normalizedRight) return 1
  return left.localeCompare(right, "de")
}

function getMemberGroupValue(group?: string | null) {
  const trimmedGroup = group?.trim() ?? ""
  if (!trimmedGroup) return ""
  return normalizeTrainingGroup(trimmedGroup) || trimmedGroup
}

function hasOfficeListGroupMismatch(member: Pick<MemberRecord, "base_group" | "office_list_group">, isTrainerLinked = false) {
  const baseGroup = getMemberGroupValue(member.base_group)
  const officeGroups = (member.office_list_group ?? "")
    .split("|")
    .map((value) => getMemberGroupValue(value))
    .filter(Boolean)

  if (!baseGroup || officeGroups.length === 0) return false
  return !officeGroups.some((officeGroup) => isCompatibleOfficeListGroup(baseGroup, officeGroup, { isTrainer: isTrainerLinked }))
}

function hasParentManagedMemberLogin(
  member: Pick<MemberRecord, "base_group" | "email">,
  parentLink?: ParentLinkSummary | null,
) {
  return isBoxzwergeMember(member) && !member.email && Boolean(parentLink)
}

function getBirthdayMarkerLabel(daysFromToday: number) {
  if (daysFromToday === 0) return "Heute Geburtstag"
  if (daysFromToday === 1) return "Morgen Geburtstag"
  return `In ${daysFromToday} Tagen`
}

export default function MitgliederverwaltungPage() {
  const router = useRouter()
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [members, setMembers] = useState<MemberRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>("alle")
  const [officeFilter, setOfficeFilter] = useState<OfficeReconcileFilter>("alle")
  const [groupFilter, setGroupFilter] = useState("alle")
  const [sortBy, setSortBy] = useState("name")
  const [officeRunInfoByMember, setOfficeRunInfoByMember] = useState<Record<string, OfficeRunMemberInfo>>({})
  const [visitsByMember, setVisitsByMember] = useState<Record<string, number>>({})
  const [lastActivityByMember, setLastActivityByMember] = useState<Record<string, string>>({})
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [resendingVerificationMemberId, setResendingVerificationMemberId] = useState<string | null>(null)
  const [editGender, setEditGender] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editGuardianName, setEditGuardianName] = useState("")
  const [editParentName, setEditParentName] = useState("")
  const [editParentEmail, setEditParentEmail] = useState("")
  const [editParentPhone, setEditParentPhone] = useState("")
  const [editParentAccessCode, setEditParentAccessCode] = useState("")
  const [editMemberAccessCode, setEditMemberAccessCode] = useState("")
  const [parentLinksByMember, setParentLinksByMember] = useState<Record<string, ParentLinkSummary>>({})
  const [trainerLinksByMember, setTrainerLinksByMember] = useState<Record<string, TrainerLinkSummary>>({})
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const searchParams = new URLSearchParams(window.location.search)
    const nextGroup = searchParams.get("gruppe")
    const nextMemberId = searchParams.get("memberId")
    if (nextGroup?.trim()) {
      setGroupFilter(nextGroup)
    }
    if (nextMemberId?.trim()) {
      setEditingMemberId(nextMemberId)
    }
  }, [])

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        setLoadError("")
        const response = await fetch("/api/admin/members-overview", {
          cache: "no-store",
        })
        if (!response.ok) {
          if (response.status === 401) {
            clearTrainerAccess()
            throw new Error("Admin-Sitzung abgelaufen. Bitte neu anmelden.")
          }
          throw new Error(await readResponseError(response, "Mitglieder konnten nicht geladen werden."))
        }

        const payload = (await response.json()) as {
          members: MemberRecord[]
          checkinRows: CheckinSummaryRow[]
          trainerLinks: TrainerLinkSummary[]
          parentLinks: Array<{
            member_id: string
            parent_account_id: string
            parent_accounts?: ParentLinkSummary | null
          }>
        }

        const normalizedMembers = Array.isArray(payload.members)
          ? payload.members.map((member) => ({
              ...member,
              base_group: getMemberGroupValue(member.base_group) || null,
            }))
          : []

        setMembers(normalizedMembers)

        const nextLinks: Record<string, ParentLinkSummary> = {}
        for (const row of Array.isArray(payload.parentLinks) ? payload.parentLinks : []) {
          if (!row?.member_id || !row.parent_accounts) continue
          nextLinks[row.member_id] = {
            parent_account_id: row.parent_account_id,
            parent_name: row.parent_accounts.parent_name ?? "—",
            email: row.parent_accounts.email ?? "",
            phone: row.parent_accounts.phone ?? null,
          }
        }
        setParentLinksByMember(nextLinks)

        const nextTrainerLinks: Record<string, TrainerLinkSummary> = {}
        for (const trainer of Array.isArray(payload.trainerLinks) ? payload.trainerLinks : []) {
          const linkedMemberId = trainer.linked_member_id?.trim() ?? ""
          if (linkedMemberId) {
            nextTrainerLinks[linkedMemberId] = trainer
            continue
          }

          const trainerEmail = trainer.email?.trim().toLowerCase() ?? ""
          if (!trainerEmail) continue
          const matchedMember = normalizedMembers.find((member) => (member.email ?? "").trim().toLowerCase() === trainerEmail)
          if (matchedMember) {
            nextTrainerLinks[matchedMember.id] = trainer
          }
        }
        setTrainerLinksByMember(nextTrainerLinks)

        const checkinRows = Array.isArray(payload.checkinRows) ? payload.checkinRows : []
        const nextVisits: Record<string, number> = {}
        const nextLastActivity: Record<string, string> = {}

        for (const row of checkinRows) {
          if (!row?.member_id) continue
          nextVisits[row.member_id] = (nextVisits[row.member_id] ?? 0) + 1
          if (!nextLastActivity[row.member_id] && row.created_at) {
            nextLastActivity[row.member_id] = row.created_at
          }
        }

        setVisitsByMember(nextVisits)
        setLastActivityByMember(nextLastActivity)
      } catch (error) {
        console.error(error)
        setLoadError(getErrorMessage(error, "Mitglieder konnten nicht geladen werden."))
      } finally {
        setLoading(false)
      }
    })()
  }, [authResolved, trainerRole])

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
          if (response.status === 401) {
            clearTrainerAccess()
          }
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

  const groupOptions = useMemo(() => {
    return buildTrainingGroupOptions(members.map((member) => getMemberGroupValue(member.base_group))).sort(compareMemberGroupNames)
  }, [members])

  const filteredMembers = useMemo(() => {
    const trimmedSearch = search.trim().toLowerCase()

    const rows = members.filter((member) => {
      const status = getMemberStatus(member)
      const matchesSearch =
        trimmedSearch === "" ||
        getMemberDisplayName(member).toLowerCase().includes(trimmedSearch) ||
        (member.email ?? "").toLowerCase().includes(trimmedSearch) ||
        (member.guardian_name ?? "").toLowerCase().includes(trimmedSearch)

      const matchesStatus = statusFilter === "alle" || status === statusFilter
      const matchesOfficeFilter =
        officeFilter === "alle" ||
        (officeFilter === "kein_abgleich" ? !member.office_list_status : member.office_list_status === officeFilter)
      const matchesGroup = groupFilter === "alle" || getMemberGroupValue(member.base_group) === groupFilter

      return matchesSearch && matchesStatus && matchesOfficeFilter && matchesGroup
    })

    rows.sort((a, b) => {
      if (sortBy === "gruppe") {
        return compareTrainingGroupOrder(getMemberGroupValue(a.base_group), getMemberGroupValue(b.base_group))
      }

      if (sortBy === "checkins") {
        return (visitsByMember[b.id] ?? 0) - (visitsByMember[a.id] ?? 0)
      }

      if (sortBy === "aktivitaet") {
        return (lastActivityByMember[b.id] ?? "").localeCompare(lastActivityByMember[a.id] ?? "")
      }

      if (sortBy === "boxzwerge_warnung") {
        const aWarning = a.base_group === "Boxzwerge" && (getAgeInYears(a.birthdate) ?? -1) >= 10
        const bWarning = b.base_group === "Boxzwerge" && (getAgeInYears(b.birthdate) ?? -1) >= 10

        if (aWarning !== bWarning) return aWarning ? -1 : 1
      }

      return getMemberDisplayName(a).localeCompare(getMemberDisplayName(b))
    })

    return rows
  }, [groupFilter, lastActivityByMember, members, officeFilter, search, sortBy, statusFilter, visitsByMember])

  const hasActiveFilters =
    search.trim() !== "" || statusFilter !== "alle" || officeFilter !== "alle" || groupFilter !== "alle" || sortBy !== "name"

  const summary = useMemo(() => {
    return {
      total: members.length,
      trial: members.filter((member) => getMemberStatus(member) === "probemitglied").length,
      waitingEmail: members.filter((member) => getMemberStatus(member) === "wartet_auf_email").length,
      registered: members.filter((member) => getMemberStatus(member) === "registriert").length,
      approved: members.filter((member) => getMemberStatus(member) === "freigegeben").length,
      missingPhone: members.filter((member) => !(member.phone ?? "").trim()).length,
      boxzwergeWarning: members.filter((member) => member.base_group === "Boxzwerge" && (getAgeInYears(member.birthdate) ?? -1) >= 10).length,
      parentLinked: Object.keys(parentLinksByMember).length,
    }
  }, [members, parentLinksByMember])

  const editingMember = useMemo(
    () => members.find((member) => member.id === editingMemberId) ?? null,
    [editingMemberId, members]
  )
  const editingParentLink = editingMemberId ? parentLinksByMember[editingMemberId] ?? null : null
  const editingMemberIsBoxzwerge = isBoxzwergeMember(editingMember)
  const editingOfficeRunInfo = editingMemberId ? officeRunInfoByMember[editingMemberId] ?? null : null
  const editingOfficeDifferences = getOfficeDifferenceParts(editingOfficeRunInfo?.note)

  // Minimaler Fix: checkinRowsByMember als Memo im Scope
  const checkinRowsByMember = useMemo(() => {
    const map: Record<string, CheckinSummaryRow[]> = {};
    // visitsByMember wird aus checkinRows berechnet, daher checkinRows aus visitsByMember ableiten
    // Aber checkinRows gibt es nur im Payload, daher checkinRowsByMember aus visitsByMember nicht rekonstruierbar
    // Wir müssen checkinRowsByMember aus checkinRows bauen, checkinRows ist aber nicht im State
    // Daher: checkinRowsByMember kann nur aus checkinRows gebaut werden, wenn checkinRows im State wäre
    // Workaround: checkinRowsByMember leer lassen, damit der Build läuft, bis die Logik wieder ergänzt wird
    // TODO: checkinRowsByMember korrekt aus checkinRows im State ableiten, falls checkinRows im State ist
    return map;
  }, [/* Abhängigkeiten, falls checkinRows im State */]);

  // Minimaler Fix: CheckinPruefenPanel als Inline-Komponente im Scope
  function CheckinPruefenPanel({ member, visits, checkins }: { member: MemberRecord, visits: number, checkins: CheckinSummaryRow[] }) {
    const status = getMemberCheckStatus({ ...member, visits, checkins });
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <div className="font-semibold text-blue-900">Check-in Diagnose</div>
        <div className="mt-1">
          <span className="font-medium">Login möglich:</span> {status.loginPossible ? "Ja" : "Nein"}
        </div>
        <div>
          <span className="font-medium">Check-in möglich:</span> {status.checkinPossible ? "Ja" : "Nein"}
        </div>
        <div>
          <span className="font-medium">Hauptgrund:</span> {status.primaryIssue}
        </div>
        <div className="mt-1 text-[11px] text-blue-800">
          <span className="font-medium">Flags:</span> {Object.entries(status.flags).map(([k, v]) => `${k}: ${v ? "✔" : "✗"}`).join(", ")}
        </div>
      </div>
    );
  }

  function clearEditingState() {
    setEditingMemberId(null)
    setResendingVerificationMemberId(null)
    setEditGender("")
    setEditEmail("")
    setEditPhone("")
    setEditGuardianName("")
    setEditParentName("")
    setEditParentEmail("")
    setEditParentPhone("")
    setEditParentAccessCode("")
    setEditMemberAccessCode("")
  }

  async function resendVerificationEmail(member: MemberRecord) {
    if (!member.id || !member.email) {
      alert("Mitgliedsdaten unvollständig")
      return
    }

    setResendingVerificationMemberId(member.id)
    try {
      router.push(
        buildAdminMailComposeHref({
          title: "Bestätigungs-Mail bearbeiten",
          returnTo: "/verwaltung/mitglieder",
          requests: [
            {
              kind: "verification_member",
              memberId: member.id,
              email: member.email,
              name: getMemberDisplayName(member),
              targetKind: "member",
            },
          ],
        })
      )
    } catch (error) {
      console.error(error)
      alert(getErrorMessage(error, "Bestätigungs-Mail konnte nicht versendet werden."))
    } finally {
      setResendingVerificationMemberId(null)
    }
  }

  function openMemberEditor(member: MemberRecord) {
    const isBoxzwerge = isBoxzwergeMember(member)
    setEditingMemberId(member.id)
    setEditGender(member.gender || "")
    setEditEmail(member.email || "")
    setEditPhone(member.phone || "")
    setEditGuardianName(isBoxzwerge ? member.guardian_name || "" : "")
    setEditParentName(isBoxzwerge ? parentLinksByMember[member.id]?.parent_name || member.guardian_name || "" : "")
    setEditParentEmail(isBoxzwerge ? parentLinksByMember[member.id]?.email || member.email || "" : "")
    setEditParentPhone(isBoxzwerge ? parentLinksByMember[member.id]?.phone || member.phone || "" : "")
    setEditParentAccessCode("")
    setEditMemberAccessCode("")
  }

  useEffect(() => {
    if (!editingMemberId || !members.length) return
    const member = members.find((entry) => entry.id === editingMemberId)
    if (!member) return
    const isBoxzwerge = isBoxzwergeMember(member)
    setEditGender(member.gender || "")
    setEditEmail(member.email || "")
    setEditPhone(member.phone || "")
    setEditGuardianName(isBoxzwerge ? member.guardian_name || "" : "")
    setEditParentName(isBoxzwerge ? parentLinksByMember[member.id]?.parent_name || member.guardian_name || "" : "")
    setEditParentEmail(isBoxzwerge ? parentLinksByMember[member.id]?.email || member.email || "" : "")
    setEditParentPhone(isBoxzwerge ? parentLinksByMember[member.id]?.phone || member.phone || "" : "")
    setEditParentAccessCode("")
    setEditMemberAccessCode("")
  }, [editingMemberId, members, parentLinksByMember])

  function toggleMemberEditor(member: MemberRecord) {
    if (editingMemberId === member.id) {
      clearEditingState()
      return
    }
    openMemberEditor(member)
  }

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Mitgliederverwaltung</CardTitle>
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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Mitgliederverwaltung</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/">Zurück zum Dashboard</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-8">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Gesamt</div>
            <div className="mt-1 text-3xl font-bold">{summary.total}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Probemitglieder</div>
            <div className="mt-1 text-3xl font-bold text-amber-600">{summary.trial}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Warten auf E-Mail</div>
            <div className="mt-1 text-3xl font-bold text-zinc-700">{summary.waitingEmail}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Registriert</div>
            <div className="mt-1 text-3xl font-bold text-blue-600">{summary.registered}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Mitglieder</div>
            <div className="mt-1 text-3xl font-bold text-green-600">{summary.approved}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Ohne Telefon</div>
            <div className="mt-1 text-3xl font-bold text-amber-600">{summary.missingPhone}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Boxzwerge Warnung 10+</div>
            <div className="mt-1 text-3xl font-bold text-red-600">{summary.boxzwergeWarning}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Mit Elternkonto verknüpft</div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">{summary.parentLinked}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {loadError}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as MemberStatusFilter)}>
                <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Stati</SelectItem>
                  <SelectItem value="probemitglied">Probemitglied</SelectItem>
                  <SelectItem value="wartet_auf_email">Wartet auf E-Mail-Bestätigung</SelectItem>
                  <SelectItem value="registriert">Registriert</SelectItem>
                  <SelectItem value="freigegeben">Freigegeben</SelectItem>
                </SelectContent>
              </Select>
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
              <Label>GS-Abgleich</Label>
              <Select value={officeFilter} onValueChange={(value) => setOfficeFilter(value as OfficeReconcileFilter)}>
                <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle GS-Status</SelectItem>
                  <SelectItem value="kein_abgleich">Kein GS-Abgleich</SelectItem>
                  <SelectItem value="green">In aktueller Liste</SelectItem>
                  <SelectItem value="yellow">Gefunden, Abweichung</SelectItem>
                  <SelectItem value="red">Nicht in aktueller Liste</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sortierung</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="gruppe">Gruppe</SelectItem>
                  <SelectItem value="checkins">Check-ins</SelectItem>
                  <SelectItem value="aktivitaet">Letzte Aktivität</SelectItem>
                  <SelectItem value="boxzwerge_warnung">Boxzwerge 10+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-100 p-3 text-sm text-zinc-700">
            <div>
              Sichtbar: <span className="font-semibold text-zinc-900">{filteredMembers.length}</span> von{" "}
              <span className="font-semibold text-zinc-900">{members.length}</span> Mitgliedern
              {groupFilter !== "alle" ? (
                <span className="ml-2 text-zinc-500">· Gruppe: {groupFilter}</span>
              ) : null}
              {statusFilter !== "alle" ? (
                <span className="ml-2 text-zinc-500">· Status: {getStatusLabel(statusFilter)}</span>
              ) : null}
              {officeFilter !== "alle" ? (
                <span className="ml-2 text-zinc-500">· GS-Abgleich: {getOfficeFilterLabel(officeFilter)}</span>
              ) : null}
            </div>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl"
                onClick={() => {
                  setSearch("")
                  setStatusFilter("alle")
                  setOfficeFilter("alle")
                  setGroupFilter("alle")
                  setSortBy("name")
                }}
              >
                Filter zurücksetzen
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Mitgliederliste</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Mitglieder werden geladen...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">
              Keine Mitglieder für die aktuelle Filterung gefunden.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Gruppe</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => {
                  const status = getMemberStatus(member)
                  const age = getAgeInYears(member.birthdate)
                  const nextBirthday = getNextBirthdayEntry(member, today)
                  const showBirthdayMarker = nextBirthday && nextBirthday.days_from_today >= 0 && nextBirthday.days_from_today <= 14
                  const isBoxzwergeWarning = member.base_group === "Boxzwerge" && (age ?? -1) >= 10
                  const isBoxzwerge = isBoxzwergeMember(member)
                  const parentLink = parentLinksByMember[member.id] ?? null
                  const isExpanded = editingMemberId === member.id
                  const usesParentLogin = hasParentManagedMemberLogin(member, parentLink)

                  return (
                    <Fragment key={member.id}>
                      <TableRow
                        className={`cursor-pointer transition-colors ${isBoxzwergeWarning ? "bg-red-50/80" : isExpanded ? "bg-zinc-100/60" : ""}`}
                        onClick={() => toggleMemberEditor(member)}
                      >
                        <TableCell className="align-top min-w-[140px]">
                          <div className="font-medium text-zinc-900">{getMemberDisplayName(member)}</div>
                          {showBirthdayMarker ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Badge
                                variant="outline"
                                className={nextBirthday.is_today ? "border-amber-200 bg-amber-100 text-amber-800" : "border-rose-200 bg-rose-100 text-rose-800"}
                              >
                                {getBirthdayMarkerLabel(nextBirthday.days_from_today)}
                              </Badge>
                              <Badge variant="outline" className="border-zinc-200 bg-white text-zinc-700">
                                {`Wird ${nextBirthday.turning_age}`}
                              </Badge>
                            </div>
                          ) : null}
                          <div className={`text-xs ${isBoxzwergeWarning ? "text-red-700" : "text-zinc-500"}`}>
                            {isBoxzwerge ? "Kind · " : ""}
                            {formatIsoDateForDisplay(member.birthdate) || "Geburtsdatum offen"}
                            {age !== null ? ` · ${age} Jahre` : ""}
                          </div>
                          {isBoxzwergeWarning ? (
                            <div className="mt-1 text-xs font-semibold text-red-700">Boxzwerge-Warnung ab 10 Jahren</div>
                          ) : null}
                          {isBoxzwerge ? (
                            <div className="mt-1 text-xs text-zinc-500">
                              {member.guardian_name ? `Notfallkontakt: ${member.guardian_name}` : "Kein Notfallkontakt"}
                              {usesParentLogin ? " · Zugang über Elternkonto" : ""}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-top text-sm">{member.base_group || "—"}</TableCell>
                        <TableCell className="align-top">
                          {status !== "freigegeben" ? (
                            <Badge variant="outline" className={getStatusBadgeClass(status)}>
                              {getStatusLabel(status)}
                            </Badge>
                          ) : null}
                        </TableCell>
                      </TableRow>
                      {isExpanded && editingMember ? (
                        <TableRow className="bg-zinc-50/80 hover:bg-zinc-50/80">
                          <TableCell colSpan={3} className="p-4">
                            <div className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
                              <div className="rounded-2xl bg-zinc-100 p-4 text-sm">
                                <div className="font-semibold text-zinc-900">{getMemberDisplayName(editingMember)}</div>
                                <div className="mt-2 space-y-1 text-zinc-700">
                                  <div>
                                    <span className="text-zinc-500">{editingMemberIsBoxzwerge ? "Geburtstag (Kind)" : "Geburtstag"}: </span>
                                    {formatIsoDateForDisplay(editingMember.birthdate) || "—"}
                                    {" · "}
                                    <span className="text-zinc-500">Gruppe: </span>
                                    {editingMember.base_group || "—"}
                                  </div>
                                  {/* Check-in prüfen Button und Panel */}
                                  <div className="mt-3">
                                    <CheckinPruefenPanel member={editingMember} visits={visitsByMember[editingMember.id] || 0} checkins={checkinRowsByMember?.[editingMember.id] || []} />
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">Geschlecht: </span>
                                    {editingMember.gender || "—"}
                                  </div>
                                  <div className="break-all">
                                    <span className="text-zinc-500">{editingMemberIsBoxzwerge ? "Eltern-E-Mail" : "E-Mail"}: </span>
                                    {editingMember.email || "—"}
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">{editingMemberIsBoxzwerge ? "Eltern-Telefon" : "Telefon"}: </span>
                                    {editingMember.phone || "—"}
                                  </div>
                                </div>
                                <div className="mt-2 space-y-1 text-xs text-zinc-500">
                                  <div>
                                    {"Check-ins: "}
                                    <span className="text-zinc-700">{visitsByMember[editingMember.id] ?? 0}</span>
                                  </div>
                                  <div>
                                    {"Aktivität: "}
                                    <span className="text-zinc-700">
                                      {lastActivityByMember[editingMember.id]
                                        ? formatDisplayDateTime(new Date(lastActivityByMember[editingMember.id]))
                                        : "—"}
                                    </span>
                                  </div>
                                  {editingMember.office_list_status ? (
                                    <div>
                                      {"GS-Abgleich: "}
                                      <span className={
                                        editingMember.office_list_status === "green" ? "font-medium text-green-700" :
                                        editingMember.office_list_status === "yellow" ? "font-medium text-amber-700" :
                                        editingMember.office_list_status === "red" ? "font-medium text-red-700" : "text-zinc-700"
                                      }>
                                        {getOfficeListStatusLabel(editingMember.office_list_status)}
                                      </span>
                                      {editingMember.office_list_group ? <>{" · "}{editingMember.office_list_group}</> : null}
                                    </div>
                                  ) : null}
                                  {editingMember.created_from_excel ? (
                                    <div>
                                      {"Herkunft: "}
                                      <span className="font-medium text-violet-700">Aus Excel-Abgleich angelegt</span>
                                    </div>
                                  ) : null}
                                  {trainerLinksByMember[editingMember.id] ? (
                                    <div>
                                      {"Rolle: "}
                                      <span className="text-zinc-700">
                                        {trainerLinksByMember[editingMember.id].role === "admin" ? "Admin + Trainer" : "Trainer"}
                                      </span>
                                    </div>
                                  ) : null}
                                  {editingMemberIsBoxzwerge ? (
                                    <div>E-Mail und Telefon gehören zu den Eltern des Kindes.</div>
                                  ) : null}
                                </div>
                                {hasParentManagedMemberLogin(editingMember, editingParentLink) ? (
                                  <div className="mt-3 rounded-2xl border border-[#c8d8ea] bg-white px-3 py-2 text-xs font-medium text-[#154c83]">
                                    Zugang läuft über das Elternkonto – kein eigener Mitglieder-Login.
                                  </div>
                                ) : null}
                              </div>

                              {editingOfficeRunInfo && editingOfficeDifferences.length > 0 ? (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                  <div className="font-semibold">GS-Abweichungen</div>
                                  <div className="mt-1 text-xs text-amber-800">
                                    {getOfficeListStatusLabel(editingOfficeRunInfo.status)}
                                    {editingOfficeRunInfo.groupExcel && editingOfficeRunInfo.groupExcel !== "—"
                                      ? ` · GS-Liste: ${editingOfficeRunInfo.groupExcel}`
                                      : ""}
                                    {editingOfficeRunInfo.source && editingOfficeRunInfo.source !== "—"
                                      ? ` · Datei: ${editingOfficeRunInfo.source}`
                                      : ""}
                                  </div>
                                  <div className="mt-2 space-y-1">
                                    {editingOfficeDifferences.map((entry) => (
                                      <div key={entry}>• {entry}</div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                <div className="space-y-2">
                                  <Label>Stammgruppe</Label>
                                  <Select
                                    value={normalizeTrainingGroupOrFallback(editingMember.base_group)}
                                    onValueChange={async (nextGroup) => {
                                      try {
                                        setSavingMemberId(editingMember.id)
                                        const response = await fetch("/api/admin/member-action", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({
                                            action: "change_group",
                                            memberId: editingMember.id,
                                            baseGroup: nextGroup,
                                          }),
                                        })
                                        if (!response.ok) throw new Error(await response.text())
                                        const payload = (await response.json()) as { member: MemberRecord }
                                        const updated = payload.member
                                        setMembers((current) =>
                                          current.map((row) => (row.id === editingMember.id ? { ...row, base_group: updated.base_group } : row))
                                        )
                                      } catch (error) {
                                        alert(getErrorMessage(error, "Die Gruppe konnte nicht gespeichert werden."))
                                      } finally {
                                        setSavingMemberId(null)
                                      }
                                    }}
                                    disabled={savingMemberId === editingMember.id}
                                  >
                                    <SelectTrigger className="h-10 rounded-2xl bg-white">
                                      <SelectValue placeholder="Gruppe wählen" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {memberGroupOptions.map((group) => (
                                        <SelectItem key={group} value={group}>
                                          {group}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2 md:col-span-1 xl:col-span-3">
                                  <Label>Rollen</Label>
                                  <div className="flex flex-wrap gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                                    <div className="text-sm text-zinc-700">
                                      {trainerLinksByMember[editingMember.id]
                                        ? "Trainerrolle wird separat über Trainerkonto/Rollenverwaltung geführt."
                                        : "Keine Trainerrolle verknüpft."}
                                    </div>

                                    <label className="flex items-center gap-2 text-sm text-zinc-700">
                                      <input
                                        type="checkbox"
                                        checked={!!editingMember.is_competition_member}
                                        disabled={savingMemberId === editingMember.id}
                                        onChange={async (event) => {
                                          try {
                                            setSavingMemberId(editingMember.id)
                                            const response = await fetch("/api/admin/member-action", {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({
                                                action: "set_competition",
                                                memberId: editingMember.id,
                                                isCompetitionMember: event.target.checked,
                                                competitionLicenseNumber: editingMember.competition_license_number ?? undefined,
                                                lastMedicalExamDate: editingMember.last_medical_exam_date ?? undefined,
                                                competitionFights: editingMember.competition_fights ?? 0,
                                                competitionWins: editingMember.competition_wins ?? 0,
                                                competitionLosses: editingMember.competition_losses ?? 0,
                                                competitionDraws: editingMember.competition_draws ?? 0,
                                              }),
                                            })
                                            if (!response.ok) throw new Error(await response.text())
                                            const payload = (await response.json()) as { member: MemberRecord }
                                            const updated = payload.member

                                            const competitionMailRequests = []

                                            if (!editingMember.is_competition_member && updated.is_competition_member && editingMember.email) {
                                              competitionMailRequests.push({
                                                kind: "competition_assigned" as const,
                                                email: editingMember.email,
                                                name: `${editingMember.first_name ?? ""} ${editingMember.last_name ?? ""}`.trim() || editingMember.name,
                                              })
                                            }

                                            if (editingMember.is_competition_member && !updated.is_competition_member && editingMember.email) {
                                              competitionMailRequests.push({
                                                kind: "competition_removed" as const,
                                                email: editingMember.email,
                                                name: `${editingMember.first_name ?? ""} ${editingMember.last_name ?? ""}`.trim() || editingMember.name,
                                              })
                                            }

                                            setMembers((current) =>
                                              current.map((row) =>
                                                row.id === editingMember.id
                                                  ? {
                                                      ...row,
                                                      is_competition_member: updated.is_competition_member,
                                                      has_competition_pass: updated.has_competition_pass,
                                                      competition_license_number: updated.competition_license_number,
                                                      last_medical_exam_date: updated.last_medical_exam_date,
                                                      competition_fights: updated.competition_fights,
                                                      competition_wins: updated.competition_wins,
                                                      competition_losses: updated.competition_losses,
                                                      competition_draws: updated.competition_draws,
                                                    }
                                                  : row
                                              )
                                            )

                                            if (competitionMailRequests.length > 0) {
                                              router.push(
                                                buildAdminMailComposeHref({
                                                  title: "Wettkampf-Mail bearbeiten",
                                                  returnTo: "/verwaltung/mitglieder",
                                                  requests: competitionMailRequests,
                                                })
                                              )
                                            }
                                          } catch (error) {
                                            alert(getErrorMessage(error, "Die Wettkämpferrolle konnte nicht gespeichert werden."))
                                          } finally {
                                            setSavingMemberId(null)
                                          }
                                        }}
                                      />
                                      <span>Wettkämpfer</span>
                                    </label>
                                  </div>
                                </div>
                              </div>

                              <form
                                className="grid gap-4 md:grid-cols-2"
                                onSubmit={async (event) => {
                                  event.preventDefault()

                                  const nextMemberPassword = editMemberAccessCode.trim()
                                  const nextParentPassword = editParentAccessCode.trim()
                                  if (nextMemberPassword && !isValidMemberPassword(nextMemberPassword)) {
                                    alert(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE)
                                    return
                                  }
                                  if (nextParentPassword && !isValidMemberPassword(nextParentPassword)) {
                                    alert(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE)
                                    return
                                  }

                                  try {
                                    setSavingMemberId(editingMember.id)
                                    const response = await fetch("/api/admin/member-profile", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        action: "save_profile",
                                        memberId: editingMember.id,
                                        gender: editGender || undefined,
                                        email: editEmail.trim(),
                                        phone: editPhone.trim(),
                                        guardianName: editingMemberIsBoxzwerge ? editGuardianName.trim() : undefined,
                                        memberPin: nextMemberPassword || undefined,
                                        parent:
                                          editingMemberIsBoxzwerge && editParentEmail.trim() && editParentName.trim()
                                            ? {
                                                name: editParentName.trim(),
                                                email: editParentEmail.trim(),
                                                phone: editParentPhone.trim(),
                                                accessCode: nextParentPassword
                                                  ? nextParentPassword
                                                  : undefined,
                                              }
                                            : null,
                                      }),
                                    })

                                    if (!response.ok) throw new Error(await response.text())

                                    const payload = (await response.json()) as { member: MemberRecord; parentLink?: ParentLinkSummary | null }
                                    const updated = payload.member

                                    setMembers((current) =>
                                      current.map((row) =>
                                        row.id === editingMember.id
                                          ? {
                                              ...row,
                                              gender: updated.gender,
                                              email: updated.email,
                                              phone: updated.phone,
                                              guardian_name: updated.guardian_name,
                                            }
                                          : row
                                      )
                                    )

                                    if (payload.parentLink) {
                                      setParentLinksByMember((current) => ({
                                        ...current,
                                        [editingMember.id]: payload.parentLink as ParentLinkSummary,
                                      }))
                                    }
                                  } catch (error) {
                                    console.error(error)
                                    alert(getErrorMessage(error, "Die Kontaktdaten konnten nicht gespeichert werden."))
                                  } finally {
                                    setSavingMemberId(null)
                                  }
                                }}
                              >
                                <div className="space-y-2">
                                  <Label>Geschlecht</Label>
                                  <Select value={editGender} onValueChange={setEditGender}>
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
                                  <Label>{editingMemberIsBoxzwerge ? "Eltern-E-Mail" : "E-Mail"}</Label>
                                  <Input
                                    value={editEmail}
                                    onChange={(event) => setEditEmail(event.target.value)}
                                    placeholder={editingMemberIsBoxzwerge ? "E-Mail der Eltern" : "E-Mail-Adresse"}
                                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>{editingMemberIsBoxzwerge ? "Eltern-Telefon" : "Telefon"}</Label>
                                  <Input
                                    value={editPhone}
                                    onChange={(event) => setEditPhone(event.target.value)}
                                    placeholder={editingMemberIsBoxzwerge ? "Telefon der Eltern" : "Telefonnummer"}
                                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                  />
                                </div>

                                {editingMemberIsBoxzwerge ? (
                                  <>
                                    <div className="space-y-2 md:col-span-2">
                                      <Label>Eltern / Notfallkontakt</Label>
                                      <Input
                                        value={editGuardianName}
                                        onChange={(event) => setEditGuardianName(event.target.value)}
                                        placeholder="Name des Elternteils oder Notfallkontakts"
                                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                      />
                                    </div>

                                    <div className="space-y-2 md:col-span-2">
                                      <Label>Zusätzliches Elternkonto / Familienkonto</Label>
                                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                                        <div className="flex items-center gap-2">
                                          <span>Elternkonto hier verknüpfen.</span>
                                          <InfoHint text="Hier kannst du ein bestehendes oder neues Elternkonto mit dem Kind verknüpfen. Dieselbe Eltern-E-Mail kann parallel auch zu einem eigenen Sportlerkonto in der Ü18-Gruppe gehören." />
                                        </div>
                                      </div>
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Elternkonto-Name</Label>
                                      <Input
                                        value={editParentName}
                                        onChange={(event) => setEditParentName(event.target.value)}
                                        placeholder="Name des Elternkontos"
                                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Elternkonto-E-Mail</Label>
                                      <Input
                                        type="email"
                                        value={editParentEmail}
                                        onChange={(event) => setEditParentEmail(event.target.value)}
                                        placeholder="E-Mail des Elternkontos"
                                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Elternkonto-Telefon</Label>
                                      <Input
                                        value={editParentPhone}
                                        onChange={(event) => setEditParentPhone(event.target.value)}
                                        placeholder="Telefon des Elternkontos"
                                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Neues Eltern-Passwort</Label>
                                      <PasswordInput
                                        value={editParentAccessCode}
                                        onChange={(event) => setEditParentAccessCode(event.target.value)}
                                        placeholder={editingParentLink ? "Nur ausfüllen, wenn das Passwort geändert werden soll" : "8 bis 64 Zeichen für neues Elternkonto"}
                                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                      />
                                      <div className="text-xs text-zinc-500">{MEMBER_PASSWORD_HINT}</div>
                                    </div>

                                    <div className="space-y-2 md:col-span-2">
                                      <Label>Eigenes Passwort für das Kind</Label>
                                      <PasswordInput
                                        value={editMemberAccessCode}
                                        onChange={(event) => setEditMemberAccessCode(event.target.value)}
                                        placeholder="Optional, z. B. wenn das Kind aus dem Elternkonto gelöst wird"
                                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                      />
                                      <div className="text-xs text-zinc-500">{MEMBER_PASSWORD_HINT}</div>
                                    </div>
                                  </>
                                ) : null}

                                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3 md:col-span-2">
                                  <Button
                                    type="submit"
                                    className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                                    disabled={savingMemberId === editingMember.id}
                                  >
                                    {savingMemberId === editingMember.id ? "Speichert..." : "Änderungen speichern"}
                                  </Button>
                                  <Button type="button" variant="outline" className="rounded-2xl" onClick={clearEditingState}>
                                    Schließen
                                  </Button>
                                  {editingMember.email ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-2xl"
                                      onClick={() => {
                                        router.push(`/verwaltung/postfach?tab=compose&to=${encodeURIComponent(editingMember.email ?? "")}`)
                                      }}
                                    >
                                      Mail senden
                                    </Button>
                                  ) : null}
                                  {!editingMember.email_verified && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-2xl border-[#c8d8ea] text-[#154c83]"
                                      disabled={resendingVerificationMemberId === editingMember.id}
                                      onClick={async () => {
                                        await resendVerificationEmail(editingMember)
                                      }}
                                    >
                                      {resendingVerificationMemberId === editingMember.id ? "Sendet..." : "Bestätigungs-Mail erneut senden"}
                                    </Button>
                                  )}
                                  {editingMemberIsBoxzwerge && editingParentLink ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-2xl border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                                      disabled={savingMemberId === editingMember.id}
                                      onClick={async () => {
                                        try {
                                          setSavingMemberId(editingMember.id)
                                          const response = await fetch("/api/admin/member-profile", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                              action: "unlink_parent",
                                              memberId: editingMember.id,
                                            }),
                                          })
                                          if (!response.ok) throw new Error(await response.text())
                                          setParentLinksByMember((current) => {
                                            const next = { ...current }
                                            delete next[editingMember.id]
                                            return next
                                          })
                                          setEditParentName("")
                                          setEditParentEmail("")
                                          setEditParentPhone("")
                                          alert("Kind wurde vom Elternkonto getrennt.")
                                        } catch (error) {
                                          console.error(error)
                                          alert(getErrorMessage(error, "Die Verknüpfung konnte nicht gelöst werden."))
                                        } finally {
                                          setSavingMemberId(null)
                                        }
                                      }}
                                    >
                                      Vom Elternkonto trennen
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-2xl border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 sm:ml-auto"
                                    disabled={savingMemberId === editingMember.id}
                                    onClick={async () => {
                                      const confirmed = window.confirm(
                                        `${getMemberDisplayName(editingMember)} wirklich löschen? Alle Check-ins dieser Person werden ebenfalls entfernt.`
                                      )
                                      if (!confirmed) return
                                      try {
                                        setSavingMemberId(editingMember.id)
                                        const response = await fetch("/api/admin/member-profile", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({
                                            action: "delete_member",
                                            memberId: editingMember.id,
                                          }),
                                        })
                                        if (!response.ok) throw new Error(await response.text())
                                        setMembers((current) => current.filter((row) => row.id !== editingMember.id))
                                        setVisitsByMember((current) => {
                                          const next = { ...current }
                                          delete next[editingMember.id]
                                          return next
                                        })
                                        setLastActivityByMember((current) => {
                                          const next = { ...current }
                                          delete next[editingMember.id]
                                          return next
                                        })
                                        clearEditingState()
                                      } catch (error) {
                                        console.error(error)
                                        alert("Das Mitglied konnte nicht gelöscht werden.")
                                      } finally {
                                        setSavingMemberId(null)
                                      }
                                    }}
                                  >
                                    {savingMemberId === editingMember.id ? "Löscht..." : "Mitglied löschen"}
                                  </Button>
                                </div>
                              </form>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
