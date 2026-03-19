
"use client"

export const dynamic = "force-dynamic"


import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ShieldCheck,
  Users,
  UserPlus,
  UserRoundPlus,
  UserCircle2,
  Settings,
  Lock,
  BarChart3,
  CheckCircle2,
  RefreshCcw,
} from "lucide-react"


import { supabase } from "@/lib/supabaseClient"
import {
  findMemberByFirstLastAndBirthdate,
  findMemberByFirstLastAndPin,
  createMember,
  updateTrialMember,
  createCheckin,
  getTodayCheckins,
  updateMemberProfile,
  approveMember,
  getPendingMembers,
  getAllMembers,
  changeMemberBaseGroup,
  resetMemberPin,
  updateMemberName,
  deleteMember,
} from "@/lib/boxgymDb"

const brand = {
  primary: "bg-[#154c83]",
  primaryText: "text-[#154c83]",
  accentText: "text-[#e6332a]",
  dark: "bg-[#0f2740]",
  light: "bg-zinc-50",
}

const TRAINER_SESSION_MINUTES = 15
const PIN_REGEX = /^[A-Za-z0-9]{6}$/
const ADMIN_PASSWORD = "32108"
const QR_ACCESS_PARAM = "gym"
const QR_ACCESS_TOKEN = "boxgym-checkin-2026-X9kLm4Pq72Za8R"
const QR_ACCESS_STORAGE_KEY = "tsv_qr_access_until"
const QR_ACCESS_MINUTES = 180

type Session = {
  id: string
  dayKey: "Montag" | "Dienstag" | "Mittwoch" | "Donnerstag" | "Freitag"
  title: string
  group: string
  start: string
  end: string
}

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
  members?: {
    id?: string
    name?: string
    first_name?: string
    last_name?: string
    birthdate?: string
    is_trial?: boolean
    email?: string | null
    phone?: string | null
    is_approved?: boolean
    base_group?: string | null
  } | null
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
  is_trial?: boolean
  is_approved?: boolean
  base_group?: string | null
  member_pin?: string | null
}

const sessions: Session[] = [
  { id: "S-001", dayKey: "Montag", title: "Montag · L-Gruppe · 17:00-18:30", group: "L-Gruppe", start: "17:00", end: "18:30" },
  { id: "S-002", dayKey: "Montag", title: "Montag · Basic ab 18 Jahre · 18:30-20:00", group: "Basic ab 18 Jahre", start: "18:30", end: "20:00" },

  { id: "S-003", dayKey: "Dienstag", title: "Dienstag · Basic 10-14 Jahre · 16:00-17:30", group: "Basic 10-14 Jahre", start: "16:00", end: "17:30" },
  { id: "S-004", dayKey: "Dienstag", title: "Dienstag · Basic 15-18 Jahre · 17:30-19:00", group: "Basic 15-18 Jahre", start: "17:30", end: "19:00" },

  { id: "S-005", dayKey: "Mittwoch", title: "Mittwoch · L-Gruppe · 17:00-18:30", group: "L-Gruppe", start: "17:00", end: "18:30" },

  { id: "S-006", dayKey: "Donnerstag", title: "Donnerstag · Basic 10-14 Jahre · 16:00-17:30", group: "Basic 10-14 Jahre", start: "16:00", end: "17:30" },
  { id: "S-007", dayKey: "Donnerstag", title: "Donnerstag · Basic 15-18 Jahre · 17:30-19:00", group: "Basic 15-18 Jahre", start: "17:30", end: "19:00" },
  { id: "S-008", dayKey: "Donnerstag", title: "Donnerstag · Basic ab 18 Jahre · 19:00-20:30", group: "Basic ab 18 Jahre", start: "19:00", end: "20:30" },

  { id: "S-009", dayKey: "Freitag", title: "Freitag · Boxzwerge · 16:30-17:30", group: "Boxzwerge", start: "16:30", end: "17:30" },
  { id: "S-010", dayKey: "Freitag", title: "Freitag · L-Gruppe · 17:30-19:00", group: "L-Gruppe", start: "17:30", end: "19:00" },
]

const groupOptions = Array.from(new Set(sessions.map((s) => s.group)))

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function liveDateString(date: Date | null) {
  if (!date) return "—"
  return date.toLocaleDateString("de-DE")
}

function liveTimeString(date: Date | null) {
  if (!date) return "—"
  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function timeString() {
  return new Date().toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  })
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

function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7)
}

function getPreviousMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number)
  const date = new Date(year, month - 2, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
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

function getStoredNumber(key: string) {
  if (typeof window === "undefined") return 0
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : 0
  } catch {
    return 0
  }
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function generateEmailVerificationToken() {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

function getMemberDisplayName(member?: Partial<MemberRecord> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
}

function getMemberFlowForToday(daySessions: Session[], nowMinutes: number) {
  if (daySessions.length === 0) {
    return {
      session: null as Session | null,
      nextSession: null as Session | null,
      canCheckin: false,
      statusText: "Heute findet kein reguläres Training statt",
    }
  }

  for (let i = 0; i < daySessions.length; i++) {
    const current = daySessions[i]
    const next = daySessions[i + 1] ?? null
    const start = timeToMinutes(current.start)
    const end = timeToMinutes(current.end)
    const checkinOpen = start - 30
    const checkinClose = start + 30

    if (nowMinutes < checkinOpen) {
      return {
        session: current,
        nextSession: next,
        canCheckin: false,
        statusText: "Nächste Einheit heute",
      }
    }

    if (nowMinutes >= checkinOpen && nowMinutes < start) {
      return {
        session: current,
        nextSession: next,
        canCheckin: true,
        statusText: "Check-in geöffnet",
      }
    }

    if (nowMinutes >= start && nowMinutes < end) {
      return {
        session: current,
        nextSession: next,
        canCheckin: nowMinutes <= checkinClose,
        statusText:
          nowMinutes <= checkinClose
            ? "Aktive Einheit · Check-in geöffnet"
            : "Aktive Einheit · Check-in geschlossen",
      }
    }
  }

  return {
    session: null as Session | null,
    nextSession: null as Session | null,
    canCheckin: false,
    statusText: "Für heute keine aktive Einheit mehr",
  }
}

function getNextTrainingDaySessions(fromDateString: string) {
  const base = new Date(`${fromDateString}T12:00:00`)

  for (let i = 1; i <= 7; i++) {
    const next = new Date(base)
    next.setDate(base.getDate() + i)
    const nextDateString = next.toISOString().slice(0, 10)
    const nextDayKey = getDayKey(nextDateString)
    const nextSessions = sessions.filter((session) => session.dayKey === nextDayKey)

    if (nextSessions.length > 0) {
      return {
        date: nextDateString,
        sessions: nextSessions,
      }
    }
  }

  return {
    date: fromDateString,
    sessions: [] as Session[],
  }
}

function calculateTrainingStreak(checkins: Array<{ date: string }>) {
  if (checkins.length === 0) return 0

  const uniqueDates = Array.from(new Set(checkins.map((c) => c.date))).sort().reverse()
  let streak = 1

  for (let i = 1; i < uniqueDates.length; i++) {
    const current = new Date(`${uniqueDates[i - 1]}T12:00:00`)
    const next = new Date(`${uniqueDates[i]}T12:00:00`)
    const diffDays = Math.round((current.getTime() - next.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays <= 7) streak++
    else break
  }

  return streak
}

export default function Home() {
  const [isClient, setIsClient] = useState(false)
  const [qrAccessGranted, setQrAccessGranted] = useState(false)
  const [now, setNow] = useState<Date | null>(null)

  const [memberFirstName, setMemberFirstName] = useState("")
  const [memberLastName, setMemberLastName] = useState("")
  const [memberPin, setMemberPin] = useState("")

  const [trialFirstName, setTrialFirstName] = useState("")
  const [trialLastName, setTrialLastName] = useState("")
  const [trialBirthDate, setTrialBirthDate] = useState("")
  const [trialEmail, setTrialEmail] = useState("")
  const [trialPhone, setTrialPhone] = useState("")

  const [registerFirstName, setRegisterFirstName] = useState("")
  const [registerLastName, setRegisterLastName] = useState("")
  const [registerBirthDate, setRegisterBirthDate] = useState("")
  const [registerPin, setRegisterPin] = useState("")
  const [registerEmail, setRegisterEmail] = useState("")
  const [registerPhone, setRegisterPhone] = useState("")
  const [registerBaseGroup, setRegisterBaseGroup] = useState(groupOptions[0] ?? "")

  const [memberAreaFirstName, setMemberAreaFirstName] = useState("")
  const [memberAreaLastName, setMemberAreaLastName] = useState("")
  const [memberAreaPin, setMemberAreaPin] = useState("")
  const [memberAreaUnlocked, setMemberAreaUnlocked] = useState(false)
  const [memberAreaData, setMemberAreaData] = useState<MemberRecord | null>(null)

  const [profileEmail, setProfileEmail] = useState("")
  const [profilePhone, setProfilePhone] = useState("")
  const [personalMonthVisits, setPersonalMonthVisits] = useState(0)
  const [previousMonthVisits, setPreviousMonthVisits] = useState(0)
  const [personalYearVisits, setPersonalYearVisits] = useState(0)
  const [personalLastCheckin, setPersonalLastCheckin] = useState<CheckinRow | null>(null)
  const [trainingStreak, setTrainingStreak] = useState(0)
  const [baseGroupMonthVisits, setBaseGroupMonthVisits] = useState(0)
  const [baseGroupPosition, setBaseGroupPosition] = useState<number | null>(null)
  const [baseGroupBestMonthVisits, setBaseGroupBestMonthVisits] = useState(0)
  const [lastCheckinPosition, setLastCheckinPosition] = useState<number | null>(null)

  const [trainerPin, setTrainerPin] = useState("2026")
  const [trainerPinInput, setTrainerPinInput] = useState("")
  const [trainerMode, setTrainerMode] = useState(false)
  const [adminMode, setAdminMode] = useState(false)
  const [pendingMembers, setPendingMembers] = useState<MemberRecord[]>([])
  const [allMembers, setAllMembers] = useState<MemberRecord[]>([])
  const [showTrainerLogin, setShowTrainerLogin] = useState(false)
  const [trainerSessionUntil, setTrainerSessionUntil] = useState(0)

  const [adminGroupDrafts, setAdminGroupDrafts] = useState<Record<string, string>>({})
  const [adminPinDrafts, setAdminPinDrafts] = useState<Record<string, string>>({})
  const [adminFirstNameDrafts, setAdminFirstNameDrafts] = useState<Record<string, string>>({})
  const [adminLastNameDrafts, setAdminLastNameDrafts] = useState<Record<string, string>>({})

  const [dbCheckins, setDbCheckins] = useState<CheckinRow[]>([])
  const [dbLoading, setDbLoading] = useState(false)

  const [trainerGroupFilter, setTrainerGroupFilter] = useState("alle")
  const [trainerTypeFilter, setTrainerTypeFilter] = useState("alle")
  const [trainerNameFilter, setTrainerNameFilter] = useState("")

  const [selectedSessionId, setSelectedSessionId] = useState<string>(sessions[0].id)
  const [openPanel, setOpenPanel] = useState<"member" | "trial" | "register" | "area" | null>(null)


  const liveDate = now ? now.toISOString().slice(0, 10) : todayString()
  const currentYear = new Date(`${liveDate}T12:00:00`).getFullYear()
  const currentMonthKey = getMonthKey(liveDate)

  useEffect(() => {
    setIsClient(true)
    setNow(new Date())

    setMemberFirstName(getStoredString("tsv_member_checkin_first_name"))
    setMemberLastName(getStoredString("tsv_member_checkin_last_name"))
    setMemberPin(getStoredString("tsv_member_checkin_pin"))

    setRegisterFirstName(getStoredString("tsv_register_first_name"))
    setRegisterLastName(getStoredString("tsv_register_last_name"))
    setRegisterBirthDate(getStoredString("tsv_register_birthdate"))
    setRegisterPin(getStoredString("tsv_register_pin"))
    setRegisterEmail(getStoredString("tsv_register_email"))
    setRegisterPhone(getStoredString("tsv_register_phone"))
    setRegisterBaseGroup(getStoredString("tsv_register_base_group") || (groupOptions[0] ?? ""))

    setMemberAreaFirstName(getStoredString("tsv_member_area_first_name"))
    setMemberAreaLastName(getStoredString("tsv_member_area_last_name"))
    setMemberAreaPin(getStoredString("tsv_member_area_pin"))

    const savedTrainerPin = getStoredString("tsv_trainer_pin")
    if (savedTrainerPin) setTrainerPin(savedTrainerPin)

    const savedTrainerUntil = getStoredNumber("tsv_trainer_session_until")
    if (savedTrainerUntil && savedTrainerUntil > Date.now()) {
      setTrainerSessionUntil(savedTrainerUntil)
      setTrainerMode(true)
    }

    try {
      const params = new URLSearchParams(window.location.search)
      const qrToken = params.get(QR_ACCESS_PARAM)
      const savedQrUntilRaw = window.localStorage.getItem(QR_ACCESS_STORAGE_KEY)
      const savedQrUntil = savedQrUntilRaw ? Number(savedQrUntilRaw) : 0

      if (qrToken === QR_ACCESS_TOKEN) {
        const accessUntil = Date.now() + QR_ACCESS_MINUTES * 60 * 1000
        window.localStorage.setItem(QR_ACCESS_STORAGE_KEY, String(accessUntil))
        setQrAccessGranted(true)

        params.delete(QR_ACCESS_PARAM)
        const nextQuery = params.toString()
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`
        window.history.replaceState({}, "", nextUrl)
      } else if (savedQrUntil > Date.now()) {
        setQrAccessGranted(true)
      }
    } catch (error) {
      console.error("QR access init failed", error)
    }

    // E-Mail Verifizierung über Link ?verify=...
    try {
      const params = new URLSearchParams(window.location.search)
      const verifyToken = params.get("verify")

      if (verifyToken) {
        ;(async () => {
          try {
            const { data, error } = await supabase
              .from("members")
              .update({
                email_verified: true,
                email_verified_at: new Date().toISOString(),
                email_verification_token: null,
              })
              .eq("email_verification_token", verifyToken)
              .select("id")
              .maybeSingle()

            if (error) throw error
            if (!data) {
              alert("Bestätigungslink ungültig oder bereits verwendet.")
              return
            }

            if (trainerMode && adminMode) {
              await refreshAdminLists()
            }
            alert("E-Mail erfolgreich bestätigt. Du kannst jetzt vom Admin freigeschaltet werden.")
            setOpenPanel(null)

            params.delete("verify")
            const nextQuery = params.toString()
            const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`
            window.history.replaceState({}, "", nextUrl)
          } catch (err) {
            console.error(err)
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
    localStorage.setItem("tsv_member_checkin_first_name", JSON.stringify(memberFirstName))
  }, [memberFirstName, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_member_checkin_last_name", JSON.stringify(memberLastName))
  }, [memberLastName, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_member_checkin_pin", JSON.stringify(memberPin))
  }, [memberPin, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_first_name", JSON.stringify(registerFirstName))
  }, [registerFirstName, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_last_name", JSON.stringify(registerLastName))
  }, [registerLastName, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_birthdate", JSON.stringify(registerBirthDate))
  }, [registerBirthDate, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_pin", JSON.stringify(registerPin))
  }, [registerPin, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_email", JSON.stringify(registerEmail))
  }, [registerEmail, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_phone", JSON.stringify(registerPhone))
  }, [registerPhone, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_base_group", JSON.stringify(registerBaseGroup))
  }, [registerBaseGroup, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_member_area_first_name", JSON.stringify(memberAreaFirstName))
  }, [memberAreaFirstName, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_member_area_last_name", JSON.stringify(memberAreaLastName))
  }, [memberAreaLastName, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_member_area_pin", JSON.stringify(memberAreaPin))
  }, [memberAreaPin, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_trainer_pin", JSON.stringify(trainerPin))
  }, [trainerPin, isClient])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_trainer_session_until", JSON.stringify(trainerSessionUntil))
  }, [trainerSessionUntil, isClient])

  useEffect(() => {
    if (!isClient) return
    const updateNow = () => setNow(new Date())
    updateNow()
    const interval = window.setInterval(updateNow, 60000)
    return () => window.clearInterval(interval)
  }, [isClient])

  useEffect(() => {
    if (!isClient || !trainerMode) return
    if (trainerSessionUntil && Date.now() > trainerSessionUntil) {
      setTrainerMode(false)
      setAdminMode(false)
      setPendingMembers([])
      setAllMembers([])
      setTrainerSessionUntil(0)
      setShowTrainerLogin(false)
      alert("Trainerzugang abgelaufen.")
    }
  }, [now, trainerMode, trainerSessionUntil, isClient])

  useEffect(() => {
    if (!isClient) return

    try {
      const savedQrUntilRaw = window.localStorage.getItem(QR_ACCESS_STORAGE_KEY)
      const savedQrUntil = savedQrUntilRaw ? Number(savedQrUntilRaw) : 0

      if (savedQrUntil && savedQrUntil <= Date.now()) {
        window.localStorage.removeItem(QR_ACCESS_STORAGE_KEY)
        setQrAccessGranted(false)
        setOpenPanel(null)
        setShowTrainerLogin(false)
      }
    } catch (error) {
      console.error("QR access expiry check failed", error)
    }
  }, [isClient, now])

  const todaysSessions = useMemo(() => {
    const dayKey = getDayKey(liveDate)
    return sessions.filter((session) => session.dayKey === dayKey)
  }, [liveDate])

  const memberFlow = useMemo(() => {
    const currentNow = now ?? new Date(`${liveDate}T12:00:00`)
    const nowMinutes = currentNow.getHours() * 60 + currentNow.getMinutes()
    return getMemberFlowForToday(todaysSessions, nowMinutes)
  }, [liveDate, todaysSessions, now])

  const nextTrainingDayData = useMemo(() => {
    return getNextTrainingDaySessions(liveDate)
  }, [liveDate])

  const displaySessions = useMemo(() => {
    if (memberFlow.session || memberFlow.nextSession || todaysSessions.length > 0) {
      const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : 0
      const lastSession = todaysSessions[todaysSessions.length - 1]

      if (!lastSession) return todaysSessions

      const lastStart = timeToMinutes(lastSession.start)
      if (nowMinutes >= lastStart && !memberFlow.session && !memberFlow.canCheckin) {
        return nextTrainingDayData.sessions
      }

      return todaysSessions
    }

    return nextTrainingDayData.sessions
  }, [memberFlow, todaysSessions, nextTrainingDayData, now])

  const displayedTrainingDate = useMemo(() => {
    const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : 0
    const lastSession = todaysSessions[todaysSessions.length - 1]

    if (!lastSession) return nextTrainingDayData.date

    const lastStart = timeToMinutes(lastSession.start)
    if (nowMinutes >= lastStart && !memberFlow.session && !memberFlow.canCheckin) {
      return nextTrainingDayData.date
    }

    return liveDate
  }, [liveDate, memberFlow, now, todaysSessions, nextTrainingDayData])

  const selectedSession = useMemo(() => {
    return displaySessions.find((session) => session.id === selectedSessionId) ?? memberFlow.session ?? null
  }, [displaySessions, selectedSessionId, memberFlow.session])

  const qrAccessUrl = useMemo(() => {
    if (!isClient) return `https://tsvboxgym.de/?${QR_ACCESS_PARAM}=${encodeURIComponent(QR_ACCESS_TOKEN)}`
    return `${window.location.origin}/?${QR_ACCESS_PARAM}=${encodeURIComponent(QR_ACCESS_TOKEN)}`
  }, [isClient])

  const qrImageUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrAccessUrl)}`
  }, [qrAccessUrl])

  useEffect(() => {
    if (displaySessions.length === 0) return
    const exists = displaySessions.some((s) => s.id === selectedSessionId)
    if (!exists) setSelectedSessionId(displaySessions[0].id)
  }, [displaySessions, selectedSessionId])

  useEffect(() => {
    async function loadTodayFromDb() {
      try {
        const rows = ((await getTodayCheckins(liveDate)) as CheckinRow[]) || []
        setDbCheckins(rows)
      } catch (error) {
        console.error("Fehler beim Laden der Check-ins:", error)
      }
    }

    if (isClient) loadTodayFromDb()
  }, [liveDate, isClient])

  const totalPresent = dbCheckins.length
  const trialPresent = dbCheckins.filter((entry) => entry.members?.is_trial).length
  const membersPresent = totalPresent - trialPresent

  const currentGroupCount = useMemo(() => {
    const group = selectedSession?.group
    if (!group) return 0
    return dbCheckins.filter((entry) => entry.group_name === group).length
  }, [dbCheckins, selectedSession])

  const groupStats = useMemo(() => {
    const counts = new Map<string, { count: number; trial: number; members: number }>()

    for (const row of dbCheckins) {
      const current = counts.get(row.group_name) ?? { count: 0, trial: 0, members: 0 }
      current.count += 1
      if (row.members?.is_trial) current.trial += 1
      else current.members += 1
      counts.set(row.group_name, current)
    }

    return Array.from(counts.entries())
      .map(([group, values]) => ({ group, ...values }))
      .sort((a, b) => a.group.localeCompare(b.group))
  }, [dbCheckins])

  const filteredTrainerRows = useMemo(() => {
    return dbCheckins.filter((entry) => {
      const matchesGroup =
        trainerGroupFilter === "alle" || entry.group_name === trainerGroupFilter

      const matchesType =
        trainerTypeFilter === "alle" ||
        (trainerTypeFilter === "mitglied" && !entry.members?.is_trial) ||
        (trainerTypeFilter === "probetraining" && !!entry.members?.is_trial)

      const fullName = getMemberDisplayName(entry.members)
      const matchesName =
        trainerNameFilter.trim() === "" ||
        fullName.toLowerCase().includes(trainerNameFilter.trim().toLowerCase())

      return matchesGroup && matchesType && matchesName
    })
  }, [dbCheckins, trainerGroupFilter, trainerTypeFilter, trainerNameFilter])

  async function refreshAdminLists() {
    const [pending, members] = await Promise.all([getPendingMembers(), getAllMembers()])
    setPendingMembers(pending as MemberRecord[])
    setAllMembers(members as MemberRecord[])
  }

  function togglePanelWithQrAccess(panel: "member" | "trial") {
    if (!qrAccessGranted) {
      alert("Zugang nur über den QR-Code im BoxGym möglich.")
      return
    }

    setOpenPanel(openPanel === panel ? null : panel)
  }

  function toggleFreePanel(panel: "register" | "area") {
    setOpenPanel(openPanel === panel ? null : panel)
  }

  async function handleMemberCheckin() {
    const firstName = memberFirstName.trim()
    const lastName = memberLastName.trim()
    const pin = memberPin.trim()

    if (!firstName || !lastName) {
      alert("Bitte Vorname und Nachname eingeben.")
      return
    }

    if (!PIN_REGEX.test(pin)) {
      alert("Der PIN muss genau 6-stellig sein und darf nur Buchstaben und Zahlen enthalten.")
      return
    }


    if (!selectedSession || !memberFlow.canCheckin) {
      alert("Check-in ist für diese Gruppe aktuell nicht möglich.")
      return
    }

    try {
      setDbLoading(true)

      const member = await findMemberByFirstLastAndPin(firstName, lastName, pin)

      if (!member) {
        alert("Mitglied nicht gefunden oder PIN nicht korrekt.")
        return
      }

      if (!member.email_verified) {
        alert("E-Mail noch nicht bestätigt. Bitte zuerst den Bestätigungslink öffnen.")
        return
      }

      const { data: existingMemberCheckins, error: existingMemberCheckinsError } = await supabase
        .from("checkins")
        .select("id")
        .eq("member_id", member.id)

      if (existingMemberCheckinsError) throw existingMemberCheckinsError

      const existingCheckinCount = existingMemberCheckins?.length ?? 0

      if (member.is_trial && existingCheckinCount >= 3) {
        alert("Probemitglieder können maximal 3 Trainingseinheiten absolvieren.")
        return
      }

      if (!member.is_trial && !member.is_approved && existingCheckinCount >= 6) {
        alert("Ohne Admin-Freigabe sind maximal 6 Trainingseinheiten möglich. Bitte Trainer oder Admin ansprechen.")
        return
      }


      await createCheckin({
        member_id: member.id,
        group_name: selectedSession.group,
        date: liveDate,
        time: timeString(),
        year: currentYear,
        month_key: currentMonthKey,
      })

      const rows = ((await getTodayCheckins(liveDate)) as CheckinRow[]) || []
      setDbCheckins(rows)

      const sameGroupRows = rows.filter((entry) => entry.group_name === selectedSession.group)
      setLastCheckinPosition(sameGroupRows.length)

      alert("Check-in erfolgreich gespeichert.")
    } catch (error) {
      console.error(error)
      alert("Fehler beim Speichern des Check-ins.")
    } finally {
      setDbLoading(false)
    }
  }

  async function handleTrialCheckin() {
    const firstName = trialFirstName.trim()
    const lastName = trialLastName.trim()

    if (!firstName || !lastName) {
      alert("Bitte Vorname und Nachname eingeben.")
      return
    }

    if (!trialBirthDate) {
      alert("Bitte Geburtsdatum angeben.")
      return
    }

    if (!trialEmail.trim()) {
      alert("Bitte E-Mail angeben.")
      return
    }

    if (!trialPhone.trim()) {
      alert("Bitte Telefonnummer angeben.")
      return
    }

    if (!selectedSession || !memberFlow.canCheckin) {
      alert("Check-in ist für diese Gruppe aktuell nicht möglich.")
      return
    }

    try {
      setDbLoading(true)

      let member = await findMemberByFirstLastAndBirthdate(firstName, lastName, trialBirthDate)

      if (!member) {
        member = await createMember({
          first_name: firstName,
          last_name: lastName,
          birthdate: trialBirthDate,
          email: trialEmail.trim(),
          phone: trialPhone.trim(),
          is_trial: true,
          is_approved: true,
          base_group: selectedSession.group,
        })
      } else {
        const nextTrialCount = (member.trial_count || 0) + 1

        if (nextTrialCount > 3) {
          alert("Probetraining erschöpft. Diese Person hat bereits 3 Probetrainings absolviert.")
          return
        }

        member = await updateTrialMember(member.id, nextTrialCount, trialEmail.trim(), trialPhone.trim())
      }


      await createCheckin({
        member_id: member.id,
        group_name: selectedSession.group,
        date: liveDate,
        time: timeString(),
        year: currentYear,
        month_key: currentMonthKey,
      })

      const rows = ((await getTodayCheckins(liveDate)) as CheckinRow[]) || []
      setDbCheckins(rows)

      setTrialFirstName("")
      setTrialLastName("")
      setTrialBirthDate("")
      setTrialEmail("")
      setTrialPhone("")

      alert("Probetraining erfolgreich angemeldet.")
    } catch (error) {
      console.error(error)
      alert("Fehler beim Speichern des Probetrainings.")
    } finally {
      setDbLoading(false)
    }
  }

  async function handleMemberRegistration() {
    const firstName = registerFirstName.trim()
    const lastName = registerLastName.trim()
    const pin = registerPin.trim()

    if (!firstName || !lastName) {
      alert("Bitte Vorname und Nachname eingeben.")
      return
    }

    if (!registerBirthDate) {
      alert("Bitte Geburtsdatum angeben.")
      return
    }

    if (!PIN_REGEX.test(pin)) {
      alert("Der PIN muss genau 6-stellig sein und darf nur Buchstaben und Zahlen enthalten.")
      return
    }

    if (!registerEmail.trim()) {
      alert("Bitte E-Mail angeben.")
      return
    }

    if (!registerBaseGroup) {
      alert("Bitte Stammgruppe auswählen.")
      return
    }

    try {
      setDbLoading(true)
      const emailToken = generateEmailVerificationToken()

      const existing = await findMemberByFirstLastAndBirthdate(firstName, lastName, registerBirthDate)
      if (existing && !existing.is_trial) {
        alert("Mitglied existiert bereits.")
        return
      }

      if (existing && existing.is_trial) {
        const { error } = await supabase
          .from("members")
          .update({
            first_name: firstName,
            last_name: lastName,
            name: `${firstName} ${lastName}`.trim(),
            birthdate: registerBirthDate,
            email: registerEmail.trim(),
            phone: registerPhone.trim(),
            is_trial: false,
            member_pin: pin,
            is_approved: false,
            email_verified: false,
            base_group: registerBaseGroup,
            email_verification_token: emailToken,
          })
          .eq("id", existing.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from("members")
          .insert([
            {
              name: `${firstName} ${lastName}`.trim(),
              first_name: firstName,
              last_name: lastName,
              birthdate: registerBirthDate,
              email: registerEmail.trim(),
              phone: registerPhone.trim(),
              is_trial: false,
              member_pin: pin,
              is_approved: false,
              email_verified: false,
              email_verification_token: emailToken,
              base_group: registerBaseGroup,
            },
          ])

        if (error) throw error
      }

      setMemberFirstName(firstName)
      setMemberLastName(lastName)
      setMemberPin(pin)
      setMemberAreaFirstName(firstName)
      setMemberAreaLastName(lastName)
      setMemberAreaPin(pin)
      setRegisterFirstName("")
      setRegisterLastName("")
      setRegisterBirthDate("")
      setRegisterPin("")
      setRegisterEmail("")
      setRegisterPhone("")

      const verificationLink = `${window.location.origin}/?verify=${emailToken}`

      try {
        const response = await fetch("/api/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: registerEmail.trim(),
            name: `${firstName} ${lastName}`,
            link: verificationLink,
          }),
        })

        if (!response.ok) {
          console.error("Mailversand fehlgeschlagen", await response.text())
        }
      } catch (error) {
        console.error("Mailversand fehlgeschlagen", error)
      }

      alert("Registrierung gespeichert.\n\nBitte E-Mail bestätigen.")
    } catch (error) {
      console.error(error)
      alert("Fehler beim Anlegen des Mitglieds.")
    } finally {
      setDbLoading(false)
    }
  }

  async function loadMemberArea() {
    const firstName = memberAreaFirstName.trim()
    const lastName = memberAreaLastName.trim()
    const pin = memberAreaPin.trim()

    if (!firstName || !lastName || !pin) {
      alert("Bitte Vorname, Nachname und PIN eingeben.")
      return
    }

    if (!PIN_REGEX.test(pin)) {
      alert("Der PIN muss genau 6-stellig sein und darf nur Buchstaben und Zahlen enthalten.")
      return
    }

    try {
      const member = (await findMemberByFirstLastAndPin(firstName, lastName, pin)) as MemberRecord | null

      if (!member) {
        alert("Mitglied nicht gefunden oder PIN nicht korrekt.")
        return
      }

      const previousMonthKey = getPreviousMonthKey(currentMonthKey)

      const [{ data: monthRows }, { data: previousMonthRows }, { data: yearRows }, { data: allRows }, { data: lastRow }] =
        await Promise.all([
          supabase.from("checkins").select("*").eq("member_id", member.id).eq("month_key", currentMonthKey),
          supabase.from("checkins").select("*").eq("member_id", member.id).eq("month_key", previousMonthKey),
          supabase.from("checkins").select("*").eq("member_id", member.id).eq("year", currentYear),
          supabase.from("checkins").select("date").eq("member_id", member.id).order("date", { ascending: false }),
          supabase
            .from("checkins")
            .select("*")
            .eq("member_id", member.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])

      setPersonalMonthVisits(monthRows?.length ?? 0)
      setPreviousMonthVisits(previousMonthRows?.length ?? 0)
      setPersonalYearVisits(yearRows?.length ?? 0)
      setPersonalLastCheckin((lastRow as CheckinRow | null) ?? null)
      setTrainingStreak(calculateTrainingStreak((allRows as Array<{ date: string }>) ?? []))
      setMemberAreaData(member)
      setProfileEmail(member.email || "")
      setProfilePhone(member.phone || "")

      if (member.base_group) {
        const { data: baseGroupRows } = await supabase
          .from("checkins")
          .select("member_id")
          .eq("group_name", member.base_group)
          .eq("month_key", currentMonthKey)

        const myBaseGroupVisits = (baseGroupRows || []).filter((row) => row.member_id === member.id).length
        setBaseGroupMonthVisits(myBaseGroupVisits)

        const countsMap = new Map<string, number>()
        for (const row of baseGroupRows || []) {
          countsMap.set(row.member_id, (countsMap.get(row.member_id) || 0) + 1)
        }

        const sorted = Array.from(countsMap.entries()).sort((a, b) => b[1] - a[1])
        const myIndex = sorted.findIndex(([id]) => id === member.id)
        setBaseGroupPosition(myIndex >= 0 ? myIndex + 1 : null)
        setBaseGroupBestMonthVisits(sorted.length > 0 ? sorted[0][1] : 0)
      } else {
        setBaseGroupMonthVisits(0)
        setBaseGroupPosition(null)
        setBaseGroupBestMonthVisits(0)
      }

      setMemberAreaUnlocked(true)
    } catch (error) {
      console.error(error)
      alert("Fehler beim Laden des Mitgliederbereichs.")
    }
  }

  function openTrainerLogin() {
    setShowTrainerLogin(true)
    setTrainerPinInput("")
  }

  async function handleTrainerLogin() {
    if (trainerPinInput === trainerPin || trainerPinInput === ADMIN_PASSWORD) {
      const sessionUntil = Date.now() + TRAINER_SESSION_MINUTES * 60 * 1000
      setTrainerSessionUntil(sessionUntil)
      setTrainerMode(true)
      setAdminMode(trainerPinInput === ADMIN_PASSWORD)
      setShowTrainerLogin(false)
      setTrainerPinInput("")
      

      if (trainerPinInput === ADMIN_PASSWORD) {
        try {
          await refreshAdminLists()
        } catch (error) {
          console.error(error)
        }
      }
      return
    }

    alert("PIN nicht korrekt.")
  }

  function handleTrainerLogout() {
    setTrainerMode(false)
    setAdminMode(false)
    setPendingMembers([])
    setAllMembers([])
    setTrainerSessionUntil(0)
    setShowTrainerLogin(false)
    setTrainerPinInput("")
  }

  return (
    <div className={`min-h-screen ${brand.light} text-zinc-900`}>
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="rounded-2xl bg-[#154c83] px-4 py-2 text-sm font-semibold text-white">
              Startseite
            </div>

            {trainerMode ? (
              <Button variant="outline" className="rounded-2xl" onClick={handleTrainerLogout}>
                <Settings className="mr-2 h-4 w-4" />
                {adminMode ? "Admin abmelden" : "Trainer abmelden"}
              </Button>
            ) : (
              <Button variant="outline" className="rounded-2xl" onClick={openTrainerLogin}>
                <Lock className="mr-2 h-4 w-4" />
                Trainerzugang
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <span className="capitalize">{now ? now.toLocaleDateString("de-DE", { weekday: "long" }) : "—"}</span>
            <span>·</span>
            <span>{liveDateString(now)}</span>
            <span>·</span>
            <span>{liveTimeString(now)}</span>
          </div>
        </div>

        {showTrainerLogin && (
          <div className="mb-6 rounded-[24px] border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#154c83]" />
              <div className="font-semibold">Trainerbereich entsperren</div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
              <div className="space-y-2">
                <Label>Trainer- oder Admin-Passwort</Label>
                <Input
                  type="password"
                  value={trainerPinInput}
                  onChange={(e) => setTrainerPinInput(e.target.value)}
                  placeholder="Passwort eingeben"
                  className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                />
              </div>

              <Button
                className={`${brand.primary} rounded-2xl text-white hover:bg-[#123d69]`}
                onClick={handleTrainerLogin}
              >
                Entsperren
              </Button>

              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => {
                  setShowTrainerLogin(false)
                  setTrainerPinInput("")
                }}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        )}

        <div className="mb-6 overflow-hidden rounded-[28px] shadow-xl">
          <div className={`${brand.dark} relative px-6 py-8 text-white md:px-8`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(230,51,42,0.25),transparent_35%)]" />
            <div className="relative grid gap-6 md:grid-cols-[1.6fr_1fr] md:items-center">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm">
                  <ShieldCheck className="h-4 w-4" />
                  TSV Falkensee · BoxGym Check-in
                </div>

                <div className="flex items-center gap-4">
                  <img
                    src="/BoxGym Kompakt.png"
                    alt="TSV Falkensee BoxGym"
                    className="h-32 w-auto rounded-md bg-white/90 p-1"
                  />
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                      TSV BoxGym Check-in
                    </h1>
                    <div className="mt-3 inline-flex items-center gap-3 rounded-xl bg-yellow-400 px-4 py-2 text-base font-bold text-black shadow-lg">
                      <span>🚧</span>
                      <span>TESTPHASE – SYSTEM WIRD GETESTET</span>
                    </div>
                  </div>
                </div>
              </div>

              <Card className="rounded-[24px] border-white/10 bg-white/5 text-white shadow-none backdrop-blur">
                <CardContent className="p-5">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-white/10 p-3">
                      <div className="text-zinc-300">Trainingstag</div>
                      <div className="mt-1 font-semibold">{displayedTrainingDate}</div>
                    </div>
                    <div className="rounded-2xl bg-white/10 p-3">
                      <div className="text-zinc-300">Läuft gerade</div>
                      <div className="mt-1 font-semibold">{memberFlow.session?.group ?? "Keine aktive Gruppe"}</div>
                    </div>
                    <div className="rounded-2xl bg-white/10 p-3">
                      <div className="text-zinc-300">Zeitraum</div>
                      <div className="mt-1 font-semibold">
                        {memberFlow.session ? `${memberFlow.session.start} – ${memberFlow.session.end}` : "—"}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/10 p-3">
                      <div className="text-zinc-300">Nächste Einheit</div>
                      <div className="mt-1 font-semibold">{memberFlow.nextSession?.group ?? "Keine weitere Gruppe"}</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-2xl bg-white/10 p-3 text-sm">
                    <div className="text-zinc-300">Status</div>
                    <div className="mt-1 font-semibold">{memberFlow.statusText}</div>
                    <div className="mt-1 text-zinc-300">
                      Nächster Zeitraum: {memberFlow.nextSession ? `${memberFlow.nextSession.start} – ${memberFlow.nextSession.end}` : "—"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {!qrAccessGranted && (
          <div className="mb-6 rounded-[24px] border border-yellow-300 bg-yellow-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🚧</div>
              <div>
                <div className="font-semibold text-zinc-900">Mitglieder-Check-in und Probetraining nur per QR-Code</div>
                <div className="mt-1 text-sm text-zinc-700">
                  Der Zugang zu Mitglieder-Check-in und Probetraining ist nur nach dem Öffnen dieser Seite über den QR-Code im BoxGym möglich. Mitglied registrieren und Mein Bereich bleiben frei zugänglich.
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Button
              variant="outline"
              className="h-24 justify-start rounded-[24px] border-2 bg-white px-6 text-left shadow-sm hover:bg-zinc-50"
              onClick={() => togglePanelWithQrAccess("member")}
            >
              <div className="flex items-center gap-4">
                <Users className="h-6 w-6 text-[#154c83]" />
                <div className="text-base font-semibold text-zinc-900">Mitglieder-Check-in</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-24 justify-start rounded-[24px] border-2 bg-white px-6 text-left shadow-sm hover:bg-zinc-50"
              onClick={() => togglePanelWithQrAccess("trial")}
            >
              <div className="flex items-center gap-4">
                <UserPlus className="h-6 w-6 text-[#e6332a]" />
                <div className="text-base font-semibold text-zinc-900">Probetraining</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-24 justify-start rounded-[24px] border-2 bg-white px-6 text-left shadow-sm hover:bg-zinc-50"
              onClick={() => toggleFreePanel("register")}
            >
              <div className="flex items-center gap-4">
                <UserRoundPlus className="h-6 w-6 text-[#154c83]" />
                <div className="text-base font-semibold text-zinc-900">Mitglied registrieren</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-24 justify-start rounded-[24px] border-2 bg-white px-6 text-left shadow-sm hover:bg-zinc-50"
              onClick={() => toggleFreePanel("area")}
            >
              <div className="flex items-center gap-4">
                <UserCircle2 className="h-6 w-6 text-[#154c83]" />
                <div className="text-base font-semibold text-zinc-900">Mein Bereich</div>
              </div>
            </Button>
          </div>

          {qrAccessGranted && openPanel === "member" && (
            <Card className="rounded-[24px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Mitglieder-Check-in</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Vorname</Label>
                    <Input
                      value={memberFirstName}
                      onChange={(e) => setMemberFirstName(e.target.value)}
                      placeholder="Vorname"
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nachname</Label>
                    <Input
                      value={memberLastName}
                      onChange={(e) => setMemberLastName(e.target.value)}
                      placeholder="Nachname"
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>PIN (6-stellig)</Label>
                  <Input
                    value={memberPin}
                    onChange={(e) => setMemberPin(e.target.value)}
                    placeholder="z. B. A3X9Q1"
                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Trainingsgruppe</Label>
                  <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                    <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {displaySessions.length === 0 ? (
                        <SelectItem value="none" disabled>
                          Keine Gruppen verfügbar
                        </SelectItem>
                      ) : (
                        displaySessions.map((session) => (
                          <SelectItem key={session.id} value={session.id}>
                            {session.title}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className={`${brand.primary} w-full rounded-2xl text-white hover:bg-[#123d69]`}
                  onClick={handleMemberCheckin}
                  disabled={dbLoading || !selectedSession || !memberFlow.canCheckin}
                >
                  {dbLoading ? "Speichert..." : "Mitglied einchecken"}
                </Button>

                {lastCheckinPosition && selectedSession && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                    Deine Position heute in der Gruppe: <span className="font-semibold">{lastCheckinPosition}</span> von{" "}
                    <span className="font-semibold">{currentGroupCount}</span>.
                  </div>
                )}
              </CardContent>
            </Card>

          )}

        {qrAccessGranted && openPanel === "trial" && (
            <Card className="rounded-[24px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Probetraining</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Vorname</Label>
                    <Input
                      value={trialFirstName}
                      onChange={(e) => setTrialFirstName(e.target.value)}
                      placeholder="Vorname"
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nachname</Label>
                    <Input
                      value={trialLastName}
                      onChange={(e) => setTrialLastName(e.target.value)}
                      placeholder="Nachname"
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Geburtsdatum</Label>
                  <Input
                    type="date"
                    value={trialBirthDate}
                    onChange={(e) => setTrialBirthDate(e.target.value)}
                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label>E-Mail</Label>
                  <Input
                    type="email"
                    value={trialEmail}
                    onChange={(e) => setTrialEmail(e.target.value)}
                    placeholder="E-Mail"
                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Telefonnummer</Label>
                  <Input
                    value={trialPhone}
                    onChange={(e) => setTrialPhone(e.target.value)}
                    placeholder="Telefonnummer"
                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                </div>

                <Button
                  className="w-full rounded-2xl"
                  onClick={handleTrialCheckin}
                  disabled={dbLoading || !selectedSession || !memberFlow.canCheckin}
                >
                  {dbLoading ? "Speichert..." : "Probetraining anmelden"}
                </Button>
              </CardContent>
            </Card>
          )}

          {openPanel === "register" && (
            <Card className="rounded-[24px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Mitglied registrieren</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-zinc-500">
                  Neues Mitglied anlegen. Die Stammgruppe ist Grundlage für die Besuchsauswertung.
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Vorname</Label>
                    <Input
                      value={registerFirstName}
                      onChange={(e) => setRegisterFirstName(e.target.value)}
                      placeholder="Vorname"
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nachname</Label>
                    <Input
                      value={registerLastName}
                      onChange={(e) => setRegisterLastName(e.target.value)}
                      placeholder="Nachname"
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Geburtsdatum</Label>
                  <Input
                    type="date"
                    value={registerBirthDate}
                    onChange={(e) => setRegisterBirthDate(e.target.value)}
                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Stammgruppe</Label>
                  <Select value={registerBaseGroup} onValueChange={setRegisterBaseGroup}>
                    <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                      <SelectValue placeholder="Gruppe auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupOptions.map((group) => (
                        <SelectItem key={group} value={group}>
                          {group}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>PIN (6-stellig)</Label>
                  <Input
                    value={registerPin}
                    onChange={(e) => setRegisterPin(e.target.value)}
                    placeholder="z. B. A3X9Q1"
                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label>E-Mail</Label>
                  <Input
                    type="email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    placeholder="E-Mail"
                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Telefonnummer (freiwillig)</Label>
                  <Input
                    value={registerPhone}
                    onChange={(e) => setRegisterPhone(e.target.value)}
                    placeholder="Telefonnummer"
                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                </div>

                <Button
                  className={`${brand.primary} w-full rounded-2xl text-white hover:bg-[#123d69]`}
                  onClick={handleMemberRegistration}
                  disabled={dbLoading}
                >
                  {dbLoading ? "Speichert..." : "Mitglied registrieren"}
                </Button>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  Nach der Registrierung muss zuerst die E-Mail bestätigt werden. Erst danach ist die Freigabe durch den Admin möglich.
                </div>
                <div className="text-xs text-zinc-500">
                  In der Testphase wird der Bestätigungs-Link nach der Registrierung direkt angezeigt und kann sofort geöffnet werden.
                </div>
              </CardContent>
            </Card>
          )}

          {openPanel === "area" && (
            <Card className="rounded-[24px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Mein Bereich</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Vorname</Label>
                    <Input
                      value={memberAreaFirstName}
                      onChange={(e) => setMemberAreaFirstName(e.target.value)}
                      placeholder="Vorname"
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nachname</Label>
                    <Input
                      value={memberAreaLastName}
                      onChange={(e) => setMemberAreaLastName(e.target.value)}
                      placeholder="Nachname"
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>PIN (6-stellig)</Label>
                  <Input
                    value={memberAreaPin}
                    onChange={(e) => setMemberAreaPin(e.target.value)}
                    placeholder="z. B. A3X9Q1"
                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    className={`${brand.primary} rounded-2xl text-white hover:bg-[#123d69]`}
                    onClick={loadMemberArea}
                  >
                    Mitgliederbereich öffnen
                  </Button>

                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => {
                      setMemberAreaUnlocked(false)
                      setMemberAreaData(null)
                    }}
                  >
                    Schließen
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {memberAreaUnlocked && memberAreaData && (
          <Card className="mt-6 rounded-[24px] border-0 shadow-sm">
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
                E-Mail-Status: {memberAreaData.email_verified ? (
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
                Admin-Status: {memberAreaData.is_approved ? (
                  <span className="font-semibold text-green-600">freigegeben</span>
                ) : (
                  <span className="font-semibold text-amber-600">noch nicht freigegeben</span>
                )}
              </div>
              {!memberAreaData.is_approved && memberAreaData.email_verified && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                  Deine E-Mail wurde bestätigt. Die finale Freigabe durch den Admin steht noch aus.
                </div>
              )}
              {memberAreaData.is_approved && memberAreaData.email_verified && (
                <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                  Dein Konto ist vollständig freigegeben. Der Check-in ist jetzt möglich.
                </div>
              )}
              {!memberAreaData.email_verified && !memberAreaData.is_approved && (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                  Status: Registrierung abgeschlossen. Als Nächstes muss zuerst die E-Mail bestätigt werden.
                </div>
              )}
              {!memberAreaData.email_verified && memberAreaData.email && (
                <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-700">
                  Bestätigungsadresse: <span className="font-semibold">{memberAreaData.email}</span>
                </div>
              )}
              {!memberAreaData.email_verified && memberAreaData.email && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                  Bitte Posteingang und Spam-Ordner prüfen und anschließend den Bestätigungslink öffnen.
                </div>
              )}
              {!memberAreaData.email_verified && !memberAreaData.email && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  Für dieses Konto ist aktuell keine E-Mail-Adresse hinterlegt. Eine Bestätigung ist so nicht möglich.
                </div>
              )}
              {!memberAreaData.email_verified && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                  Bitte zuerst den Bestätigungslink aus der Registrierung öffnen. Erst danach ist die Freigabe durch den Admin möglich.
                </div>
              )}
              {memberAreaData.is_trial && !memberAreaData.is_approved && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                  Probemitglieder können maximal 3 Trainingseinheiten absolvieren.
                  {typeof personalMonthVisits === "number" && (
                    <div className="mt-1">
                      Verbleibend: <span className="font-semibold">{Math.max(0, 3 - personalMonthVisits)}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-700">
                Stammgruppe: <span className="font-semibold">{memberAreaData.base_group || "Nicht festgelegt"}</span>
                {baseGroupPosition ? (
                  <>
                    {" "}· Position in deiner Gruppe diesen Monat: <span className="font-semibold">{baseGroupPosition}</span>
                  </>
                ) : null}
              </div>

              <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-700">
                Gruppenbester diesen Monat:{" "}
                <span className="font-semibold">
                  {baseGroupBestMonthVisits > 0 ? `${baseGroupBestMonthVisits} Einheiten` : "Noch keine Einheiten"}
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
                <div className="mb-4 font-semibold text-zinc-900">Meine Kontaktdaten</div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>E-Mail</Label>
                    <Input
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      placeholder="E-Mail"
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Telefonnummer</Label>
                    <Input
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      placeholder="Telefonnummer"
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <Button
                    className={`${brand.primary} rounded-2xl text-white hover:bg-[#123d69]`}
                    onClick={async () => {
                      if (!memberAreaData?.id) return
                      if (!profileEmail.trim()) {
                        alert("Bitte eine E-Mail-Adresse angeben.")
                        return
                      }

                      try {
                        const updated = await updateMemberProfile(memberAreaData.id, {
                          email: profileEmail.trim(),
                          phone: profilePhone.trim(),
                        })

                        setMemberAreaData(updated as MemberRecord)
                        alert("Kontaktdaten gespeichert.")
                      } catch (error) {
                        console.error(error)
                        alert("Fehler beim Speichern der Kontaktdaten.")
                      }
                    }}
                  >
                    Kontaktdaten speichern
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

        )}

        {trainerMode && (
          <div className="mt-6 space-y-6">
            {adminMode && (
              <>
                <Card className="rounded-[24px] border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle>QR-Code für BoxGym-Zugang</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-zinc-800">
                      Dieser QR-Code öffnet den geschützten Zugang für Mitglieder-Check-in und Probetraining im BoxGym.
                    </div>

                    <div id="qr-print-area" className="flex flex-col gap-6 lg:flex-row lg:items-start rounded-[24px] bg-white p-4 print:block print:rounded-none print:p-0">
                      <div className="rounded-[24px] border bg-white p-4 shadow-sm print:border-0 print:p-0 print:shadow-none">
                        <div className="mb-4 hidden items-center gap-4 print:flex">
                          <img
                            src="/BoxGym Kompakt.png"
                            alt="TSV Falkensee BoxGym"
                            className="h-20 w-auto"
                          />
                          <div>
                            <div className="text-2xl font-bold text-zinc-900">TSV BoxGym</div>
                            <div className="text-base font-semibold text-zinc-700">Check-in</div>
                          </div>
                        </div>
                        <img
                          src={qrImageUrl}
                          alt="QR-Code BoxGym Zugang"
                          className="h-64 w-64 rounded-xl"
                        />
                      </div>

                      <div className="flex-1 space-y-3 print:mt-6">
                        <div className="hidden rounded-2xl border border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-800 print:block">
                          QR-Code scannen und direkt zum geschützten TSV BoxGym Check-in gelangen.
                        </div>
                        <div className="rounded-2xl bg-zinc-100 p-4 text-sm break-all text-zinc-800">
                          {qrAccessUrl}
                        </div>
                        <div className="text-[11px] text-zinc-400">Nur in der Testphase sichtbar.</div>

                        <div className="flex flex-wrap gap-3 print:hidden">
                          <Button
                            className={`${brand.primary} rounded-2xl text-white hover:bg-[#123d69]`}
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(qrAccessUrl)
                                alert("QR-Link kopiert.")
                              } catch (error) {
                                console.error(error)
                                alert("QR-Link konnte nicht kopiert werden.")
                              }
                            }}
                          >
                            QR-Link kopieren
                          </Button>

                          <Button
                            variant="outline"
                            className="rounded-2xl"
                            onClick={() => window.open(qrAccessUrl, "_blank")}
                          >
                            Link testen
                          </Button>
                          <Button
                            variant="outline"
                            className="rounded-2xl"
                            onClick={() => window.print()}
                          >
                            Drucken
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-[24px] border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle>Offene Freigaben</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pendingMembers.length === 0 ? (
                      <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">
                        Keine offenen Mitgliedsfreigaben.
                      </div>
                    ) : (
                      pendingMembers.map((member) => (
                        <div key={member.id} className="rounded-2xl border bg-white p-4">
                          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end">
                            <div className="space-y-1 text-sm">
                              <div className="font-semibold text-zinc-900">{getMemberDisplayName(member)}</div>
                              <div className="text-zinc-600">Geburtsdatum: {member.birthdate || "—"}</div>
                              <div className="text-zinc-600">E-Mail: {member.email || "—"}</div>
                              <div className="text-zinc-600">E-Mail bestätigt: {member.email_verified ? "Ja" : "Nein"}</div>
                              {!member.email_verified && (
                                <div className="text-amber-600">Wartet auf E-Mail-Bestätigung</div>
                              )}
                              {member.email_verified && (
                                <div className="text-green-600">Bereit für Admin-Freigabe</div>
                              )}
                              {!member.is_approved && member.email_verified && (
                                <div className="text-xs text-blue-600">Admin-Freigabe steht noch aus</div>
                              )}
                              {member.email_verified_at && (
                                <div className="text-zinc-500 text-xs">
                                  Bestätigt am: {new Date(member.email_verified_at).toLocaleString("de-DE")}
                                </div>
                              )}
                              <div className="text-zinc-600">Telefon: {member.phone || "—"}</div>
                              {member.is_trial ? (
                                <div className="text-amber-600">Status: Probemitglied · max. 3 Einheiten</div>
                              ) : !member.is_approved ? (
                                <div className="text-blue-600">Status: registriert · max. 6 Einheiten bis Freigabe</div>
                              ) : null}
                              {(() => {
                                const used = dbCheckins.filter((row) => row.member_id === member.id).length
                                const limit = member.is_trial ? 3 : !member.is_approved ? 6 : null

                                let color = "text-zinc-500"
                                if (limit !== null) {
                                  if (used >= limit) color = "text-red-600 font-semibold"
                                  else if (used >= limit - 1) color = "text-amber-600 font-semibold"
                                }

                                return (
                                  <div className={`text-xs ${color}`}>
                                    Bisher genutzt: {used}{limit !== null ? ` / ${limit}` : ""}
                                  </div>
                                )
                              })()}
                              {(() => {
                                const used = dbCheckins.filter((row) => row.member_id === member.id).length
                                const limit = member.is_trial ? 3 : !member.is_approved ? 6 : null
                                const remaining = limit !== null ? Math.max(0, limit - used) : null

                                let color = "text-zinc-500"
                                if (remaining !== null) {
                                  if (remaining === 0) color = "text-red-600 font-semibold"
                                  else if (remaining === 1) color = "text-amber-600 font-semibold"
                                }

                                return limit !== null ? (
                                  <div className={`text-xs ${color}`}>
                                    Verbleibend: <span className="font-semibold">{remaining}</span>
                                  </div>
                                ) : null
                              })()}
                              {member.is_trial ? (
                                <div className="text-xs text-amber-700">Freigabe ist nach dem Probetraining möglich, aber nicht sofort zwingend.</div>
                              ) : !member.is_approved ? (
                                <div className="text-xs text-blue-700">Spätestens vor der 7. Einheit sollte die Admin-Freigabe erfolgen.</div>
                              ) : null}
                              {!member.is_approved && (
                                <div className="text-xs text-zinc-500">Check-in-Limit wird automatisch beim Einchecken geprüft.</div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <Label>Stammgruppe</Label>
                              <Select
                                value={adminGroupDrafts[member.id] ?? member.base_group ?? groupOptions[0] ?? ""}
                                onValueChange={(value) =>
                                  setAdminGroupDrafts((prev) => ({ ...prev, [member.id]: value }))
                                }
                              >
                                <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {groupOptions.map((group) => (
                                    <SelectItem key={group} value={group}>
                                      {group}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>Neue PIN</Label>
                              <Input
                                value={adminPinDrafts[member.id] ?? ""}
                                onChange={(e) =>
                                  setAdminPinDrafts((prev) => ({ ...prev, [member.id]: e.target.value }))
                                }
                                placeholder="optional"
                                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                              />
                            </div>

                            <Button
                              className={`${brand.primary} rounded-2xl text-white hover:bg-[#123d69]`}
                              disabled={!member.email_verified}
                              onClick={async () => {
                                try {
                                  if (!member.email_verified) {
                                    alert("❌ E-Mail nicht bestätigt.\n\nMitglied muss zuerst den Bestätigungslink öffnen.")
                                    return
                                  }
                                  const newGroup = adminGroupDrafts[member.id] ?? member.base_group ?? groupOptions[0] ?? ""
                                  if (newGroup) await changeMemberBaseGroup(member.id, newGroup)

                                  const newPin = adminPinDrafts[member.id]?.trim()
                                  if (newPin) {
                                    if (!PIN_REGEX.test(newPin)) {
                                      alert("Neue PIN muss genau 6-stellig sein.")
                                      return
                                    }
                                    await resetMemberPin(member.id, newPin)
                                  }

                                  await approveMember(member.id)
                                  await refreshAdminLists()
                                  alert("Mitglied bestätigt.")
                                } catch (error) {
                                  console.error(error)
                                  alert("Fehler bei der Bestätigung.")
                                }
                              }}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              {member.email_verified ? "Freigeben" : "Wartet auf E-Mail"}
                            </Button>
                            {/* Test: Kopieren des E-Mail-Bestätigungs-Links */}
                            {!member.email_verified && member.email && (
                              <div className="text-xs text-zinc-500">
                                Bestätigung wird an: {member.email}
                              </div>
                            )}
                            {/* TESTPHASE: Zeige Bestätigungslink */}
                            {!member.email_verified && member.email_verification_token && (
                              <div className="mt-2 space-y-2">
                                <div className="text-xs text-zinc-500">Testlink (manuell öffnen):</div>
                                <div className="rounded-xl bg-zinc-100 p-2 text-xs break-all">
                                  {`${typeof window !== "undefined" ? window.location.origin : ""}/?verify=${member.email_verification_token}`}
                                </div>
                              </div>
                            )}
                            {!member.email_verified && !member.email && (
                              <div className="text-xs text-red-600">
                                Keine E-Mail-Adresse hinterlegt
                              </div>
                            )}
                            {!member.email_verified && member.email_verification_token && (
                              <div className="text-xs text-green-700">
                                Bestätigungs-Token vorhanden
                              </div>
                            )}
                            {!member.email_verified && member.email_verification_token && (
                              <Button
                                variant="outline"
                                className="rounded-2xl"
                                disabled={!member.email || !member.email_verification_token}
                                onClick={async () => {
                                  try {
                                    const verificationLink = `${window.location.origin}/?verify=${member.email_verification_token}`
                                    await navigator.clipboard.writeText(verificationLink)
                                    alert("Bestätigungs-Link kopiert.")
                                  } catch (error) {
                                    console.error(error)
                                    alert("Bestätigungs-Link konnte nicht kopiert werden.")
                                  }
                                }}
                              >
                                Bestätigungs-Link kopieren
                              </Button>
                            )}
                            {/* Test: Bestätigungs-Link öffnen */}
                            {!member.email_verified && member.email_verification_token && (
                              <Button
                                variant="outline"
                                className="rounded-2xl"
                                onClick={() => {
                                  const verificationLink = `${window.location.origin}/?verify=${member.email_verification_token}`
                                  window.open(verificationLink, "_blank")
                                }}
                              >
                                Bestätigungs-Link öffnen
                              </Button>
                            )}
                            {!member.email_verified && !member.email_verification_token && (
                              <div className="text-xs text-red-600">
                                Kein Bestätigungs-Token vorhanden
                              </div>
                            )}
                            {member.email_verified && (
                              <div className="text-xs text-green-700">
                                Bestätigungs-Link nicht mehr erforderlich
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-[24px] border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle>Mitgliederverwaltung</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {allMembers.length === 0 ? (
                      <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">
                        Keine Mitglieder vorhanden.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Vorname</TableHead>
                            <TableHead>Nachname</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Gruppe</TableHead>
                            <TableHead>PIN</TableHead>
                            <TableHead>Aktionen</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>

                          {allMembers.map((member) => (
                            <TableRow key={member.id}>
                              <TableCell className="font-medium">{getMemberDisplayName(member)}</TableCell>

                              <TableCell>
                                <Input
                                  value={adminFirstNameDrafts[member.id] ?? member.first_name ?? ""}
                                  onChange={(e) =>
                                    setAdminFirstNameDrafts((prev) => ({ ...prev, [member.id]: e.target.value }))
                                  }
                                  placeholder="Vorname"
                                  className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                />
                              </TableCell>

                              <TableCell>
                                <Input
                                  value={adminLastNameDrafts[member.id] ?? member.last_name ?? ""}
                                  onChange={(e) =>
                                    setAdminLastNameDrafts((prev) => ({ ...prev, [member.id]: e.target.value }))
                                  }
                                  placeholder="Nachname"
                                  className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                />
                              </TableCell>

                              <TableCell>{member.is_approved ? "Bestätigt" : "Probemitglied"}</TableCell>

                              <TableCell className="min-w-[220px]">
                                <Select
                                  value={adminGroupDrafts[member.id] ?? member.base_group ?? groupOptions[0] ?? ""}
                                  onValueChange={(value) =>
                                    setAdminGroupDrafts((prev) => ({ ...prev, [member.id]: value }))
                                  }
                                >
                                  <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {groupOptions.map((group) => (
                                      <SelectItem key={group} value={group}>
                                        {group}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>

                              <TableCell className="min-w-[160px]">
                                <Input
                                  value={adminPinDrafts[member.id] ?? ""}
                                  onChange={(e) =>
                                    setAdminPinDrafts((prev) => ({ ...prev, [member.id]: e.target.value }))
                                  }
                                  placeholder="6-stellig"
                                  className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                />
                              </TableCell>

                              <TableCell>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    className="rounded-2xl"
                                    onClick={async () => {
                                      try {
                                        const first = (adminFirstNameDrafts[member.id] ?? member.first_name ?? "").trim()
                                        const last = (adminLastNameDrafts[member.id] ?? member.last_name ?? "").trim()
                                        if (!first || !last) {
                                          alert("Vorname und Nachname dürfen nicht leer sein.")
                                          return
                                        }
                                        await updateMemberName(member.id, first, last)
                                        await refreshAdminLists()
                                        alert("Name aktualisiert.")
                                      } catch (error) {
                                        console.error(error)
                                        alert("Fehler beim Ändern des Namens.")
                                      }
                                    }}
                                  >
                                    Name
                                  </Button>

                                  <Button
                                    variant="outline"
                                    className="rounded-2xl"
                                    onClick={async () => {
                                      try {
                                        const newGroup = adminGroupDrafts[member.id] ?? member.base_group ?? groupOptions[0] ?? ""
                                        if (!newGroup) {
                                          alert("Bitte Gruppe auswählen.")
                                          return
                                        }
                                        await changeMemberBaseGroup(member.id, newGroup)
                                        await refreshAdminLists()
                                        alert("Stammgruppe aktualisiert.")
                                      } catch (error) {
                                        console.error(error)
                                        alert("Fehler beim Ändern der Stammgruppe.")
                                      }
                                    }}
                                  >
                                    <RefreshCcw className="mr-2 h-4 w-4" />
                                    Gruppe
                                  </Button>

                                  <Button
                                    className={`${brand.primary} rounded-2xl text-white hover:bg-[#123d69]`}
                                    disabled={!member.email_verified}
                                    onClick={async () => {
                                      try {
                                        const newPin = adminPinDrafts[member.id]?.trim()
                                        if (!newPin) {
                                          alert("Bitte neue PIN eingeben.")
                                          return
                                        }
                                        if (!PIN_REGEX.test(newPin)) {
                                          alert("Neue PIN muss genau 6-stellig sein.")
                                          return
                                        }
                                        await resetMemberPin(member.id, newPin)
                                        setAdminPinDrafts((prev) => ({ ...prev, [member.id]: "" }))
                                        await refreshAdminLists()
                                        alert("PIN zurückgesetzt.")
                                      } catch (error) {
                                        console.error(error)
                                        alert("Fehler beim Zurücksetzen der PIN.")
                                      }
                                    }}
                                  >
                                    PIN speichern
                                  </Button>

                                  <Button
                                    type="button"
                                    variant="destructive"
                                    className="rounded-2xl"
                                    onClick={async () => {
                                      const confirmed = window.confirm(`Mitglied ${getMemberDisplayName(member)} wirklich löschen?`)
                                      if (!confirmed) return
                                      try {
                                        setDbLoading(true)
                                        await deleteMember(member.id)
                                        await refreshAdminLists()
                                        const rows = ((await getTodayCheckins(liveDate)) as CheckinRow[]) || []
                                        setDbCheckins(rows)
                                        alert("Mitglied gelöscht.")
                                        window.location.reload()
                                      } catch (error) {
                                        console.error(error)
                                        const message = error instanceof Error ? error.message : "Unbekannter Fehler"
                                        alert(`Fehler beim Löschen des Mitglieds: ${message}`)
                                      } finally {
                                        setDbLoading(false)
                                      }
                                    }}
                                  >
                                    Löschen
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            <div className="grid gap-4 md:grid-cols-4">
              <Card className="rounded-[24px] border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-sm text-zinc-500">Gesamt heute</div>
                  <div className="mt-1 text-3xl font-bold">{dbCheckins.length}</div>
                </CardContent>
              </Card>

              <Card className="rounded-[24px] border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-sm text-zinc-500">Mitglieder</div>
                  <div className="mt-1 text-3xl font-bold">{membersPresent}</div>
                </CardContent>
              </Card>

              <Card className="rounded-[24px] border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-sm text-zinc-500">Probetraining</div>
                  <div className="mt-1 text-3xl font-bold">{trialPresent}</div>
                </CardContent>
              </Card>

              <Card className="rounded-[24px] border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <BarChart3 className="h-4 w-4" />
                    Gruppen heute
                  </div>
                  <div className="mt-1 text-3xl font-bold">{groupStats.length}</div>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-[24px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Filter</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Gruppe filtern</Label>
                    <Select value={trainerGroupFilter} onValueChange={setTrainerGroupFilter}>
                      <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alle">Alle Gruppen</SelectItem>
                        {Array.from(new Set(dbCheckins.map((entry) => entry.group_name))).map((group) => (
                          <SelectItem key={group} value={group}>
                            {group}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Typ filtern</Label>
                    <Select value={trainerTypeFilter} onValueChange={setTrainerTypeFilter}>
                      <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alle">Alle</SelectItem>
                        <SelectItem value="mitglied">Mitglied</SelectItem>
                        <SelectItem value="probetraining">Probetraining</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Name suchen</Label>
                    <Input
                      value={trainerNameFilter}
                      onChange={(e) => setTrainerNameFilter(e.target.value)}
                      placeholder="Name eingeben"
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[24px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Gruppenübersicht heute</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {groupStats.length === 0 ? (
                  <div className="text-sm text-zinc-500">Noch keine Check-ins für heute.</div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {groupStats.map((group) => (
                      <div key={group.group} className="rounded-2xl bg-zinc-100 p-4">
                        <div className="font-semibold text-zinc-900">{group.group}</div>
                        <div className="mt-2 text-sm text-zinc-600">Gesamt: {group.count}</div>
                        <div className="text-sm text-zinc-600">Mitglieder: {group.members}</div>
                        <div className="text-sm text-zinc-600">Probetraining: {group.trial}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[24px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Alle Check-ins heute</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Uhrzeit</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Geburtsdatum</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Stammgruppe</TableHead>
                      <TableHead>Gruppe heute</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrainerRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-zinc-500">
                          Keine Check-ins für die aktuelle Filterung vorhanden.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTrainerRows.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{entry.time}</TableCell>
                          <TableCell className="font-medium">{getMemberDisplayName(entry.members)}</TableCell>
                          <TableCell>{entry.members?.birthdate ?? "—"}</TableCell>
                          <TableCell>
                            {entry.members?.is_trial
                              ? "Probetraining"
                              : entry.members?.is_approved === false
                                ? "Probemitglied"
                                : "Mitglied"}
                          </TableCell>
                          <TableCell>{entry.members?.base_group ?? "—"}</TableCell>
                          <TableCell>{entry.group_name}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
