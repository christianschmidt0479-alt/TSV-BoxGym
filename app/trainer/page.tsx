import Link from "next/link"
import { redirect } from "next/navigation"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { getTodayIsoDateInBerlin } from "@/lib/dateFormat"
import { getUserContext } from "@/lib/getUserContext"
import { resolveUserContext } from "@/lib/resolveUserContext"

export const dynamic = "force-dynamic"

type CheckinMemberRow = {
  member_id: string | null
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
  const todayIsoDate = getTodayIsoDateInBerlin()

  const [todayCountResponse, trialCountResponse, trialTodayCheckinsResponse] = await Promise.all([
    supabase
      .from("checkins")
      .select("id", { count: "exact", head: true })
      .eq("date", todayIsoDate),
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("is_trial", true),
    supabase
      .from("checkins")
      .select("member_id")
      .eq("date", todayIsoDate),
  ])

  if (todayCountResponse.error) throw todayCountResponse.error
  if (trialCountResponse.error) throw trialCountResponse.error
  if (trialTodayCheckinsResponse.error) throw trialTodayCheckinsResponse.error

  const todayCount = todayCountResponse.count ?? 0
  const trialCount = trialCountResponse.count ?? 0

  const trialTodayMemberIds = Array.from(
    new Set(
      ((trialTodayCheckinsResponse.data ?? []) as CheckinMemberRow[])
        .map((row) => row.member_id)
        .filter((memberId): memberId is string => Boolean(memberId))
    )
  )

  let trialTodayCount = 0
  if (trialTodayMemberIds.length > 0) {
    const { count: trialTodayCountResponse, error: trialTodayCountError } = await supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("is_trial", true)
      .in("id", trialTodayMemberIds)

    if (trialTodayCountError) throw trialTodayCountError
    trialTodayCount = trialTodayCountResponse ?? 0
  }

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

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          <Link
            href="/trainer/checkin"
            className="rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400"
          >
            <div>Check-in</div>
            <div className="mt-1 text-xs font-medium text-zinc-600">Mitglied suchen und einchecken</div>
          </Link>

          <Link
            href="/trainer/heute-da"
            className="rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400"
          >
            <div>Heute da</div>
            <div className="mt-1 text-xs font-medium text-zinc-600">Anwesenheit und Auschecken</div>
          </Link>

          <Link
            href="/trainer/qr-scanner"
            className="rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400"
          >
            <div>QR-Scanner</div>
            <div className="mt-1 text-xs font-medium text-zinc-600">Mitglieds-QR prüfen</div>
          </Link>

          <Link
            href="/trainer/competition"
            className="rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400"
          >
            <div>Gewicht &amp; Ziel</div>
            <div className="mt-1 text-xs font-medium text-zinc-600">Wettkampfbereich öffnen</div>
          </Link>

          <Link
            href="/trainer/probemitglieder"
            className="rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400"
          >
            <div>Probemitglieder</div>
            <div className="mt-1 text-xs font-medium text-zinc-600">Status und Auschecken</div>
          </Link>

          <Link
            href="/trainer/download"
            className="rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400"
          >
            <div>Downloads</div>
            <div className="mt-1 text-xs font-medium text-zinc-600">Unterlagen öffnen</div>
          </Link>

          <Link
            href="/trainer/heute"
            className="rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400"
          >
            <div>Heute im Training</div>
            <div className="mt-1 text-xs font-medium text-zinc-600">Tagesüberblick</div>
          </Link>
        </div>
      </div>
    </div>
  )
}
