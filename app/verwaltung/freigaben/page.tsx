"use client"

import { ResendVerificationButton } from "../mitglieder/page"
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
  // Nur offene Mitglieder und Trainer anzeigen
  const openMembers = pendingMembers.filter((m) => !m.is_approved)
  const openTrainers = pendingTrainers.filter((t) => !t.is_approved)
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Offene Freigaben</h1>
      {/* Pending-Mitglieder */}
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Mitglieder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Freigaben werden geladen...</div>
          ) : openMembers.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine offenen Freigaben gefunden.</div>
          ) : (
            openMembers.map((member) => (
              <div key={member.id} className="rounded-3xl border border-zinc-200 bg-white p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-semibold text-zinc-900">{getMemberDisplayName(member)}</div>
                  <div className="text-sm text-zinc-600">{member.email || "—"}</div>
                  <div className="text-xs text-zinc-500">Registriert: {member.birthdate ? formatBirthdateLabel(member.birthdate) : "—"}</div>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className={member.email_verified ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-red-200 bg-red-100 text-red-700"}>
                      {member.email_verified ? "E-Mail bestätigt" : "E-Mail nicht bestätigt"}
                    </Badge>
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Freigabe offen</Badge>
                  </div>
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                  {!member.email_verified && member.email ? (
                    <ResendVerificationButton memberId={member.id} email={member.email} />
                  ) : null}
                  <Button
                    className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                    disabled={!member.email_verified}
                    onClick={async () => {
                      if (!member.email_verified) {
                        alert("E-Mail noch nicht bestätigt.")
                        return
                      }
                      try {
                        const response = await fetch("/api/admin/member-action", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "approve",
                            memberId: member.id,
                          }),
                        })
                        if (!response.ok) {
                          throw new Error(await response.text())
                        }
                        // Nach Freigabe neu laden
                        setPendingMembers((prev) => prev.filter((m) => m.id !== member.id))
                        alert("Mitglied freigegeben.")
                      } catch (error) {
                        console.error(error)
                        alert("Fehler bei der Freigabe.")
                      }
                    }}
                  >
                    Freigeben
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      {/* Pending-Trainer */}
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Trainer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Trainer werden geladen...</div>
          ) : openTrainers.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine offenen Trainer-Freigaben.</div>
          ) : (
            openTrainers.map((trainer) => (
              <div key={trainer.id} className="rounded-3xl border border-zinc-200 bg-white p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-semibold text-zinc-900">{[trainer.first_name, trainer.last_name].filter(Boolean).join(" ") || "—"}</div>
                  <div className="text-sm text-zinc-600">{trainer.email || "—"}</div>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className={trainer.email_verified ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-red-200 bg-red-100 text-red-700"}>
                      {trainer.email_verified ? "E-Mail bestätigt" : "E-Mail nicht bestätigt"}
                    </Badge>
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Freigabe offen</Badge>
                  </div>
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                  {!trainer.email_verified && trainer.email ? (
                    <ResendVerificationButton memberId={trainer.id} email={trainer.email} />
                  ) : null}
                  <Button
                    className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                    disabled={!trainer.email_verified}
                    onClick={async () => {
                      if (!trainer.email_verified) {
                        alert("E-Mail noch nicht bestätigt.")
                        return
                      }
                      try {
                        const response = await fetch("/api/admin/person-roles", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "approve_trainer", trainerId: trainer.id }),
                        })
                        if (!response.ok) {
                          throw new Error(await response.text())
                        }
                        // Nach Freigabe neu laden
                        setPendingTrainers((prev) => prev.filter((t) => t.id !== trainer.id))
                        alert("Trainer freigegeben.")
                      } catch (error) {
                        console.error(error)
                        alert("Fehler bei der Freigabe.")
                      }
                    }}
                  >
                    Freigeben
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
