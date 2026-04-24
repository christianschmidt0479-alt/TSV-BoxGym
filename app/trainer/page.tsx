import Link from "next/link"
import { redirect } from "next/navigation"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { getTodayIsoDateInBerlin } from "@/lib/dateFormat"
import { MAX_TRAININGS_WITHOUT_APPROVAL } from "@/lib/memberCheckin"
import { MAX_TRIAL_CHECKINS } from "@/lib/checkinCore"
import { getUserContext } from "@/lib/getUserContext"
import TrainerSelfCheckinButton from "@/components/trainer-self-checkin-button"

type RestrictionCode =
  | "EMAIL_NOT_VERIFIED"
  | "NO_GROUP"
  | "DUPLICATE"
  | "LIMIT_TRIAL"
  | "LIMIT_MEMBER"

const RESTRICTION_LABELS: Record<RestrictionCode, string> = {
  EMAIL_NOT_VERIFIED: "E-Mail nicht bestaetigt",
  NO_GROUP: "Keine Trainingsgruppe zugewiesen",
  DUPLICATE: "Heute bereits eingecheckt",
  LIMIT_TRIAL: "Probetraining-Limit erreicht",
  LIMIT_MEMBER: "Mitgliedschaftspruefung erforderlich (Limit erreicht)",
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
  const userContext = await getUserContext()
  if (!userContext) {
    redirect("/trainer-zugang")
  }

  let selfStatus: {
    displayName: string
    todayCheckedIn: boolean
    checkinCount: number
    checkinLimit: number
    restriction: RestrictionCode | null
    memberId: string
  } | null = null

  if (userContext.isMember && userContext.member?.id) {
    const supabase = createServerSupabaseServiceClient()
    const { data: checkins, error: checkinError } = await supabase
      .from("checkins")
      .select("id, date, created_at")
      .eq("member_id", userContext.member.id)

    if (checkinError) {
      throw checkinError
    }

    const todayIsoDate = getTodayIsoDateInBerlin()
    const checkinRows = checkins ?? []
    const todayCheckedIn = checkinRows.some((row) => {
      const rowDate = typeof row.date === "string" && row.date ? row.date : null
      if (rowDate === todayIsoDate) return true
      if (!row.created_at) return false
      const createdAt = new Date(row.created_at)
      if (Number.isNaN(createdAt.getTime())) return false
      return getBerlinDayKey(createdAt) === todayIsoDate
    })

    const checkinCount = checkinRows.length
    const checkinLimit = userContext.member.is_trial ? MAX_TRIAL_CHECKINS : MAX_TRAININGS_WITHOUT_APPROVAL

    let restriction: RestrictionCode | null = null
    if (!userContext.member.email_verified) {
      restriction = "EMAIL_NOT_VERIFIED"
    } else if (!userContext.member.base_group) {
      restriction = "NO_GROUP"
    } else if (todayCheckedIn) {
      restriction = "DUPLICATE"
    } else if (userContext.member.is_trial && checkinCount >= MAX_TRIAL_CHECKINS) {
      restriction = "LIMIT_TRIAL"
    } else if (!userContext.member.is_trial && !userContext.member.is_approved && checkinCount >= MAX_TRAININGS_WITHOUT_APPROVAL) {
      restriction = "LIMIT_MEMBER"
    }

    const fullName = `${userContext.member.first_name ?? ""} ${userContext.member.last_name ?? ""}`.trim()

    selfStatus = {
      displayName: fullName || userContext.member.name || userContext.trainer.email,
      todayCheckedIn,
      checkinCount,
      checkinLimit,
      restriction,
      memberId: userContext.member.id,
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl bg-[#154c83] px-4 py-3 text-base font-semibold text-white">
          Trainerbereich
        </div>

        {selfStatus ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="text-base font-semibold text-zinc-900">Eigener Status</div>
                <div className="text-sm text-zinc-700">{selfStatus.displayName}</div>
                <div className="text-sm text-zinc-600">
                  Heute eingecheckt: {selfStatus.todayCheckedIn ? "Ja" : "Nein"}
                </div>
                <div className="text-sm text-zinc-600">
                  Trainingszaehler: {selfStatus.checkinCount} / {selfStatus.checkinLimit}
                </div>
                <div className={`text-sm font-semibold ${selfStatus.restriction ? "text-amber-700" : "text-emerald-700"}`}>
                  Moegliche Einschraenkungen: {selfStatus.restriction ? RESTRICTION_LABELS[selfStatus.restriction] : "Keine"}
                </div>
              </div>

              <TrainerSelfCheckinButton memberId={selfStatus.memberId} />
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/verwaltung-neu/checkin"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm transition hover:border-zinc-300 hover:shadow"
          >
            <div className="text-base font-semibold">Check-in</div>
            <div className="mt-1 text-sm text-zinc-600">Mitglieder direkt einchecken</div>
          </Link>

          <Link
            href="/trainer/heute"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm transition hover:border-zinc-300 hover:shadow"
          >
            <div className="text-base font-semibold">Heute im Training</div>
            <div className="mt-1 text-sm text-zinc-600">Anwesenheit und aktuelle Lage</div>
          </Link>

          <Link
            href="/verwaltung-neu/mitglieder"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm transition hover:border-zinc-300 hover:shadow sm:col-span-2"
          >
            <div className="text-base font-semibold">Mitglieder</div>
            <div className="mt-1 text-sm text-zinc-600">Nur Übersicht (optional read-only)</div>
          </Link>
        </div>
      </div>
    </div>
  )
}
console.log("NEW SYSTEM ACTIVE")
