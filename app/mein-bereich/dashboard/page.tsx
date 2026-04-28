import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { findMemberById } from "@/lib/boxgymDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { MAX_TRAININGS_WITHOUT_APPROVAL } from "@/lib/memberCheckin"
import { getTodayIsoDateInBerlin } from "@/lib/dateFormat"
import { getUserContext } from "@/lib/getUserContext"
import { MEMBER_AREA_SESSION_COOKIE } from "@/lib/publicAreaSession"
import { resolveUserContext } from "@/lib/resolveUserContext"

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
    const today = new Date()
    const checkinDate = new Date(lastCheckin.created_at)

    hasCheckedInToday =
      checkinDate.toDateString() === today.toDateString()
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
    <div className="min-h-screen bg-gray-50 px-4 pt-8 flex justify-center">
      <div className="w-full max-w-md space-y-6">
        {/* HEADER */}
        <div>
          <h1 className="text-xl font-semibold">
            Willkommen zurück 👋
          </h1>
          <p className="text-sm text-gray-500">
            {memberName}
          </p>
        </div>

        {/* HERO CARD */}
        <div className="bg-[#0f2a44] text-white rounded-xl p-5">
          <p className="text-sm opacity-80">
            Trainings diesen Monat
          </p>

          <p className="text-3xl font-bold">
            {stats?.monthCount || 0}
          </p>

          <div className="mt-4 flex justify-between text-sm">
            <div>
              <p className="opacity-70">Check-ins gesamt</p>
              <p className="font-semibold">
                {stats?.streak || 0}
              </p>
            </div>

            <div>
              <p className="opacity-70">Letztes Training</p>
              <p className="font-semibold">
                {stats?.lastCheckin || "-"}
              </p>
            </div>
          </div>
        </div>

        {/* STATUS */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-600">
            Gruppe
          </p>
          <p className="font-semibold">
            {memberGroup || "-"}
          </p>

          <p className="text-sm text-gray-600 mt-2">
            Status
          </p>
          <p className="font-semibold text-green-600">
            {member?.is_approved ? "Aktiv" : "Nicht freigegeben"}
          </p>
        </div>

        {/* MOTIVATION */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold mb-1">
            🔥 Bleib dran!
          </p>
          <p className="text-sm text-gray-600">
            Halte deine Trainingsserie aufrecht.
          </p>
        </div>

        {isAdmin && (
          <div className="p-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
            Du bist als Admin eingeloggt
          </div>
        )}
      </div>
    </div>
  )
}
