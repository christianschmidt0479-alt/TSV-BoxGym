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

function getBerlinDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export default async function TrainerPage() {
  const resolvedContext = await resolveUserContext()
  if (!resolvedContext || resolvedContext.type !== "trainer") {
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
      if (a.isTodayCheckedIn !== b.isTodayCheckedIn) {
        return a.isTodayCheckedIn ? -1 : 1
      }
      return displayName(a.member).localeCompare(displayName(b.member), "de")
    })

  const todayCount = rows.filter((row) => row.isTodayCheckedIn).length
  const trialCount = rows.filter((row) => row.phase === "trial").length
  const extendedCount = rows.filter((row) => row.phase === "extended").length

  function phaseBadgeStyle(phase: MemberPhase) {
    if (phase === "member") {
      return "bg-emerald-100 text-emerald-800 border border-emerald-300"
    }
    if (phase === "extended") {
      return "bg-amber-100 text-amber-800 border border-amber-300"
    }
    return "bg-zinc-100 text-zinc-700 border border-zinc-300"
  }

  function attendanceBadgeStyle(isTodayCheckedIn: boolean) {
    return isTodayCheckedIn
      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
      : "bg-zinc-100 text-zinc-700 border border-zinc-300"
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-2xl bg-[#154c83] px-4 py-4 text-base font-semibold text-white">
          Trainerbereich Halle
          <div className="mt-1 text-sm font-medium text-blue-100">{trainerName}</div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Heute da</div>
            <div className="text-2xl font-extrabold text-zinc-900">{todayCount}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Trial</div>
            <div className="text-2xl font-extrabold text-zinc-900">{trialCount}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Extended</div>
            <div className="text-2xl font-extrabold text-zinc-900">{extendedCount}</div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
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
            <div>Mitglieder pruefen</div>
            <div className="mt-1 text-sm font-medium text-zinc-600">Stammdaten aufrufen</div>
          </Link>

          <Link
            href="/trainer/heute"
            className="rounded-2xl border border-zinc-300 bg-white px-5 py-5 text-lg font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400"
          >
            <div>Heute im Training</div>
            <div className="mt-1 text-sm font-medium text-zinc-600">Anwesenheit kompakt</div>
          </Link>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-4 py-3">
            <div className="text-base font-semibold text-zinc-900">Mitgliederliste</div>
            <div className="text-sm text-zinc-600">Name, Gruppe, Status und Check-in fuer heute</div>
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-6 text-sm text-zinc-600">Keine Mitglieder gefunden.</div>
          ) : (
            <div className="max-h-[65vh] space-y-3 overflow-y-auto px-3 py-3">
              {rows.map((row) => (
                <div key={row.member.id} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-base font-semibold text-zinc-900">{displayName(row.member)}</div>
                      <div className="text-sm text-zinc-600">Gruppe: {row.member.base_group || "-"}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${phaseBadgeStyle(row.phase)}`}>
                        {row.phase}
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
