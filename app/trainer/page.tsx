import Link from "next/link"
import { redirect } from "next/navigation"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { getTodayIsoDateInBerlin } from "@/lib/dateFormat"
import { getUserContext } from "@/lib/getUserContext"
import { resolveUserContext } from "@/lib/resolveUserContext"
import ExtendTrialButton from "@/components/extend-trial-button"

export const dynamic = "force-dynamic"

type MemberPhase = "trial" | "extended" | "member"

type TrainerMemberRow = {
  id: string
  name: string | null
  first_name: string | null
  last_name: string | null
  base_group: string | null
  is_trial: boolean | null
  is_approved: boolean | null
  member_phase: string | null
}

type CheckinRow = {
  member_id: string | null
  date: string | null
  created_at: string | null
}

type PhaseMeta = {
  key: MemberPhase
  label: string
  hint: string | null
  badgeClass: string
  badgeSizeClass: string
  order: number
}

function getBerlinDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function getPhaseMeta(phase: MemberPhase): PhaseMeta {
  if (phase === "member") {
    return {
      key: "member",
      label: "Mitglied",
      hint: null,
      badgeClass: "bg-emerald-200 text-emerald-900 border border-emerald-500 font-extrabold",
      badgeSizeClass: "text-sm px-3.5 py-1.5",
      order: 1,
    }
  }

  if (phase === "extended") {
    return {
      key: "extended",
      label: "Probemitglied verlängert",
      hint: "Testphase",
      badgeClass: "bg-yellow-100 text-yellow-800 border border-yellow-300",
      badgeSizeClass: "text-xs px-3 py-1",
      order: 2,
    }
  }

  return {
    key: "trial",
    label: "Probemitglied",
    hint: "noch nicht freigegeben",
    badgeClass: "bg-orange-100 text-orange-800 border border-orange-300",
    badgeSizeClass: "text-xs px-3 py-1",
    order: 3,
  }
}

export default async function TrainerPage() {
  const resolvedContext = await resolveUserContext()
  if (!resolvedContext.isTrainer && !resolvedContext.isAdmin) {
    redirect("/trainer-zugang")
  }

  const context = await getUserContext()
  if (!context) {
    redirect("/trainer-zugang")
  }

  if (context.role !== "trainer" && context.role !== "admin") {
    redirect("/mein-bereich")
  }

  if (!context.trainer) {
    redirect("/mein-bereich")
  }

  const trainerName = `${context.trainer.firstName ?? ""} ${context.trainer.lastName ?? ""}`.trim() || context.trainer.email
  const supabase = createServerSupabaseServiceClient()

  const [membersResponse, checkinsResponse] = await Promise.all([
    supabase
      .from("members")
      .select("id, name, first_name, last_name, base_group, is_trial, is_approved, member_phase")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    supabase.from("checkins").select("member_id, date, created_at"),
  ])

  if (membersResponse.error) {
    throw membersResponse.error
  }
  if (checkinsResponse.error) {
    throw checkinsResponse.error
  }

  const members = (membersResponse.data ?? []) as TrainerMemberRow[]
  const checkins = (checkinsResponse.data ?? []) as CheckinRow[]

  const todayIsoDate = getTodayIsoDateInBerlin()
  const checkedInTodayByMemberId = new Set<string>()

  for (const row of checkins) {
    if (!row.member_id) continue

    if (row.date === todayIsoDate) {
      checkedInTodayByMemberId.add(row.member_id)
      continue
    }

    if (!row.created_at) continue
    const createdAt = new Date(row.created_at)
    if (Number.isNaN(createdAt.getTime())) continue
    if (getBerlinDayKey(createdAt) === todayIsoDate) {
      checkedInTodayByMemberId.add(row.member_id)
    }
  }

  function resolvePhase(member: TrainerMemberRow): MemberPhase {
    if (member.member_phase === "trial" || member.member_phase === "extended" || member.member_phase === "member") {
      return member.member_phase
    }
    if (member.is_approved) return "member"
    if (member.is_trial) return "trial"
    return "member"
  }

  function displayName(member: TrainerMemberRow) {
    const fullName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
    return fullName || member.name || "Unbekannt"
  }

  const rows = members
    .map((member) => ({
      member,
      phase: resolvePhase(member),
      isTodayCheckedIn: checkedInTodayByMemberId.has(member.id),
    }))
    .sort((a, b) => {
      const phaseDiff = getPhaseMeta(a.phase).order - getPhaseMeta(b.phase).order
      if (phaseDiff !== 0) {
        return phaseDiff
      }

      if (a.isTodayCheckedIn !== b.isTodayCheckedIn) {
        return a.isTodayCheckedIn ? -1 : 1
      }

      return displayName(a.member).localeCompare(displayName(b.member), "de")
    })

  const todayCount = rows.filter((row) => row.isTodayCheckedIn).length
  const trialCount = rows.filter((row) => row.phase === "trial").length
  const trialTodayCount = rows.filter((row) => (row.phase === "trial" || row.phase === "extended") && row.isTodayCheckedIn).length

  function attendanceBadgeStyle(isTodayCheckedIn: boolean) {
    return isTodayCheckedIn
      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
      : "bg-zinc-100 text-zinc-700 border border-zinc-300"
  }

  const groupedRows: Record<MemberPhase, typeof rows> = {
    member: rows.filter((row) => row.phase === "member"),
    extended: rows.filter((row) => row.phase === "extended"),
    trial: rows.filter((row) => row.phase === "trial"),
  }

  const phaseSections: Array<{ phase: MemberPhase; title: string }> = [
    { phase: "member", title: "Mitglieder" },
    { phase: "extended", title: "Probemitglieder (verlängert)" },
    { phase: "trial", title: "Probemitglieder" },
  ]

  return (
    <div className="min-h-[calc(100svh-11rem)] bg-zinc-50 px-4 py-4 text-zinc-900 md:px-6 md:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-2xl bg-[#154c83] px-4 py-4 text-base font-semibold text-white">
          Trainerbereich Halle
          <div className="mt-1 text-sm font-medium text-blue-100">{trainerName}</div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Link href="/trainer/heute-da" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:border-zinc-400">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Heute da</div>
            <div className="text-2xl font-extrabold text-zinc-900">{todayCount}</div>
            <div className="mt-1 text-sm text-zinc-600">Anwesenheit heute öffnen</div>
          </Link>
          <Link href="/trainer/probemitglieder" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:border-zinc-400">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Probemitglieder</div>
            <div className="text-2xl font-extrabold text-zinc-900">{trialCount}</div>
            <div className="mt-1 text-sm text-zinc-600">Probemitglieder öffnen</div>
          </Link>
          <Link href="/trainer/probemitglieder" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:border-zinc-400">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Probemitglieder heute</div>
            <div className="text-2xl font-extrabold text-zinc-900">{trialTodayCount}</div>
            <div className="mt-1 text-sm text-zinc-600">Probetrainings und aktuelle Anwesenheit prüfen</div>
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/trainer/checkin"
            className="rounded-2xl border border-[#154c83] bg-white px-5 py-5 text-lg font-semibold text-[#154c83] shadow-sm transition hover:bg-[#f2f7fb]"
          >
            <div>Quick Check-in</div>
            <div className="mt-1 text-sm font-medium text-zinc-600">Mitglied suchen und direkt einchecken</div>
          </Link>

          <Link
            href="/verwaltung-neu/checkin"
            className="rounded-2xl border border-[#154c83] bg-[#154c83] px-5 py-5 text-lg font-semibold text-white shadow-sm transition hover:bg-[#0f3d6b]"
          >
            <div>Check-in starten</div>
            <div className="mt-1 text-sm font-medium text-blue-100">Sofort einchecken</div>
          </Link>

          <Link
            href="/verwaltung-neu/mitglieder"
            className="rounded-2xl border border-zinc-300 bg-white px-5 py-5 text-lg font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400"
          >
            <div>Mitglieder prüfen</div>
            <div className="mt-1 text-sm font-medium text-zinc-600">Stammdaten aufrufen</div>
          </Link>

          <Link
            href="/trainer/heute-da"
            className="rounded-2xl border border-zinc-300 bg-white px-5 py-5 text-lg font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400"
          >
            <div>Heute da</div>
            <div className="mt-1 text-sm font-medium text-zinc-600">Anwesenheit und Auschecken</div>
          </Link>

          <Link
            href="/trainer/probemitglieder"
            className="rounded-2xl border border-zinc-300 bg-white px-5 py-5 text-lg font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400"
          >
            <div>Probemitglieder heute</div>
            <div className="mt-1 text-sm font-medium text-zinc-600">Probetrainings und aktuelle Anwesenheit prüfen</div>
          </Link>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-4 py-3">
            <div className="text-base font-semibold text-zinc-900">Mitgliederliste</div>
            <div className="text-sm text-zinc-600">Name, Gruppe, Status und Check-in für heute</div>
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-6 text-sm text-zinc-600">Keine Mitglieder gefunden.</div>
          ) : (
            <div className="max-h-[65vh] space-y-4 overflow-y-auto px-3 py-3">
              {phaseSections.map((section, index) => {
                const sectionRows = groupedRows[section.phase]
                if (sectionRows.length === 0) return null

                return (
                  <div key={section.phase} className={`space-y-3 ${index > 0 ? "mt-8" : ""}`}>
                    <div className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-700">
                      {section.title} ({sectionRows.length})
                    </div>

                    {sectionRows.map((row) => {
                      const phaseMeta = getPhaseMeta(row.phase)
                      return (
                        <div key={row.member.id} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="text-base font-semibold text-zinc-900">{displayName(row.member)}</div>
                              <div className="text-sm text-zinc-600">Gruppe: {row.member.base_group || "-"}</div>
                              {phaseMeta.hint ? (
                                <div className="mt-1 text-xs font-medium text-amber-700">{phaseMeta.hint}</div>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className={`inline-flex rounded-full ${phaseMeta.badgeSizeClass} ${phaseMeta.badgeClass}`}>
                                {phaseMeta.label}
                              </span>
                              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${attendanceBadgeStyle(row.isTodayCheckedIn)}`}>
                                {row.isTodayCheckedIn ? "heute da" : "nicht da"}
                              </span>
                            </div>
                          </div>

                          {row.phase === "trial" ? (
                            <div className="mt-3">
                              <ExtendTrialButton memberId={row.member.id} />
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
