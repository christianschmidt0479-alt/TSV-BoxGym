import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { getTodayIsoDateInBerlin } from "@/lib/dateFormat"
import { getSessionsForDate } from "@/lib/memberCheckin"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

function isoDateNDaysAgo(referenceIsoDate: string, n: number): string {
  const d = new Date(referenceIsoDate + "T12:00:00Z")
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function memberDisplayName(row: { first_name?: string | null; last_name?: string | null }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || "–"
}

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-ki-analytics:${getRequestIp(request)}`, 30, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = createServerSupabaseServiceClient()
    const today = getTodayIsoDateInBerlin()
    const ago7 = isoDateNDaysAgo(today, 7)
    const ago14 = isoDateNDaysAgo(today, 14)
    const ago30 = isoDateNDaysAgo(today, 30)
    const ago60 = isoDateNDaysAgo(today, 60)

    // Zwei DB-Queries: Checkins (60 Tage) + Mitglieder
    const [checkinsRes, membersRes] = await Promise.all([
      supabase
        .from("checkins")
        .select("id, member_id, group_name, date, time")
        .gte("date", ago60)
        .order("date", { ascending: false })
        .limit(3000),
      supabase
        .from("members")
        .select("id, first_name, last_name, base_group, is_approved, is_trial")
        .order("last_name", { ascending: true }),
    ])

    const checkins = (checkinsRes.data ?? []) as Array<{
      id: string; member_id: string | null; group_name: string | null; date: string; time: string | null
    }>
    const members = (membersRes.data ?? []) as Array<{
      id: string; first_name: string | null; last_name: string | null; base_group: string | null; is_approved: boolean | null; is_trial: boolean | null
    }>

    // ── Heute ──────────────────────────────────────────────────────────
    const todayCheckinRows = checkins.filter((c) => c.date === today)
    const todaySessions = getSessionsForDate(today)

    // ── Gruppen-Stats ──────────────────────────────────────────────────
    const groupMap7d = new Map<string, number>()
    const groupMap30d = new Map<string, number>()
    for (const c of checkins) {
      const g = normalizeTrainingGroup(c.group_name) || c.group_name || "Unbekannt"
      if (c.date >= ago7) groupMap7d.set(g, (groupMap7d.get(g) ?? 0) + 1)
      if (c.date >= ago30) groupMap30d.set(g, (groupMap30d.get(g) ?? 0) + 1)
    }
    const allGroups = new Set([...groupMap7d.keys(), ...groupMap30d.keys()])
    const groupStats = Array.from(allGroups)
      .map((group) => ({ group, count7d: groupMap7d.get(group) ?? 0, count30d: groupMap30d.get(group) ?? 0 }))
      .sort((a, b) => b.count30d - a.count30d)

    // ── Top-Mitglieder (30d) ───────────────────────────────────────────
    const memberCountMap30d = new Map<string, number>()
    for (const c of checkins) {
      if (c.date >= ago30 && c.member_id) {
        memberCountMap30d.set(c.member_id, (memberCountMap30d.get(c.member_id) ?? 0) + 1)
      }
    }
    const memberById = new Map(members.map((m) => [m.id, m]))
    const topMembers = Array.from(memberCountMap30d.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count]) => {
        const m = memberById.get(id)
        return {
          id,
          name: m ? memberDisplayName(m) : id,
          group: m ? (normalizeTrainingGroup(m.base_group) || m.base_group || "–") : "–",
          count,
        }
      })

    // ── Stille Mitglieder ──────────────────────────────────────────────
    const lastCheckinByMember = new Map<string, string>()
    for (const c of checkins) {
      if (!c.member_id) continue
      const existing = lastCheckinByMember.get(c.member_id)
      if (!existing || c.date > existing) lastCheckinByMember.set(c.member_id, c.date)
    }
    const approvedMembers = members.filter((m) => m.is_approved === true && !m.is_trial)
    const silentMembers14d = approvedMembers
      .filter((m) => {
        const last = lastCheckinByMember.get(m.id)
        return !last || last < ago14
      })
      .slice(0, 20)
      .map((m) => ({ id: m.id, name: memberDisplayName(m), group: normalizeTrainingGroup(m.base_group) || m.base_group || "–" }))
    const silentMembers30d = approvedMembers
      .filter((m) => {
        const last = lastCheckinByMember.get(m.id)
        return !last || last < ago30
      })
      .slice(0, 20)
      .map((m) => ({ id: m.id, name: memberDisplayName(m), group: normalizeTrainingGroup(m.base_group) || m.base_group || "–" }))

    // ── Mitglieder mit Rückgang ────────────────────────────────────────
    const memberCountPrev = new Map<string, number>()  // 30-60d
    const memberCountRecent = new Map<string, number>() // 0-30d
    for (const c of checkins) {
      if (!c.member_id) continue
      if (c.date >= ago30) memberCountRecent.set(c.member_id, (memberCountRecent.get(c.member_id) ?? 0) + 1)
      else if (c.date >= ago60) memberCountPrev.set(c.member_id, (memberCountPrev.get(c.member_id) ?? 0) + 1)
    }
    const decliningMembers = Array.from(memberCountPrev.entries())
      .filter(([id, prev]) => prev >= 2 && (memberCountRecent.get(id) ?? 0) < prev)
      .sort((a, b) => {
        const dropA = a[1] - (memberCountRecent.get(a[0]) ?? 0)
        const dropB = b[1] - (memberCountRecent.get(b[0]) ?? 0)
        return dropB - dropA
      })
      .slice(0, 8)
      .map(([id, prev]) => {
        const m = memberById.get(id)
        return {
          id,
          name: m ? memberDisplayName(m) : id,
          group: m ? (normalizeTrainingGroup(m.base_group) || m.base_group || "–") : "–",
          prev,
          now: memberCountRecent.get(id) ?? 0,
        }
      })

    // ── Stoßzeiten ─────────────────────────────────────────────────────
    const hourMap = new Map<number, number>()
    for (const c of checkins) {
      if (!c.time || c.date < ago30) continue
      const hour = parseInt(c.time.slice(0, 2), 10)
      if (!isNaN(hour)) hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1)
    }
    const peakHours = Array.from(hourMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([h, count]) => ({ label: `${String(h).padStart(2, "0")}:00`, count }))

    // ── Freigaben ──────────────────────────────────────────────────────
    const pendingCount = members.filter((m) => m.is_approved === false && !m.is_trial).length
    const newTrialCount = members.filter((m) => m.is_approved === false && m.is_trial === true).length
    const totalMembers = members.filter((m) => m.is_approved === true).length

    // ── Zusammenfassung ────────────────────────────────────────────────
    const topGroup = groupStats[0]
    const summaryParts: string[] = []
    summaryParts.push(
      `Heute: ${todayCheckinRows.length} Check-in${todayCheckinRows.length !== 1 ? "s" : ""}, ${todaySessions.length} Einheit${todaySessions.length !== 1 ? "en" : ""} geplant.`
    )
    if (topGroup?.count30d > 0) {
      summaryParts.push(`Meistbesuchte Gruppe (30 Tage): ${topGroup.group} mit ${topGroup.count30d} Besuchen.`)
    }
    if (silentMembers14d.length > 0) {
      summaryParts.push(`${silentMembers14d.length} Mitglied${silentMembers14d.length !== 1 ? "er sind" : " ist"} seit über 14 Tagen nicht eingecheckt.`)
    }
    if (pendingCount > 0) {
      summaryParts.push(`${pendingCount} Anmeldung${pendingCount !== 1 ? "en warten" : " wartet"} auf Freigabe.`)
    }

    // ── Gruppen-Highlights ─────────────────────────────────────────────
    const sortedBy7d = [...groupStats].sort((a, b) => b.count7d - a.count7d)
    const topGroup7d = sortedBy7d[0]?.count7d > 0
      ? { group: sortedBy7d[0].group, count7d: sortedBy7d[0].count7d }
      : null

    const topGroup30d = groupStats[0]?.count30d > 0
      ? { group: groupStats[0].group, count30d: groupStats[0].count30d }
      : null

    const withCount30d = groupStats.filter((g) => g.count30d > 0)
    const weakGroup30d = withCount30d.length > 1
      ? { group: withCount30d[withCount30d.length - 1].group, count30d: withCount30d[withCount30d.length - 1].count30d }
      : null

    // ── Nächste Session ────────────────────────────────────────────────
    // Aktuelle Berliner Uhrzeit als HH:mm
    const nowBerlinTime = new Date()
      .toLocaleString("sv-SE", { timeZone: "Europe/Berlin" })
      .slice(11, 16) // "YYYY-MM-DD HH:MM:SS" → "HH:MM"
    const nextSession = todaySessions
      .slice()
      .sort((a, b) => a.start.localeCompare(b.start))
      .find((s) => s.start > nowBerlinTime) ?? null

    return NextResponse.json({
      todayDate: today,
      todayCheckins: todayCheckinRows.length,
      todaySessions: todaySessions.map((s) => ({ id: s.id, group: s.group, start: s.start, end: s.end, title: s.title })),
      pendingCount,
      newTrialCount,
      totalMembers,
      groupStats,
      topMembers,
      silentMembers14d,
      silentMembers30d,
      decliningMembers,
      peakHours,
      summary: summaryParts.join(" "),
      topGroup7d,
      topGroup30d,
      weakGroup30d,
      nextSession: nextSession ? { id: nextSession.id, group: nextSession.group, start: nextSession.start, end: nextSession.end, title: nextSession.title } : null,
    })
  } catch (error) {
    console.error("ki-analytics GET failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
