import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifyTrainerSessionToken } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

type Member = {
  id: string
  name: string | null
  first_name: string | null
  last_name: string | null
  base_group: string | null
  is_trial: boolean | null
  is_approved: boolean | null
  email_verified: boolean | null
}

type Checkin = {
  member_id: string | null
  created_at: string | null
}

type TodayMember = {
  member: Member
  checkinCount: number
  isTodayCheckedIn: boolean
}

function berlinDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function displayName(member: Member) {
  const fullName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
  return fullName || member.name || "Unbekannt"
}

function limitFor(member: Member) {
  return member.is_trial ? 3 : 8
}

function statusVisual(member: TodayMember) {
  if (!member.member.is_approved && member.checkinCount >= 7) {
    return { icon: "🔥", label: "kritisch", color: "#b91c1c" }
  }
  if (!member.member.is_approved || !member.member.email_verified) {
    return { icon: "⚠", label: "prüfen", color: "#b45309" }
  }
  return { icon: "✔", label: "ok", color: "#15803d" }
}

function sortBucket(row: TodayMember) {
  if (!row.member.is_approved && row.checkinCount >= 7) return 1
  if (!row.member.is_approved) return 2
  return 3
}

export default async function TrainerTodayPage() {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get("trainer_session")

  if (!sessionCookie) {
    redirect("/trainer-zugang")
  }

  const trainerSession = await verifyTrainerSessionToken(sessionCookie.value)
  if (!trainerSession) {
    redirect("/trainer-zugang")
  }

  const supabase = createServerSupabaseServiceClient()

  const [membersResponse, checkinsResponse] = await Promise.all([
    supabase
      .from("members")
      .select("id, name, first_name, last_name, base_group, is_trial, is_approved, email_verified")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    supabase.from("checkins").select("member_id, created_at"),
  ])

  if (membersResponse.error) {
    throw membersResponse.error
  }
  if (checkinsResponse.error) {
    throw checkinsResponse.error
  }

  const members = (membersResponse.data ?? []) as Member[]
  const checkins = (checkinsResponse.data ?? []) as Checkin[]

  const todayBerlin = berlinDayKey(new Date())
  const countByMemberId = new Map<string, number>()
  const checkedInTodayByMemberId = new Set<string>()

  for (const row of checkins) {
    if (!row.member_id) continue

    countByMemberId.set(row.member_id, (countByMemberId.get(row.member_id) ?? 0) + 1)

    if (!row.created_at) continue
    const createdAt = new Date(row.created_at)
    if (Number.isNaN(createdAt.getTime())) continue

    if (berlinDayKey(createdAt) === todayBerlin) {
      checkedInTodayByMemberId.add(row.member_id)
    }
  }

  const todayMembers: TodayMember[] = members
    .map((member) => ({
      member,
      checkinCount: countByMemberId.get(member.id) ?? 0,
      isTodayCheckedIn: checkedInTodayByMemberId.has(member.id),
    }))
    .filter((row) => row.isTodayCheckedIn)
    .sort((a, b) => {
      const bucketDiff = sortBucket(a) - sortBucket(b)
      if (bucketDiff !== 0) return bucketDiff

      const countDiff = b.checkinCount - a.checkinCount
      if (countDiff !== 0) return countDiff

      return displayName(a.member).localeCompare(displayName(b.member), "de")
    })

  const participantCount = todayMembers.length
  const criticalCount = todayMembers.filter((row) => row.checkinCount >= 7).length
  const openCount = todayMembers.filter((row) => !row.member.is_approved).length

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl bg-[#154c83] px-4 py-3 text-base font-semibold text-white">
          Heute im Training
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-xs font-semibold text-zinc-500">Teilnehmer heute</div>
            <div className="text-xl font-extrabold text-zinc-900">{participantCount}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-xs font-semibold text-zinc-500">kritisch (&gt;=7)</div>
            <div className="text-xl font-extrabold text-red-700">{criticalCount}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-xs font-semibold text-zinc-500">offen (!is_approved)</div>
            <div className="text-xl font-extrabold text-amber-700">{openCount}</div>
          </div>
        </div>

        {todayMembers.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-5 text-sm text-zinc-600 shadow-sm">
            Heute noch keine Teilnehmer eingecheckt
          </div>
        ) : (
          <div className="space-y-3">
            {todayMembers.map((row) => {
              const visual = statusVisual(row)
              const member = row.member
              const limit = limitFor(member)

              return (
                <div key={member.id} className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-zinc-900">{displayName(member)}</div>
                      <div className="mt-1 text-sm text-zinc-600">Gruppe: {member.base_group || "-"}</div>
                    </div>

                    <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                      ✔ HEUTE DA
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    <span style={{ color: visual.color, fontWeight: 700 }}>
                      {visual.icon} {visual.label}
                    </span>
                    <span className="font-semibold text-zinc-800">{row.checkinCount} / {limit}</span>
                    {!member.is_approved ? (
                      <span className="font-medium text-amber-700">⚠ Prüfung durch Geschäftsstelle erforderlich</span>
                    ) : null}
                    {!member.email_verified ? (
                      <span className="font-medium text-red-700">❌ E-Mail nicht bestätigt</span>
                    ) : null}
                    {!member.base_group ? (
                      <span className="font-medium text-red-700">❌ Keine Trainingsgruppe zugewiesen</span>
                    ) : null}
                  </div>

                  {!member.is_approved && row.checkinCount >= 7 ? (
                    <div className="mt-2 text-sm font-semibold text-red-700">🔴 heute letzter Check vor Sperre</div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
