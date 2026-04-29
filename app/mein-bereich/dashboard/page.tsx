import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import Link from "next/link"
import { findMemberById } from "@/lib/boxgymDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { MAX_TRAININGS_WITHOUT_APPROVAL } from "@/lib/memberCheckin"
import { getTodayIsoDateInBerlin, isTodayCheckinInBerlin } from "@/lib/dateFormat"
import { getUserContext } from "@/lib/getUserContext"
import { MEMBER_AREA_SESSION_COOKIE } from "@/lib/publicAreaSession"
import { resolveUserContext } from "@/lib/resolveUserContext"
import { MemberAreaBrandHeader } from "@/components/member-area/MemberAreaBrandHeader"
import { FormContainer } from "@/components/ui/form-container"

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const hadMemberSessionCookie = Boolean(cookieStore.get(MEMBER_AREA_SESSION_COOKIE)?.value)
  const resolvedContext = await resolveUserContext()

  if (!resolvedContext.isLoggedIn) {
    redirect(hadMemberSessionCookie ? "/mein-bereich/login?reason=session_expired" : "/mein-bereich/login")
  }

  const context = await getUserContext()
  let memberId = resolvedContext.memberId ?? null
  let role: "member" | "trainer" | "admin" = context?.role === "admin" ? "admin" : context?.role === "trainer" ? "trainer" : "member"

  if (!memberId) {
    const member = await findMemberById(resolvedContext.memberId ?? "")
    if (!member?.id) {
      redirect("/mein-bereich/login")
    }

    memberId = member.id
    role = "member"
  }

  const isAdmin = role === "admin"
  const supabase = createServerSupabaseServiceClient()
  let member: {
    first_name: string | null
    last_name: string | null
    email: string | null
    base_group: string | null
    is_approved: boolean | null
    email_verified: boolean | null
  } | null = null
  if (memberId) {
    const { data } = await supabase
      .from("members")
      .select(`
        first_name,
        last_name,
        email,
        base_group,
        is_approved,
        email_verified
      `)
      .eq("id", memberId)
      .single()
    member = data
  }

  let lastCheckin: { created_at: string } | null = null
  let totalCheckins = 0
  let monthCheckins = 0
  if (memberId) {
    const todayIsoDate = getTodayIsoDateInBerlin()
    const currentMonthKey = todayIsoDate.slice(0, 7)

    const [lastCheckinResponse, totalCountResponse, monthCountResponse] = await Promise.all([
      supabase
        .from("checkins")
        .select("created_at")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("checkins")
        .select("id", { count: "exact", head: true })
        .eq("member_id", memberId),
      supabase
        .from("checkins")
        .select("id", { count: "exact", head: true })
        .eq("member_id", memberId)
        .eq("month_key", currentMonthKey),
    ])

    lastCheckin = lastCheckinResponse.data
    totalCheckins = totalCountResponse.count ?? 0
    monthCheckins = monthCountResponse.count ?? 0
  }

  let trainingsWithoutApprovalUsed = 0
  if (memberId && member && !member.is_approved) {
    const { count } = await supabase
      .from("checkins")
      .select("id", { count: "exact", head: true })
      .eq("member_id", memberId)

    trainingsWithoutApprovalUsed = count ?? 0
  }

  let hasCheckedInToday = false

  if (lastCheckin?.created_at) {
    hasCheckedInToday = isTodayCheckinInBerlin({ created_at: lastCheckin.created_at })
  }

  const memberName = member ? `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || "Unbekannt" : ""
  const memberGroup = member?.base_group || "Keine Gruppe zugewiesen"
  const lastCheckinDisplay = lastCheckin?.created_at
    ? new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Berlin",
      }).format(new Date(lastCheckin.created_at))
    : "-"
  const stats = {
    monthCount: monthCheckins,
    streak: totalCheckins,
    lastCheckin: lastCheckinDisplay,
  }

  return (
    <FormContainer rootClassName="!min-h-[calc(100svh-11rem)] !py-3 md:!py-5">
      <div className="space-y-4 sm:space-y-5">
        <MemberAreaBrandHeader
          title="Mein Bereich"
          subtitle="Deine Übersicht für Training und Kontostatus"
        />

        <div className="rounded-2xl border border-[#154c83] bg-[#154c83] px-4 py-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-100">Status</p>
          <p className="mt-1 text-lg font-semibold leading-tight">{memberName}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:text-sm">
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-blue-100">Gruppe</p>
              <p className="mt-0.5 font-semibold text-white">{memberGroup || "-"}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-blue-100">Freigabe</p>
              <p className="mt-0.5 font-semibold text-white">{member?.is_approved ? "Aktiv" : "Nicht freigegeben"}</p>
            </div>
          </div>

          {!member?.is_approved ? (
            <p className="mt-3 text-xs text-blue-100">
              Verbleibende Trainings ohne Freigabe: {Math.max(MAX_TRAININGS_WITHOUT_APPROVAL - trainingsWithoutApprovalUsed, 0)}
            </p>
          ) : null}

          {hasCheckedInToday ? (
            <p className="mt-2 text-xs font-semibold text-emerald-200">Heute bereits eingecheckt</p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Training</p>
          <p className="mt-1 text-3xl font-extrabold text-zinc-900">{stats?.monthCount || 0}</p>
          <p className="text-sm text-zinc-600">diesen Monat</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-zinc-50 px-3 py-2">
              <p className="text-zinc-500">Check-ins gesamt</p>
              <p className="mt-0.5 font-semibold text-zinc-900">{stats?.streak || 0}</p>
            </div>
            <div className="rounded-xl bg-zinc-50 px-3 py-2">
              <p className="text-zinc-500">Letztes Training</p>
              <p className="mt-0.5 font-semibold text-zinc-900">{stats?.lastCheckin || "-"}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Link
            href="/mein-bereich/qr-code"
            className="inline-flex h-14 items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Mein Mitglieds-QR
          </Link>
          <Link
            href="/mein-bereich/einstellungen/daten"
            className="inline-flex h-14 items-center justify-center rounded-2xl border border-[#154c83] bg-white px-4 text-base font-semibold text-[#154c83] hover:bg-[#f4f9ff]"
          >
            Meine Daten bearbeiten
          </Link>
          <Link
            href="/mein-bereich/einstellungen/passwort"
            className="inline-flex h-14 items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Passwort zurücksetzen
          </Link>
          <Link
            href="/mein-bereich/einstellungen"
            className="inline-flex h-14 items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Alle Einstellungen
          </Link>
        </div>

        {isAdmin ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-800">
            Du bist als Admin eingeloggt.
          </div>
        ) : null}
      </div>
    </FormContainer>
  )
}
