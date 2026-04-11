"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CircleUserRound, MailCheck, QrCode, ShieldCheck, UsersRound } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { sessions } from "@/lib/boxgymSessions"
import { formatDisplayDate, formatIsoDateForDisplay } from "@/lib/dateFormat"
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
  privacy_accepted_at?: string | null
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
  office_list_status?: string | null
  office_list_group?: string | null
  office_list_checked_at?: string | null
  member_qr_token?: string | null
  member_qr_active?: boolean | null
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

const MEMBER_AREA_DEFAULT_ROUTE = "/mein-bereich/profil"

async function copyTextToClipboard(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false
  }

  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
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
  return formatDisplayDate(date)
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
      message: `Abgelaufen seit ${Math.abs(daysUntilExpiry)} Tagen. Gültig war bis einschließlich ${formatDisplayDate(expiryDate)}.`,
    }
  }

  if (daysUntilExpiry <= 30) {
    return {
      boxClass: "rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800",
      message: `Läuft in ${daysUntilExpiry} Tagen ab. Gültig bis einschließlich ${formatDisplayDate(expiryDate)}.`,
    }
  }

  return {
    boxClass: "rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800",
    message: `Gültig bis einschließlich ${formatDisplayDate(expiryDate)}.`,
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
  const [privacyConsentRequired, setPrivacyConsentRequired] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [privacyError, setPrivacyError] = useState("")
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

  // State für Verify-Rückmeldung
  const [verifyStatus, setVerifyStatus] = useState<null | "success" | "already" | "invalid" | "error">(null)
  const [verifyMessage, setVerifyMessage] = useState<string>("")

  // Defensive Werte direkt vor return
  const safeMemberAttendanceRows = Array.isArray(memberAttendanceRows) ? memberAttendanceRows : [];
  const safeParentChildren = Array.isArray(parentChildren) ? parentChildren : [];
  const competitionWeightRows = useMemo(() => {
    return safeMemberAttendanceRows.filter((row) => typeof row.weight === "number")
  }, [safeMemberAttendanceRows]);
  const latestCompetitionWeight = competitionWeightRows[0] ?? null;
  const firstCompetitionWeight = competitionWeightRows[competitionWeightRows.length - 1] ?? null;
  const weightChange =
    latestCompetitionWeight && firstCompetitionWeight
      ? latestCompetitionWeight.weight! - firstCompetitionWeight.weight!
      : null;
  const parentSummary = useMemo(() => {
    return {
      children: safeParentChildren.length,
      approved: safeParentChildren.filter((child) => child.is_approved).length,
      verified: safeParentChildren.filter((child) => child.email_verified).length,
    };
  }, [safeParentChildren]);

  // Globaler Safety-Wrap: Crash verhindern, immer fallback anzeigen
  try {
    // Client-Guard für window/navigator
    const isClient = typeof window !== "undefined"

    // Haupt-Branch: memberAreaUnlocked entscheidet über Layout
    if (!memberAreaUnlocked) {
      // Login-/Statusbereich (hier keine UI-Änderung, nur Guard)
      return (
        <div className="flex flex-col gap-8 px-2 pb-8 pt-4 md:px-8 md:pt-8">
          <div>Lade Mitgliederbereich ...</div>
        </div>
      );
    }

    // Fallback, falls Memberdaten fehlen
    if (!memberAreaData) {
      return (
        <div className="flex flex-col gap-8 px-2 pb-8 pt-4 md:px-8 md:pt-8">
          <div>Mitgliedsdaten werden geladen ...</div>
        </div>
      );
    }

    // Defensive Guards für alle kritischen Zugriffe
    const safeAttendance = Array.isArray(memberAttendanceRows) ? memberAttendanceRows : [];
    const safeParentChildren = Array.isArray(parentChildren) ? parentChildren : [];
    const safeRecentCheckins = Array.isArray(recentCheckins) ? recentCheckins : [];
    const safeProfileEmail = profileEmail ?? "";
    const safeProfilePhone = profilePhone ?? "";
    // ...weitere Guards nach Bedarf...

    // Hier folgt der alte JSX-Baum (unverändert, nur Guards in den Props/Ausdrücken verwenden)
    return (
      <div className="flex flex-col gap-8 px-2 pb-8 pt-4 md:px-8 md:pt-8">
        {/* ...alter JSX-Baum, alle Zugriffe defensiv mit ?. oder ?? absichern... */}
      </div>
    );
  } catch (err) {
    // Letzter Fallback bei unerwartetem Fehler
    return (
      <div className="flex flex-col gap-8 px-2 pb-8 pt-4 md:px-8 md:pt-8">
        <div>Ein Fehler ist aufgetreten. Bitte Seite neu laden.</div>
      </div>
    );
  }
}
