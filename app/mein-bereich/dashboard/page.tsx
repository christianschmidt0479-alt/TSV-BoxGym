import { redirect } from "next/navigation"
import { findMemberById } from "@/lib/boxgymDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { MAX_TRAININGS_WITHOUT_APPROVAL } from "@/lib/memberCheckin"
import { getUserContext } from "@/lib/getUserContext"
import { resolveUserContext } from "@/lib/resolveUserContext"

export default async function DashboardPage() {
  const resolvedContext = await resolveUserContext()

  if (!resolvedContext) {
    redirect("/mein-bereich/login")
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
        base_group,
        is_approved,
        email_verified
      `)
      .eq("id", memberId)
      .single()
    member = data
  }

  let lastCheckin: { created_at: string } | null = null
  if (memberId) {
    const { data } = await supabase
      .from("checkins")
      .select("created_at")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    lastCheckin = data
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

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-4 w-full max-w-md">
        <h1 className="text-xl font-semibold">
          Willkommen im Mitgliederbereich
        </h1>

        {member && (
          <div className="mt-4 text-sm text-gray-700 space-y-3 text-left">
            <p className="font-medium text-base">
              {(member.first_name || "")} {(member.last_name || "")}
            </p>

            <p>
              <span className="text-gray-500">Gruppe:</span>{" "}
              {member.base_group || "Keine Gruppe zugewiesen"}
            </p>

            <p>
              <span className="text-gray-500">Status:</span>
              {!member.email_verified ? (
                <span className="text-red-600 ml-1">Bitte bestätige deine E-Mail</span>
              ) : member.email_verified && !member.is_approved ? (
                <span className="text-yellow-600 ml-1">Dein Zugang wird aktuell geprüft</span>
              ) : (
                <span className="text-green-600 ml-1">Du bist vollständig freigeschaltet</span>
              )}
            </p>

            <div className="mt-4 space-y-2 text-sm">
              <p>
                <span className="text-gray-500">Check-in:</span>

                {hasCheckedInToday ? (
                  <span className="text-green-600 ml-1">Heute eingecheckt</span>
                ) : (
                  <span className="text-gray-600 ml-1">Heute noch nicht eingecheckt</span>
                )}
              </p>

              {lastCheckin?.created_at && (
                <p className="text-gray-500">
                  Letzter Check-in:{" "}
                  {new Date(lastCheckin.created_at).toLocaleString("de-DE")}
                </p>
              )}
            </div>

            {!hasCheckedInToday && (
              <div className="mt-3 p-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
                Bitte checke dich vor dem Training ein.
              </div>
            )}
          </div>
        )}

        <div className="space-y-2 mt-4">
          {member && !member.is_approved && (
            <div className="p-3 rounded-lg bg-yellow-50 text-yellow-800 text-sm">
              <p>Dein Zugang wird aktuell geprüft.</p>
              <p className="mt-1">
                Du hast {trainingsWithoutApprovalUsed} von {MAX_TRAININGS_WITHOUT_APPROVAL} Trainings ohne Mitgliederprüfung genutzt.
              </p>
            </div>
          )}

          {member && !member.email_verified && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
              Bitte bestätige deine E-Mail.
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="mt-4 p-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
            Du bist als Admin eingeloggt
          </div>
        )}
      </div>
    </div>
  )
}
