"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CircleUserRound, MailCheck, ShieldCheck, UsersRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { hashSecret } from "@/lib/clientCrypto"
import { sessions } from "@/lib/boxgymSessions"
import { isValidPin, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"
import { readTrainerAccess } from "@/lib/trainerAccess"

type CheckinRow = {
  id: string
  member_id: string
  group_name: string
  weight: number | null
  created_at: string
  date: string
  time: string
  year: number
  month_key: string
}

type MemberRecord = {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  birthdate?: string
  email?: string | null
  email_verified?: boolean
  email_verified_at?: string | null
  email_verification_token?: string | null
  phone?: string | null
  guardian_name?: string | null
  has_competition_pass?: boolean | null
  is_competition_member?: boolean | null
  competition_license_number?: string | null
  last_medical_exam_date?: string | null
  competition_fights?: number | null
  competition_wins?: number | null
  competition_losses?: number | null
  competition_draws?: number | null
  is_trial?: boolean
  is_approved?: boolean
  base_group?: string | null
}

type ParentAccountRow = {
  id: string
  parent_name: string
  email: string
  phone?: string | null
}

type MemberAreaSnapshot = {
  member: MemberRecord
  personalMonthVisits: number
  previousMonthVisits: number
  personalYearVisits: number
  personalLastCheckin: CheckinRow | null
  memberAttendanceRows: CheckinRow[]
  recentCheckins: CheckinRow[]
  trainingStreak: number
  baseGroupMonthVisits: number
  baseGroupPosition: number | null
}

function getDayKey(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`)
  const day = date.getDay()

  switch (day) {
    case 1:
      return "Montag"
    case 2:
      return "Dienstag"
    case 3:
      return "Mittwoch"
    case 4:
      return "Donnerstag"
    case 5:
      return "Freitag"
    default:
      return ""
  }
}

function liveDateString(date: Date | null) {
  if (!date) return "—"
  return date.toLocaleDateString("de-DE")
}

function getStoredString(key: string) {
  if (typeof window === "undefined") return ""
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : ""
  } catch {
    return ""
  }
}

function getMemberDisplayName(member?: Partial<MemberRecord> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
}

function getAgeInYears(birthdate?: string) {
  if (!birthdate) return null

  const today = new Date()
  const birth = new Date(`${birthdate}T12:00:00`)
  if (Number.isNaN(birth.getTime())) return null

  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }

  return age
}

function getCompetitionAgeClass(birthdate?: string) {
  const age = getAgeInYears(birthdate)
  if (age == null) return "—"
  if (age <= 12) return "Schüler U13"
  if (age <= 14) return "Kadett U15"
  if (age <= 16) return "Junior U17"
  if (age <= 18) return "Jugend U19"
  return "Erwachsene"
}

function getCompetitionAgeClassBadgeClass(birthdate?: string) {
  const age = getAgeInYears(birthdate)
  if (age == null) return "border-zinc-200 bg-zinc-100 text-zinc-700"
  if (age <= 12) return "border-emerald-200 bg-emerald-100 text-emerald-800"
  if (age <= 14) return "border-sky-200 bg-sky-100 text-sky-800"
  if (age <= 16) return "border-violet-200 bg-violet-100 text-violet-800"
  if (age <= 18) return "border-amber-200 bg-amber-100 text-amber-800"
  return "border-zinc-300 bg-zinc-200 text-zinc-800"
}

function formatGermanDate(date: Date) {
  return date.toLocaleDateString("de-DE")
}

function getMedicalExamStatus(dateString: string | null | undefined) {
  if (!dateString) {
    return {
      boxClass: "rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600",
      message: "Noch kein Untersuchungsdatum hinterlegt.",
    }
  }

  const examDate = new Date(`${dateString}T12:00:00`)
  const expiryDate = new Date(examDate)
  expiryDate.setFullYear(expiryDate.getFullYear() + 1)
  expiryDate.setDate(expiryDate.getDate() - 1)

  const today = new Date()
  const todayAtNoon = new Date(`${today.toISOString().slice(0, 10)}T12:00:00`)
  const daysUntilExpiry = Math.floor((expiryDate.getTime() - todayAtNoon.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry < 0) {
    return {
      boxClass: "rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800",
      message: `Abgelaufen seit ${Math.abs(daysUntilExpiry)} Tagen. Gültig war bis einschließlich ${formatGermanDate(expiryDate)}.`,
    }
  }

  if (daysUntilExpiry <= 30) {
    return {
      boxClass: "rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800",
      message: `Läuft in ${daysUntilExpiry} Tagen ab. Gültig bis einschließlich ${formatGermanDate(expiryDate)}.`,
    }
  }

  return {
    boxClass: "rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800",
    message: `Gültig bis einschließlich ${formatGermanDate(expiryDate)}.`,
  }
}

export default function MemberAreaPage() {
  const router = useRouter()
  const [isClient, setIsClient] = useState(false)
  const [portalView, setPortalView] = useState<"member" | "parent">("member")

  const [memberAreaEmail, setMemberAreaEmail] = useState("")
  const [memberAreaPin, setMemberAreaPin] = useState("")
  const [memberAreaUnlocked, setMemberAreaUnlocked] = useState(false)
  const [memberAreaData, setMemberAreaData] = useState<MemberRecord | null>(null)
  const [profileEmail, setProfileEmail] = useState("")
  const [profilePhone, setProfilePhone] = useState("")
  const [memberAreaLoading, setMemberAreaLoading] = useState(false)
  const [memberAreaSaving, setMemberAreaSaving] = useState(false)
  const [memberVerificationSending, setMemberVerificationSending] = useState(false)
  const [personalMonthVisits, setPersonalMonthVisits] = useState(0)
  const [previousMonthVisits, setPreviousMonthVisits] = useState(0)
  const [personalYearVisits, setPersonalYearVisits] = useState(0)
  const [personalLastCheckin, setPersonalLastCheckin] = useState<CheckinRow | null>(null)
  const [memberAttendanceRows, setMemberAttendanceRows] = useState<CheckinRow[]>([])
  const [recentCheckins, setRecentCheckins] = useState<CheckinRow[]>([])
  const [trainingStreak, setTrainingStreak] = useState(0)
  const [baseGroupMonthVisits, setBaseGroupMonthVisits] = useState(0)
  const [baseGroupPosition, setBaseGroupPosition] = useState<number | null>(null)

  const [parentEmail, setParentEmail] = useState("")
  const [parentFirstName, setParentFirstName] = useState("")
  const [parentLastName, setParentLastName] = useState("")
  const [parentAccessCode, setParentAccessCode] = useState("")
  const [parentLoading, setParentLoading] = useState(false)
  const [parentUnlocked, setParentUnlocked] = useState(false)
  const [highlightedParentChildId, setHighlightedParentChildId] = useState("")
  const [parentAccount, setParentAccount] = useState<ParentAccountRow | null>(null)
  const [parentChildren, setParentChildren] = useState<MemberRecord[]>([])
  const [parentCheckinsByMember, setParentCheckinsByMember] = useState<Record<string, CheckinRow[]>>({})
  const [trainerHasRoleAccess, setTrainerHasRoleAccess] = useState(false)
  const [trainerHasAdminAccess, setTrainerHasAdminAccess] = useState(false)

  const liveDate = new Date().toISOString().slice(0, 10)
  const currentMonthKey = liveDate.slice(0, 7)

  function applyMemberSnapshot(snapshot: MemberAreaSnapshot) {
    setPersonalMonthVisits(snapshot.personalMonthVisits)
    setPreviousMonthVisits(snapshot.previousMonthVisits)
    setPersonalYearVisits(snapshot.personalYearVisits)
    setPersonalLastCheckin(snapshot.personalLastCheckin)
    setMemberAttendanceRows(snapshot.memberAttendanceRows)
    setRecentCheckins(snapshot.recentCheckins)
    setTrainingStreak(snapshot.trainingStreak)
    setMemberAreaData(snapshot.member)
    setProfileEmail(snapshot.member.email || "")
    setProfilePhone(snapshot.member.phone || "")
    setBaseGroupMonthVisits(snapshot.baseGroupMonthVisits)
    setBaseGroupPosition(snapshot.baseGroupPosition)
    setMemberAreaUnlocked(true)
  }

  const nextBaseGroupSession = useMemo(() => {
    if (!memberAreaData?.base_group) return null

    const base = new Date(`${liveDate}T12:00:00`)

    for (let offset = 0; offset <= 7; offset++) {
      const nextDate = new Date(base)
      nextDate.setDate(base.getDate() + offset)
      const dateString = nextDate.toISOString().slice(0, 10)
      const dayKey = getDayKey(dateString)
      const matchingSession = sessions.find(
        (session) => session.group === memberAreaData.base_group && session.dayKey === dayKey
      )

      if (matchingSession) {
        return {
          date: dateString,
          session: matchingSession,
        }
      }
    }

    return null
  }, [liveDate, memberAreaData?.base_group])

  useEffect(() => {
    setIsClient(true)
    setMemberAreaEmail(getStoredString("tsv_member_area_email"))
    setMemberAreaPin(getStoredString("tsv_member_area_pin"))
    setParentEmail(getStoredString("tsv_parent_area_email"))
    setParentFirstName(getStoredString("tsv_parent_area_first_name"))
    setParentLastName(getStoredString("tsv_parent_area_last_name"))
    setParentAccessCode(getStoredString("tsv_parent_area_access_code"))
    const trainerAccess = readTrainerAccess()
    setTrainerHasRoleAccess(Boolean(trainerAccess.role))
    setTrainerHasAdminAccess(trainerAccess.accountRole === "admin")

    try {
      const params = new URLSearchParams(window.location.search)
      const verifyToken = params.get("verify")
      const requestedView = params.get("view")
      const requestedEmail = params.get("email")
      const requestedChildId = params.get("child")

      if (requestedView === "parent") {
        setPortalView("parent")
      }

      if (requestedEmail) {
        setParentEmail(requestedEmail.trim().toLowerCase())
      }

      if (requestedChildId) {
        setHighlightedParentChildId(requestedChildId)
      }

      if (verifyToken) {
        ;(async () => {
          try {
            const response = await fetch("/api/public/member-area", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "verify_email",
                token: verifyToken,
              }),
            })

            if (!response.ok) {
              const message = await response.text()
              alert(message || "Bestätigungslink ungültig oder bereits verwendet.")
              return
            }

            alert("E-Mail erfolgreich bestätigt. Das Mitglied kann jetzt vom Admin freigegeben werden.")
            params.delete("verify")
            const nextQuery = params.toString()
            const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`
            window.history.replaceState({}, "", nextUrl)
          } catch (error) {
            console.error(error)
            alert("Fehler bei der E-Mail-Bestätigung.")
          }
        })()
      }
    } catch (error) {
      console.error("Verify handling failed", error)
    }
  }, [])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_member_area_email", JSON.stringify(memberAreaEmail))
  }, [memberAreaEmail, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_member_area_pin", JSON.stringify(memberAreaPin))
  }, [memberAreaPin, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_parent_area_email", JSON.stringify(parentEmail))
  }, [parentEmail, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_parent_area_first_name", JSON.stringify(parentFirstName))
  }, [parentFirstName, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_parent_area_last_name", JSON.stringify(parentLastName))
  }, [parentLastName, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_parent_area_access_code", JSON.stringify(parentAccessCode))
  }, [parentAccessCode, isClient])

  async function loadMemberArea() {
    const email = memberAreaEmail.trim().toLowerCase()
    const pin = memberAreaPin.trim()

    if (!email || !pin) {
      alert("Bitte E-Mail und PIN eingeben.")
      return
    }

    if (!isValidPin(pin)) {
      alert(PIN_REQUIREMENTS_MESSAGE)
      return
    }

    try {
      setMemberAreaLoading(true)
      const response = await fetch("/api/public/member-area", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "member_login",
          email,
          pin,
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        alert(message || "Fehler beim Laden des Mitgliederbereichs.")
        return
      }

      const snapshot = (await response.json()) as MemberAreaSnapshot
      applyMemberSnapshot(snapshot)
      router.push("/mein-bereich/profil/wettkampf")
    } catch (error) {
      console.error(error)
      alert("Fehler beim Laden des Mitgliederbereichs.")
    } finally {
      setMemberAreaLoading(false)
    }
  }

  useEffect(() => {
    if (!isClient || memberAreaUnlocked || !trainerHasRoleAccess) return

    ;(async () => {
      try {
        setMemberAreaLoading(true)
        const response = await fetch("/api/public/member-area", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "trainer_linked_member",
          }),
        })

        if (!response.ok) return

        const snapshot = (await response.json()) as MemberAreaSnapshot
        applyMemberSnapshot(snapshot)
      } catch (error) {
        console.error("Trainer-linked member area loading failed", error)
      } finally {
        setMemberAreaLoading(false)
      }
    })()
  }, [
    isClient,
    memberAreaUnlocked,
    router,
    trainerHasRoleAccess,
  ])

  async function loadParentArea() {
    const email = parentEmail.trim().toLowerCase()
    const firstName = parentFirstName.trim()
    const lastName = parentLastName.trim()
    const accessCode = parentAccessCode.trim()

    if (!email || !accessCode) {
      alert("Bitte Eltern-E-Mail und Eltern-Zugangscode eingeben.")
      return
    }

    if (!isValidPin(accessCode)) {
      alert(PIN_REQUIREMENTS_MESSAGE)
      return
    }

    try {
      setParentLoading(true)
      const response = await fetch("/api/public/member-area", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "parent_login",
          email,
          firstName,
          lastName,
          accessCodeHash: await hashSecret(accessCode),
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        alert(message || "Fehler beim Laden des Elternbereichs.")
        return
      }

      const result = (await response.json()) as {
        parent: ParentAccountRow
        children: MemberRecord[]
        checkinsByMember: Record<string, CheckinRow[]>
      }

      setParentAccount(result.parent)
      setParentChildren(result.children)
      setParentCheckinsByMember(result.checkinsByMember)
      setParentUnlocked(true)
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : "Fehler beim Laden des Elternbereichs."
      alert(message)
    } finally {
      setParentLoading(false)
    }
  }

  const parentSummary = useMemo(() => {
    return {
      children: parentChildren.length,
      approved: parentChildren.filter((child) => child.is_approved).length,
      verified: parentChildren.filter((child) => child.email_verified).length,
    }
  }, [parentChildren])

  useEffect(() => {
    if (!parentUnlocked || !highlightedParentChildId) return

    const element = document.getElementById(`parent-child-${highlightedParentChildId}`)
    if (!element) return

    element.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [highlightedParentChildId, parentUnlocked, parentChildren])

  const competitionWeightRows = useMemo(() => {
    return memberAttendanceRows.filter((row) => typeof row.weight === "number")
  }, [memberAttendanceRows])

  const latestCompetitionWeight = competitionWeightRows[0] ?? null
  const firstCompetitionWeight = competitionWeightRows[competitionWeightRows.length - 1] ?? null
  const weightChange =
    latestCompetitionWeight && firstCompetitionWeight
      ? latestCompetitionWeight.weight! - firstCompetitionWeight.weight!
      : null

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <div className="mb-6 overflow-hidden rounded-[28px] border border-[#c8d8ea] bg-white shadow-sm">
          <div className="h-2 bg-[#154c83]" />
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div className="flex items-center gap-4">
              <Image src="/BoxGym Kompakt.png" alt="TSV Falkensee BoxGym" width={104} height={70} className="h-auto w-[46px] md:w-[92px]" priority />
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#154c83]">
                  <CircleUserRound className="h-4 w-4" />
                  Mein Bereich
                </div>
                <h1 className="mt-2 text-2xl font-bold text-[#154c83]">Mitglieder- und Elternbereich</h1>
                <p className="mt-1 text-sm text-zinc-600">Sportler sehen ihren Status, Eltern verwalten mehrere Boxzwerge mit einem Zugang.</p>
              </div>
            </div>

            <Button asChild variant="outline" className="rounded-2xl border-[#c8d8ea] text-[#154c83]">
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zur Startseite
              </Link>
            </Button>
          </div>
        </div>

        {trainerHasRoleAccess && (
          <div className="mb-6 flex flex-wrap gap-3 rounded-[24px] border border-[#d8e3ee] bg-white p-4 shadow-sm">
            <div className="rounded-2xl bg-[#154c83] px-4 py-2 text-sm font-semibold text-white">Rollenwechsel</div>
            <Button type="button" className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]">
              Mitglied
            </Button>
            <Button asChild type="button" variant="outline" className="rounded-2xl border-[#c8d8ea] text-[#154c83]">
              <Link href="/trainer">Trainer</Link>
            </Button>
            {trainerHasAdminAccess && (
              <Button asChild type="button" variant="outline" className="rounded-2xl border-[#c8d8ea] text-[#154c83]">
                <Link href="/verwaltung">Admin</Link>
              </Button>
            )}
          </div>
        )}

        <Tabs value={portalView} onValueChange={(value) => setPortalView(value as "member" | "parent")} className="space-y-6">
          <TabsList className="rounded-2xl bg-white p-1 shadow-sm">
            <TabsTrigger value="member" className="rounded-xl">Mitglied</TabsTrigger>
            <TabsTrigger value="parent" className="rounded-xl">Elternbereich</TabsTrigger>
          </TabsList>

          <TabsContent value="member" className="space-y-6">
            <Card className="rounded-[24px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Zugang zum Mitgliederbereich</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void loadMemberArea()
                  }}
                >
                  <div className="space-y-2">
                    <Label>E-Mail</Label>
                    <Input type="email" value={memberAreaEmail} onChange={(event) => setMemberAreaEmail(event.target.value)} placeholder="name@tsv-falkensee.de" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                  </div>

                  <div className="space-y-2">
                    <Label>PIN</Label>
                    <PasswordInput value={memberAreaPin} onChange={(event) => setMemberAreaPin(event.target.value)} placeholder="6 bis 16 Zeichen" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Hinweis: {PIN_REQUIREMENTS_MESSAGE}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]">
                      {memberAreaLoading ? "Lädt..." : "Mitgliederbereich öffnen"}
                    </Button>

                    {memberAreaUnlocked && (
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => {
                          setMemberAreaUnlocked(false)
                          setMemberAreaData(null)
                          setMemberAttendanceRows([])
                          setRecentCheckins([])
                        }}
                      >
                        Schließen
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            {memberAreaUnlocked && memberAreaData && (
              <Card className="rounded-[24px] border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>Mein Bereich</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-2xl bg-zinc-100 p-4">
                      <div className="text-sm text-zinc-500">Monat gesamt</div>
                      <div className="mt-1 text-3xl font-bold text-[#154c83]">{personalMonthVisits}</div>
                    </div>
                    <div className="rounded-2xl bg-zinc-100 p-4">
                      <div className="text-sm text-zinc-500">Trainingsserie</div>
                      <div className="mt-1 text-3xl font-bold text-[#154c83]">{trainingStreak}</div>
                      <div className="mt-1 text-xs text-zinc-500">aufeinanderfolgende Trainingswochen</div>
                    </div>
                    <div className="rounded-2xl bg-zinc-100 p-4">
                      <div className="text-sm text-zinc-500">Vormonat</div>
                      <div className="mt-1 text-3xl font-bold text-[#154c83]">{previousMonthVisits}</div>
                    </div>
                    <div className="rounded-2xl bg-zinc-100 p-4">
                      <div className="text-sm text-zinc-500">Dieses Jahr</div>
                      <div className="mt-1 text-3xl font-bold text-[#154c83]">{personalYearVisits}</div>
                    </div>
                    <div className="rounded-2xl bg-zinc-100 p-4">
                      <div className="text-sm text-zinc-500">Stammgruppe im Monat</div>
                      <div className="mt-1 text-3xl font-bold text-[#154c83]">{baseGroupMonthVisits}</div>
                      <div className="mt-1 text-xs text-zinc-500">{memberAreaData.base_group || "Keine Stammgruppe"}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-700">
                    E-Mail-Status:{" "}
                    {memberAreaData.email_verified ? (
                      <span className="font-semibold text-green-600">bestätigt</span>
                    ) : (
                      <span className="font-semibold text-amber-600">noch nicht bestätigt</span>
                    )}
                  </div>

                  {memberAreaData.email_verified_at && (
                    <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-700">
                      Bestätigt am: <span className="font-semibold">{new Date(memberAreaData.email_verified_at).toLocaleString("de-DE")}</span>
                    </div>
                  )}

                  <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-700">
                    Admin-Status:{" "}
                    {memberAreaData.is_approved ? (
                      <span className="font-semibold text-green-600">freigegeben</span>
                    ) : (
                      <span className="font-semibold text-amber-600">noch nicht freigegeben</span>
                    )}
                  </div>

                  <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-700">
                    Stammgruppe: <span className="font-semibold">{memberAreaData.base_group || "Nicht festgelegt"}</span>
                    {baseGroupPosition ? <> · Position in deiner Gruppe diesen Monat: <span className="font-semibold">{baseGroupPosition}</span></> : null}
                  </div>

                  <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-700">
                    Nächstes Training:{" "}
                    <span className="font-semibold">
                      {nextBaseGroupSession
                        ? `${liveDateString(new Date(`${nextBaseGroupSession.date}T12:00:00`))} · ${nextBaseGroupSession.session.start} - ${nextBaseGroupSession.session.end}`
                        : "Für deine Stammgruppe ist noch kein Termin hinterlegt"}
                    </span>
                  </div>

                  <div className="rounded-2xl bg-zinc-100 p-4">
                    <div className="text-sm text-zinc-500">Letzter Check-in</div>
                    <div className="mt-1 text-sm font-medium text-zinc-800">
                      {personalLastCheckin
                        ? `${personalLastCheckin.date} · ${personalLastCheckin.time} · ${personalLastCheckin.group_name}`
                        : "Noch kein Check-in gespeichert"}
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-white p-4">
                    <div className="mb-4 font-semibold text-zinc-900">Letzte Trainings</div>
                    {recentCheckins.length === 0 ? (
                      <div className="text-sm text-zinc-500">Noch keine Check-ins gespeichert.</div>
                    ) : (
                      <div className="space-y-2">
                        {recentCheckins.map((row) => (
                          <div key={row.id} className="flex flex-col gap-1 rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700 md:flex-row md:items-center md:justify-between">
                            <div className="font-medium text-zinc-900">{row.group_name}</div>
                            <div>
                              {row.date} · {row.time}
                              {typeof row.weight === "number" ? ` · ${String(row.weight).replace(".", ",")} kg` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border bg-white p-4">
                    <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <div className="font-semibold text-zinc-900">Meine Anwesenheit</div>
                      <div className="text-sm text-zinc-500">{memberAttendanceRows.length} gespeicherte Check-ins</div>
                    </div>
                    {memberAttendanceRows.length === 0 ? (
                      <div className="text-sm text-zinc-500">Noch keine Anwesenheit gespeichert.</div>
                    ) : (
                      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                        {memberAttendanceRows.map((row) => (
                          <div key={`attendance-${row.id}`} className="flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 md:flex-row md:items-center md:justify-between">
                            <div className="font-medium text-zinc-900">{row.group_name}</div>
                            <div>{row.date} · {row.time}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border bg-white p-4">
                    <div className="mb-4 flex items-center gap-2 font-semibold text-zinc-900">
                      <ShieldCheck className="h-4 w-4 text-[#154c83]" />
                      Meine Kontaktdaten
                    </div>
                    <form
                      className="space-y-4"
                      onSubmit={(event) => {
                        event.preventDefault()

                        if (!memberAreaData?.id) return
                        if (!profileEmail.trim()) {
                          alert("Bitte eine E-Mail-Adresse angeben.")
                          return
                        }

                        void (async () => {
                          try {
                            setMemberAreaSaving(true)
                            const response = await fetch("/api/public/member-area", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "update_profile",
                                memberId: memberAreaData.id,
                                email: profileEmail.trim(),
                                phone: profilePhone.trim(),
                                loginEmail: memberAreaEmail.trim().toLowerCase(),
                                pin: memberAreaPin.trim(),
                              }),
                            })

                            if (!response.ok) {
                              throw new Error(await response.text())
                            }

                            const result = (await response.json()) as { member: MemberRecord }
                            setMemberAreaData(result.member)
                            setMemberAreaEmail(result.member.email?.trim().toLowerCase() || memberAreaEmail.trim().toLowerCase())
                            alert("Kontaktdaten gespeichert.")
                          } catch (error) {
                            console.error(error)
                            alert("Fehler beim Speichern der Kontaktdaten.")
                          } finally {
                            setMemberAreaSaving(false)
                          }
                        })()
                      }}
                    >
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>E-Mail</Label>
                          <Input type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} placeholder="E-Mail" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                        </div>

                        <div className="space-y-2">
                          <Label>Telefonnummer</Label>
                          <Input value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} placeholder="Telefonnummer" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Button type="submit" disabled={memberAreaSaving} className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]">
                          {memberAreaSaving ? "Speichert..." : "Kontaktdaten speichern"}
                        </Button>

                        {!memberAreaData.email_verified && !!profileEmail.trim() && (
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-2xl border-[#c8d8ea] text-[#154c83]"
                            disabled={memberVerificationSending}
                            onClick={async () => {
                              if (!memberAreaData?.id) return

                              try {
                                setMemberVerificationSending(true)
                                const response = await fetch("/api/public/member-area", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                  action: "resend_verification",
                                  memberId: memberAreaData.id,
                                  email: profileEmail.trim(),
                                  loginEmail: memberAreaEmail.trim().toLowerCase(),
                                  pin: memberAreaPin.trim(),
                                }),
                              })

                                if (!response.ok) {
                                  const message = await response.text()
                                  throw new Error(message || "E-Mail konnte nicht versendet werden.")
                                }

                                const result = (await response.json()) as { emailVerificationToken?: string }
                                if (result.emailVerificationToken) {
                                  setMemberAreaData((current) =>
                                    current ? { ...current, email_verification_token: result.emailVerificationToken } : current
                                  )
                                }

                                alert("Bestätigungs-Mail wurde erneut versendet.")
                              } catch (error) {
                                console.error(error)
                                const message = error instanceof Error ? error.message : "Bestätigungs-Mail konnte nicht versendet werden."
                                alert(message)
                              } finally {
                                setMemberVerificationSending(false)
                              }
                            }}
                          >
                            <MailCheck className="mr-2 h-4 w-4" />
                            {memberVerificationSending ? "Versendet..." : "Bestätigungs-Mail erneut senden"}
                          </Button>
                        )}
                      </div>
                    </form>
                  </div>

                  {memberAreaData.is_competition_member || memberAreaData.has_competition_pass ? (
                    <div className="rounded-2xl border bg-white p-4">
                      <div className="mb-4 flex items-center gap-2 font-semibold text-zinc-900">
                        <ShieldCheck className="h-4 w-4 text-[#154c83]" />
                        Digitaler Wettkampfbereich
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl bg-zinc-100 p-4">
                          <div className="text-sm text-zinc-500">Lizenznummer</div>
                          <div className="mt-1 text-lg font-bold text-[#154c83]">
                            {memberAreaData.competition_license_number || "Noch nicht hinterlegt"}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-zinc-100 p-4">
                          <div className="text-sm text-zinc-500">Altersklasse</div>
                          <div className="mt-2">
                            <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${getCompetitionAgeClassBadgeClass(memberAreaData.birthdate)}`}>
                              {getCompetitionAgeClass(memberAreaData.birthdate)}
                            </span>
                          </div>
                        </div>
                        <div className="rounded-2xl bg-zinc-100 p-4">
                          <div className="text-sm text-zinc-500">Kämpfe gesamt</div>
                          <div className="mt-1 text-3xl font-bold text-[#154c83]">{memberAreaData.competition_fights ?? 0}</div>
                        </div>
                        <div className="rounded-2xl bg-zinc-100 p-4">
                          <div className="text-sm text-zinc-500">Aktuelles Gewicht</div>
                          <div className="mt-1 text-3xl font-bold text-[#154c83]">
                            {latestCompetitionWeight?.weight != null ? `${String(latestCompetitionWeight.weight).replace(".", ",")} kg` : "—"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_1fr]">
                        <div className="space-y-4">
                          <div className={getMedicalExamStatus(memberAreaData.last_medical_exam_date).boxClass}>
                            <div className="font-semibold text-zinc-900">Ärztliche Untersuchung</div>
                            <div className="mt-1">
                              Letztes Datum: {memberAreaData.last_medical_exam_date ? formatGermanDate(new Date(`${memberAreaData.last_medical_exam_date}T12:00:00`)) : "—"}
                            </div>
                            <div className="mt-1">{getMedicalExamStatus(memberAreaData.last_medical_exam_date).message}</div>
                          </div>

                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                            <div className="font-semibold text-zinc-900">Kampfstatistik</div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-2xl bg-white p-3">
                                <div className="text-xs text-zinc-500">Siege</div>
                                <div className="mt-1 text-2xl font-bold text-emerald-700">{memberAreaData.competition_wins ?? 0}</div>
                              </div>
                              <div className="rounded-2xl bg-white p-3">
                                <div className="text-xs text-zinc-500">Niederlagen</div>
                                <div className="mt-1 text-2xl font-bold text-red-700">{memberAreaData.competition_losses ?? 0}</div>
                              </div>
                              <div className="rounded-2xl bg-white p-3">
                                <div className="text-xs text-zinc-500">Unentschieden</div>
                                <div className="mt-1 text-2xl font-bold text-amber-700">{memberAreaData.competition_draws ?? 0}</div>
                              </div>
                              <div className="rounded-2xl bg-white p-3">
                                <div className="text-xs text-zinc-500">Bilanz</div>
                                <div className="mt-1 text-sm font-semibold text-zinc-900">
                                  {(memberAreaData.competition_fights ?? 0)} Kämpfe
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                            <div className="font-semibold text-zinc-900">Gewichtsentwicklung</div>
                            <div className="text-sm text-zinc-500">{competitionWeightRows.length} Einträge</div>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl bg-white p-3">
                              <div className="text-xs text-zinc-500">Startwert</div>
                              <div className="mt-1 text-lg font-bold text-zinc-900">
                                {firstCompetitionWeight?.weight != null ? `${String(firstCompetitionWeight.weight).replace(".", ",")} kg` : "—"}
                              </div>
                            </div>
                            <div className="rounded-2xl bg-white p-3">
                              <div className="text-xs text-zinc-500">Letzter Wert</div>
                              <div className="mt-1 text-lg font-bold text-zinc-900">
                                {latestCompetitionWeight?.weight != null ? `${String(latestCompetitionWeight.weight).replace(".", ",")} kg` : "—"}
                              </div>
                            </div>
                            <div className="rounded-2xl bg-white p-3">
                              <div className="text-xs text-zinc-500">Veränderung</div>
                              <div className={`mt-1 text-lg font-bold ${weightChange == null ? "text-zinc-900" : weightChange > 0 ? "text-amber-700" : weightChange < 0 ? "text-emerald-700" : "text-zinc-900"}`}>
                                {weightChange == null ? "—" : `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1).replace(".", ",")} kg`}
                              </div>
                            </div>
                          </div>

                          {competitionWeightRows.length === 0 ? (
                            <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-zinc-500">
                              Noch keine Gewichtseinträge vorhanden.
                            </div>
                          ) : (
                            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                              {competitionWeightRows.map((row) => (
                                <div key={`weight-${row.id}`} className="flex flex-col gap-1 rounded-2xl bg-white px-4 py-3 text-sm text-zinc-700 md:flex-row md:items-center md:justify-between">
                                  <div className="font-medium text-zinc-900">
                                    {String(row.weight).replace(".", ",")} kg
                                  </div>
                                  <div>
                                    {row.date} · {row.time} · {row.group_name}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                            <div className="flex items-center gap-2">
                              <span>Nur zur Einsicht.</span>
                              <InfoHint text="Änderungen an Wettkampfdaten erfolgen durch den Admin." />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="parent" className="space-y-6">
            <Card className="rounded-[24px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Elternbereich für Boxzwerge</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                  <div className="flex items-center gap-2">
                    <span>Ein Elternkonto kann mehrere Kinder enthalten.</span>
                    <InfoHint text="Wenn ein Kind älter wird, kann der Admin die Verknüpfung später trennen und einen eigenen Zugang vergeben." />
                  </div>
                </div>

                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void loadParentArea()
                  }}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Eltern-E-Mail</Label>
                      <Input type="email" value={parentEmail} onChange={(event) => setParentEmail(event.target.value)} placeholder="E-Mail des Elternkontos" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                    </div>

                    <div className="space-y-2">
                      <Label>Vorname Elternteil</Label>
                      <Input value={parentFirstName} onChange={(event) => setParentFirstName(event.target.value)} placeholder="Beim ersten Öffnen angeben" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                    </div>

                    <div className="space-y-2">
                      <Label>Nachname Elternteil</Label>
                      <Input value={parentLastName} onChange={(event) => setParentLastName(event.target.value)} placeholder="Beim ersten Öffnen angeben" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                    </div>

                    <div className="space-y-2">
                      <Label>Eltern-Zugangscode</Label>
                      <Input value={parentAccessCode} onChange={(event) => setParentAccessCode(event.target.value)} placeholder="Beim ersten Öffnen neu festlegen" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
                    Beim ersten Öffnen: Eltern-E-Mail eingeben, Vor- und Nachname des Elternteils angeben und den eigenen Zugangscode festlegen.
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]">
                      {parentLoading ? "Lädt..." : "Elternbereich öffnen"}
                    </Button>

                    {parentUnlocked && (
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => {
                          setParentUnlocked(false)
                          setParentAccount(null)
                          setParentChildren([])
                          setParentCheckinsByMember({})
                        }}
                      >
                        Schließen
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            {parentUnlocked && parentAccount && (
              <Card className="rounded-[24px] border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>Familienkonto</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-zinc-100 p-4">
                      <div className="text-sm text-zinc-500">Kinder verknüpft</div>
                      <div className="mt-1 text-3xl font-bold text-[#154c83]">{parentSummary.children}</div>
                    </div>
                    <div className="rounded-2xl bg-zinc-100 p-4">
                      <div className="text-sm text-zinc-500">E-Mail bestätigt</div>
                      <div className="mt-1 text-3xl font-bold text-blue-700">{parentSummary.verified}</div>
                    </div>
                    <div className="rounded-2xl bg-zinc-100 p-4">
                      <div className="text-sm text-zinc-500">Vom Admin freigegeben</div>
                      <div className="mt-1 text-3xl font-bold text-green-700">{parentSummary.approved}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-700">
                    Elternkonto: <span className="font-semibold">{parentAccount.parent_name}</span> · {parentAccount.email}
                    {parentAccount.phone ? <> · {parentAccount.phone}</> : null}
                  </div>

                  {parentChildren.length === 0 ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                      Aktuell sind noch keine Kinder mit diesem Elternkonto verknüpft.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {parentChildren.map((child) => {
                        const rows = parentCheckinsByMember[child.id] ?? []
                        const latest = rows[0] ?? null
                        const monthVisits = rows.filter((row) => row.month_key === currentMonthKey).length
                        const age = getAgeInYears(child.birthdate)

                        return (
                          <div
                            id={`parent-child-${child.id}`}
                            key={child.id}
                            className={`rounded-[24px] border bg-white p-5 shadow-sm ${highlightedParentChildId === child.id ? "border-[#154c83] ring-2 ring-[#154c83]/20" : "border-zinc-200"}`}
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <UsersRound className="h-4 w-4 text-[#154c83]" />
                                  <div className="text-lg font-semibold text-zinc-900">{getMemberDisplayName(child)}</div>
                                </div>
                                <div className="mt-1 text-sm text-zinc-500">
                                  {child.birthdate || "Geburtsdatum offen"}
                                  {age !== null ? ` · ${age} Jahre` : ""}
                                  {child.base_group ? ` · ${child.base_group}` : ""}
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2 text-xs">
                                <span className={`rounded-full px-3 py-1 font-semibold ${child.email_verified ? "bg-blue-100 text-blue-800" : "bg-zinc-100 text-zinc-700"}`}>
                                  {child.email_verified ? "E-Mail bestätigt" : "E-Mail offen"}
                                </span>
                                <span className={`rounded-full px-3 py-1 font-semibold ${child.is_approved ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                                  {child.is_approved ? "Freigegeben" : "Admin offen"}
                                </span>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-3">
                              <div className="rounded-2xl bg-zinc-100 p-4">
                                <div className="text-sm text-zinc-500">Check-ins gesamt</div>
                                <div className="mt-1 text-2xl font-bold text-[#154c83]">{rows.length}</div>
                              </div>
                              <div className="rounded-2xl bg-zinc-100 p-4">
                                <div className="text-sm text-zinc-500">Diesen Monat</div>
                                <div className="mt-1 text-2xl font-bold text-[#154c83]">{monthVisits}</div>
                              </div>
                              <div className="rounded-2xl bg-zinc-100 p-4">
                                <div className="text-sm text-zinc-500">Letzter Besuch</div>
                                <div className="mt-1 text-sm font-semibold text-zinc-900">
                                  {latest ? `${latest.date} · ${latest.time}` : "Noch kein Check-in"}
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 rounded-2xl border bg-white p-4 text-sm text-zinc-700">
                              Letzte Gruppe: <span className="font-semibold">{latest?.group_name || "Noch kein Training"}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
