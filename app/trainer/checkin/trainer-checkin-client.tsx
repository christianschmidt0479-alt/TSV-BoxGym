"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

import { FormContainer } from "@/components/ui/form-container"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type TrainerMember = {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  base_group?: string | null
}

type MembersResponse = {
  members?: TrainerMember[]
}

type TodayCheckinRow = {
  id: string
  members?: {
    id?: string | null
  } | null
  member_id?: string | null
}

type TodayResponse = {
  todayCheckins?: TodayCheckinRow[]
}

type CheckinApiResponse = {
  ok?: boolean
  error?: string
  reason?: string
}

type RowFeedback = {
  tone: "success" | "error" | "info"
  message: string
}

type ScanMemberQrResponse = {
  member?: {
    id?: string
    first_name?: string | null
    last_name?: string | null
    name?: string | null
    base_group?: string | null
  }
}

function berlinTodayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function displayName(member: TrainerMember) {
  const fullName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
  return fullName || member.name?.trim() || "Unbekannt"
}

function mapCheckinError(response: CheckinApiResponse) {
  const reason = typeof response.reason === "string" ? response.reason : ""

  switch (reason) {
    case "outside_time_window":
      return "Check-in ist aktuell außerhalb des Zeitfensters."
    case "no_own_session_today":
      return "Heute findet kein Training der eigenen Gruppe statt."
    case "group_not_allowed":
      return "Für dieses Mitglied wurde keine passende Gruppe gefunden."
    case "email_not_verified":
      return "E-Mail-Adresse ist noch nicht bestätigt."
    case "LIMIT_TRIAL":
      return "Maximale Anzahl an Probetrainings erreicht."
    default:
      return response.error || "Check-in fehlgeschlagen."
  }
}

export default function TrainerCheckinClient() {
  const searchParams = useSearchParams()
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [members, setMembers] = useState<TrainerMember[]>([])
  const [checkedInToday, setCheckedInToday] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [selectedMemberId, setSelectedMemberId] = useState("")
  const [loading, setLoading] = useState(true)
  const [globalError, setGlobalError] = useState("")
  const [quickInfo, setQuickInfo] = useState("")
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({})
  const [rowFeedback, setRowFeedback] = useState<Record<string, RowFeedback>>({})
  const [resolvingToken, setResolvingToken] = useState(false)
  const [preselectedMemberId, setPreselectedMemberId] = useState("")
  const [preselectInfo, setPreselectInfo] = useState("")
  const [preselectError, setPreselectError] = useState("")

  useEffect(() => {
    const memberIdParam = searchParams?.get("memberId")?.trim() ?? ""
    const tokenParam = searchParams?.get("token")?.trim() ?? ""

    if (memberIdParam) {
      setPreselectedMemberId(memberIdParam)
      setPreselectInfo("Mitglied aus Parameter vorausgewählt.")
      setPreselectError("")
      return
    }

    if (!tokenParam) {
      return
    }

    let active = true

    async function resolveToken() {
      try {
        setResolvingToken(true)
        setPreselectError("")
        setPreselectInfo("")

        const response = await fetch("/api/checkin/scan-member-qr", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: tokenParam }),
        })

        const payload = (await response.json().catch(() => ({}))) as ScanMemberQrResponse
        const resolvedId = payload.member?.id?.trim() ?? ""

        if (!active) {
          return
        }

        if (!response.ok || !resolvedId) {
          setPreselectedMemberId("")
          setPreselectInfo("")
          setPreselectError("Ungültiger oder abgelaufener QR/NFC-Token.")
          return
        }

        setPreselectedMemberId(resolvedId)
        setPreselectInfo("QR/NFC erkannt. Mitglied vorausgewählt.")
        setPreselectError("")
      } catch {
        if (!active) {
          return
        }
        setPreselectedMemberId("")
        setPreselectInfo("")
        setPreselectError("QR/NFC-Token konnte nicht verarbeitet werden.")
      } finally {
        if (active) {
          setResolvingToken(false)
        }
      }
    }

    void resolveToken()

    return () => {
      active = false
    }
  }, [searchParams])

  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  useEffect(() => {
    let active = true

    async function loadData() {
      try {
        setLoading(true)
        setGlobalError("")

        const today = berlinTodayIso()
        const [membersResponse, todayResponse] = await Promise.all([
          fetch("/api/trainer/members", { method: "GET" }),
          fetch(`/api/trainer/today?today=${encodeURIComponent(today)}`, { method: "GET" }),
        ])

        if (!membersResponse.ok) {
          throw new Error("Mitglieder konnten nicht geladen werden.")
        }

        const membersPayload = (await membersResponse.json().catch(() => ({}))) as MembersResponse
        const allMembers = Array.isArray(membersPayload.members) ? membersPayload.members : []

        const todayPayload = todayResponse.ok
          ? ((await todayResponse.json().catch(() => ({}))) as TodayResponse)
          : {}

        const todayRows = Array.isArray(todayPayload.todayCheckins) ? todayPayload.todayCheckins : []
        const checkedSet = new Set<string>()

        for (const row of todayRows) {
          const memberId = row.member_id || row.members?.id || ""
          if (memberId) {
            checkedSet.add(memberId)
          }
        }

        if (!active) {
          return
        }

        setMembers(allMembers)
        setCheckedInToday(checkedSet)
      } catch (error) {
        if (!active) {
          return
        }
        setGlobalError(error instanceof Error ? error.message : "Daten konnten nicht geladen werden.")
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      active = false
    }
  }, [])

  const filteredMembers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return members
    }

    return members.filter((member) => {
      const fullName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim().toLowerCase()
      const fallbackName = (member.name ?? "").toLowerCase()
      const groupName = (member.base_group ?? "").toLowerCase()
      return fullName.includes(needle) || fallbackName.includes(needle) || groupName.includes(needle)
    })
  }, [members, query])

  const selectedMember = useMemo(() => {
    if (!selectedMemberId) {
      return null
    }
    return filteredMembers.find((member) => member.id === selectedMemberId) ?? null
  }, [filteredMembers, selectedMemberId])

  const preselectedMember = useMemo(() => {
    if (!preselectedMemberId) {
      return null
    }
    return members.find((member) => member.id === preselectedMemberId) ?? null
  }, [members, preselectedMemberId])

  useEffect(() => {
    if (!preselectedMemberId || loading) {
      return
    }

    if (!preselectedMember) {
      setPreselectError("Mitglied aus Parameter nicht gefunden.")
      return
    }

    setPreselectError("")
    if (!query.trim()) {
      setQuery(displayName(preselectedMember))
    }
  }, [loading, preselectedMember, preselectedMemberId, query])

  useEffect(() => {
    const needle = query.trim()
    if (!needle) {
      return
    }

    const firstMatch = filteredMembers[0]
    if (!firstMatch) {
      setSelectedMemberId("")
      return
    }

    setSelectedMemberId(firstMatch.id)
  }, [filteredMembers, query])

  async function handleSubmitSelectedByEnter() {
    const member = selectedMember ?? filteredMembers[0] ?? null
    if (!member || rowLoading[member.id]) {
      return
    }
    await handleCheckin(member)
  }

  async function handleCheckin(member: TrainerMember) {
    if (checkedInToday.has(member.id)) {
      setRowFeedback((prev) => ({
        ...prev,
        [member.id]: { tone: "info", message: "Bereits eingecheckt" },
      }))
      setQuickInfo("Bereits eingecheckt")
      searchInputRef.current?.focus()
      return
    }

    setRowLoading((prev) => ({ ...prev, [member.id]: true }))
    setRowFeedback((prev) => ({ ...prev, [member.id]: { tone: "info", message: "Check-in läuft..." } }))

    try {
      const response = await fetch("/api/public/member-checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memberId: member.id,
          source: "trainer",
        }),
      })

      const result = (await response.json().catch(() => ({}))) as CheckinApiResponse
      const isDuplicate = result.reason === "DUPLICATE" || typeof result.error === "string" && result.error.toLowerCase().includes("bereits")

      if (isDuplicate) {
        setCheckedInToday((prev) => {
          const next = new Set(prev)
          next.add(member.id)
          return next
        })
        setRowFeedback((prev) => ({
          ...prev,
          [member.id]: { tone: "info", message: "Bereits eingecheckt" },
        }))
        setQuickInfo("Bereits eingecheckt")
        searchInputRef.current?.focus()
        return
      }

      if (!response.ok || !result.ok) {
        setRowFeedback((prev) => ({
          ...prev,
          [member.id]: { tone: "error", message: mapCheckinError(result) },
        }))
        return
      }

      setCheckedInToday((prev) => {
        const next = new Set(prev)
        next.add(member.id)
        return next
      })
      setRowFeedback((prev) => ({
        ...prev,
        [member.id]: { tone: "success", message: "Eingecheckt" },
      }))
      setQuickInfo(`${displayName(member)} eingecheckt`)
      setQuery("")
      setSelectedMemberId("")
      searchInputRef.current?.focus()
    } catch {
      setRowFeedback((prev) => ({
        ...prev,
        [member.id]: { tone: "error", message: "Check-in fehlgeschlagen." },
      }))
    } finally {
      setRowLoading((prev) => ({ ...prev, [member.id]: false }))
    }
  }

  return (
    <FormContainer
      title="Trainer Quick-Check-in"
      description="Mitglied suchen und mit einem Klick einchecken."
      headerSlot={
        <div className="flex items-center justify-end">
          <Link
            href="/trainer"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:border-zinc-400"
          >
            Zurück
          </Link>
        </div>
      }
    >
      <div className="space-y-4">
        {resolvingToken ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">QR/NFC-Token wird geprüft...</div>
        ) : null}

        {preselectInfo ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">{preselectInfo}</div>
        ) : null}

        {preselectError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{preselectError}</div>
        ) : null}

        {preselectedMember ? (
          <div className="rounded-xl border border-[#154c83] bg-[#f4f9ff] px-3 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">{displayName(preselectedMember)}</div>
                <div className="text-xs text-zinc-600">Gruppe: {preselectedMember.base_group?.trim() || "-"}</div>
              </div>
              <Button
                type="button"
                onClick={() => handleCheckin(preselectedMember)}
                disabled={Boolean(rowLoading[preselectedMember.id])}
              >
                {rowLoading[preselectedMember.id] ? "Prüfe..." : "Einchecken"}
              </Button>
            </div>
          </div>
        ) : null}

        <div>
          <label htmlFor="trainer-checkin-search" className="mb-2 block text-sm font-medium text-zinc-700">
            Name suchen
          </label>
          <Input
            ref={searchInputRef}
            id="trainer-checkin-search"
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setQuickInfo("")
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") {
                return
              }
              event.preventDefault()
              void handleSubmitSelectedByEnter()
            }}
            placeholder="Mitglied eingeben"
            autoComplete="off"
          />
        </div>

        {quickInfo ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{quickInfo}</div>
        ) : null}

        {globalError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{globalError}</div>
        ) : null}

        {loading ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">Mitglieder werden geladen...</div>
        ) : filteredMembers.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">Keine Mitglieder gefunden.</div>
        ) : (
          <div className="space-y-2">
            {filteredMembers.map((member) => {
              const isBusy = Boolean(rowLoading[member.id])
              const isAlreadyCheckedIn = checkedInToday.has(member.id)
              const feedback = rowFeedback[member.id]
              const isPreselected = preselectedMemberId === member.id || selectedMemberId === member.id

              return (
                <div
                  key={member.id}
                  className={`rounded-xl px-3 py-3 ${
                    isPreselected
                      ? "border border-[#154c83] bg-[#f4f9ff]"
                      : "border border-zinc-200 bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">{displayName(member)}</div>
                      <div className="text-xs text-zinc-600">Gruppe: {member.base_group?.trim() || "-"}</div>
                    </div>

                    <div className="sm:text-right">
                      <Button type="button" onClick={() => handleCheckin(member)} disabled={isBusy}>
                        {isBusy ? "Prüfe..." : "Einchecken"}
                      </Button>

                      {isAlreadyCheckedIn && !feedback ? (
                        <div className="mt-1 text-xs text-zinc-600">Bereits eingecheckt</div>
                      ) : null}

                      {feedback ? (
                        <div
                          className={`mt-1 text-xs ${
                            feedback.tone === "success"
                              ? "text-emerald-700"
                              : feedback.tone === "error"
                                ? "text-red-700"
                                : "text-zinc-700"
                          }`}
                        >
                          {feedback.message}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </FormContainer>
  )
}
