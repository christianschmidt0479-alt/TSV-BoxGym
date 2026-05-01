"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { loadGsStatusMap, type GsStatusEntry, type GsStatus } from "../gs-abgleich/gsStatusStore"
import { OfficeMatchBadge } from "@/components/verwaltung-neu/OfficeMatchBadge"

type ApprovalMember = {
  id: string
  name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  base_group: string | null
  email_verified: boolean
  is_trial: boolean
  is_approved: boolean
  member_phase: "trial" | "extended" | "member"
  checkin_count: number
  last_verification_sent_at: string | null
  office_list_status: string | null
  office_list_group: string | null
  office_list_checked_at: string | null
}

function getDisplayName(member: ApprovalMember) {
  const full = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
  return full || member.name || "Unbekannt"
}

function approvalHintText(status?: GsStatus) {
  if (status === "not_found") return "Warnung: Mitglied wurde im TSV-Abgleich nicht gefunden. Freigabe wird trotzdem ausgeführt."
  if (status === "mismatch") return "Hinweis: TSV-Abgleich meldet Namens-Treffer mit abweichendem Geburtsdatum. Freigabe wird trotzdem ausgeführt."
  return null
}

function formatSentAt(value: string | null) {
  if (!value) return "Noch nicht erneut gesendet"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Noch nicht erneut gesendet"
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

export default function FreigabenClient({ initialMembers }: { initialMembers: ApprovalMember[] }) {
  const [members, setMembers] = useState<ApprovalMember[]>(initialMembers)
  const [search, setSearch] = useState("")
  const [gsFilter, setGsFilter] = useState("all")
  const [loadingMemberId, setLoadingMemberId] = useState<string | null>(null)
  const [resendLoadingMemberId, setResendLoadingMemberId] = useState<string | null>(null)
  const [resendInfoByMemberId, setResendInfoByMemberId] = useState<Record<string, string>>({})
  const [resendErrorByMemberId, setResendErrorByMemberId] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [tsvStatusMap] = useState<Record<string, GsStatusEntry>>(() => loadGsStatusMap())

  const filteredMembers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return members.filter((member) => {
      const fullName = getDisplayName(member).toLowerCase()
      const firstName = (member.first_name ?? "").toLowerCase()
      const lastName = (member.last_name ?? "").toLowerCase()
      const email = (member.email ?? "").toLowerCase()
      const officeStatus =
        member.office_list_status === "green" || member.office_list_status === "yellow" || member.office_list_status === "red"
          ? member.office_list_status
          : "gray"

      const matchesSearch =
        normalizedSearch.length === 0 ||
        fullName.includes(normalizedSearch) ||
        firstName.includes(normalizedSearch) ||
        lastName.includes(normalizedSearch) ||
        email.includes(normalizedSearch)

      const matchesGs = gsFilter === "all" || officeStatus === gsFilter

      return matchesSearch && matchesGs
    })
  }, [gsFilter, members, search])

  async function callAction(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const result = await response.json().catch(() => ({ ok: false, error: "Unbekannter Fehler" }))
    if (!response.ok || !result.ok) {
      throw new Error(result?.error || "Aktion fehlgeschlagen")
    }
    return result
  }

  async function approveMember(member: ApprovalMember) {
    const baseGroup = member.base_group || ""
    if (!baseGroup) {
      setError("Bitte zuerst unter \"Daten ändern\" eine Stammgruppe setzen.")
      return
    }

    const gsEntry = tsvStatusMap[member.id]
    const hint = approvalHintText(gsEntry?.status)
    if (hint) {
      window.alert(hint)
    }

    setError(null)
    setLoadingMemberId(member.id)
    try {
      await callAction("/api/admin/member-action", {
        action: "approve",
        memberId: member.id,
        baseGroup,
      })

      setMembers((prev) =>
        prev.filter((row) => row.id !== member.id)
      )
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Freigabe fehlgeschlagen")
    } finally {
      setLoadingMemberId(null)
    }
  }

  async function resendVerification(member: ApprovalMember) {
    setResendLoadingMemberId(member.id)
    setResendInfoByMemberId((prev) => ({ ...prev, [member.id]: "" }))
    setResendErrorByMemberId((prev) => ({ ...prev, [member.id]: "" }))

    try {
      const result = await callAction("/api/admin/member-action", {
        action: "resend_verification",
        memberId: member.id,
      })

      const sentAt = typeof result?.sentAt === "string" ? result.sentAt : new Date().toISOString()

      setMembers((prev) =>
        prev.map((row) =>
          row.id === member.id
            ? { ...row, last_verification_sent_at: sentAt }
            : row
        )
      )
      setResendInfoByMemberId((prev) => ({ ...prev, [member.id]: "Bestätigungsmail gesendet." }))
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Senden fehlgeschlagen"
      setResendErrorByMemberId((prev) => ({ ...prev, [member.id]: message }))
    } finally {
      setResendLoadingMemberId(null)
    }
  }

  if (members.length === 0) {
    return <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">Keine offenen Freigaben</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name oder E-Mail suchen"
          className="min-w-[220px] flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
        />
        <select
          value={gsFilter}
          onChange={(event) => setGsFilter(event.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
        >
          <option value="all">Alle</option>
          <option value="red">GS: rot / prüfen</option>
          <option value="yellow">GS: gelb</option>
          <option value="green">GS: grün</option>
          <option value="gray">GS: grau</option>
        </select>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {filteredMembers.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">
          Keine passenden Freigaben gefunden.
        </div>
      ) : null}

      {filteredMembers.map((member) => {
        const gsEntry = tsvStatusMap[member.id]
        const isBusy = loadingMemberId === member.id
        const isResendBusy = resendLoadingMemberId === member.id
        const canResendVerification = !member.email_verified && Boolean(member.email)

        return (
          <div key={member.id} className="flex min-h-[170px] flex-col rounded-xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">{getDisplayName(member)}</div>
                <div className="text-xs text-zinc-500">{member.email || "Keine E-Mail"}</div>
              </div>
              <OfficeMatchBadge
                status={member.office_list_status}
                baseGroup={member.base_group}
                officeGroup={member.office_list_group}
                checkedAt={member.office_list_checked_at}
                compact
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-700">
              <div><strong>Gruppe:</strong> {member.base_group || "-"}</div>
              <div><strong>Check-ins:</strong> {member.checkin_count}</div>
              <div>
                <strong>E-Mail:</strong>{" "}
                <span className={member.email_verified ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"}>
                  {member.email_verified ? "bestätigt" : "nicht bestätigt"}
                </span>
              </div>
              <div>
                <strong>Zuletzt gesendet:</strong> {formatSentAt(member.last_verification_sent_at)}
              </div>
            </div>

            {member.base_group === "L-Gruppe" ? (
              <div className="pt-3 text-xs text-zinc-600">
                L-Gruppe: Abgleich über Stamm-/Office-Gruppe prüfen.
              </div>
            ) : null}

            {approvalHintText(gsEntry?.status) ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {approvalHintText(gsEntry?.status)}
              </div>
            ) : null}

            {resendInfoByMemberId[member.id] ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {resendInfoByMemberId[member.id]}
              </div>
            ) : null}

            {resendErrorByMemberId[member.id] ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {resendErrorByMemberId[member.id]}
              </div>
            ) : null}

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
              <Link href={`/verwaltung-neu/mitglieder/${member.id}`}>
                <button type="button" disabled={isBusy} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400 disabled:opacity-60">
                  Daten ändern
                </button>
              </Link>

              {canResendVerification ? (
                <button
                  type="button"
                  onClick={() => resendVerification(member)}
                  disabled={isResendBusy}
                  className="rounded-md border border-[#154c83] bg-white px-3 py-2 text-sm font-semibold text-[#154c83] transition hover:bg-[#f2f7fc] disabled:opacity-60"
                >
                  {isResendBusy ? "Sende…" : "Bestätigungsmail erneut senden"}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => approveMember(member)}
                disabled={isBusy}
                className="rounded-md bg-[#154c83] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f3d6b] disabled:opacity-60"
              >
                {isBusy ? "Freigeben…" : "Freigeben"}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
