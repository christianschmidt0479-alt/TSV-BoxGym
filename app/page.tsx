"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ShieldCheck,
  Users,
  UserPlus,
  CalendarDays,
  ClipboardList,
  Download,
  CheckCircle2,
  Smartphone,
  LogIn,
  Settings,
  Trash2,
  AlertTriangle,
  BarChart3,
  Clock3,
} from "lucide-react"

const brand = {
  primary: "bg-[#154c83]",
  primaryText: "text-[#154c83]",
  accentText: "text-[#e6332a]",
  dark: "bg-[#0f2740]",
  light: "bg-zinc-50",
}

type Session = {
  id: string
  dayKey: "Montag" | "Dienstag" | "Mittwoch" | "Donnerstag" | "Freitag"
  title: string
  group: string
  start: string
  end: string
}

type AttendanceEntry = {
  id: string
  date: string
  year: number
  monthKey: string
  weekdayKey: string
  time: string
  sessionId: string
  sessionTitle: string
  sessionGroup: string
  name: string
  birthDate: string
  memberType: "Mitglied" | "Probetraining"
  weight?: string
  phone?: string
  email?: string
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

const weekdayOrder = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"] as const
const monthOrder = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function timeString() {
  return new Date().toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function liveTimeString(date: Date) {
  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function liveDateString(date: Date) {
  return date.toLocaleDateString("de-DE")
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

function storageGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function downloadFile(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7)
}

function getWeekRange(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`)
  const day = date.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day

  const monday = new Date(date)
  monday.setDate(date.getDate() + diffToMonday)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const toKey = (d: Date) => d.toISOString().slice(0, 10)

  return {
    start: toKey(monday),
    end: toKey(sunday),
  }
}

function monthLabel(monthNumber: string) {
  const map: Record<string, string> = {
    "01": "Jan",
    "02": "Feb",
    "03": "Mär",
    "04": "Apr",
    "05": "Mai",
    "06": "Jun",
    "07": "Jul",
    "08": "Aug",
    "09": "Sep",
    "10": "Okt",
    "11": "Nov",
    "12": "Dez",
  }
  return map[monthNumber] ?? monthNumber
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
    const checkinClose = start + 30

    if (nowMinutes < start) {
      return {
        session: current,
        nextSession: next,
        canCheckin: false,
        statusText: "Check-in noch nicht geöffnet",
      }
    }

    if (nowMinutes >= start && nowMinutes < end) {
      return {
        session: current,
        nextSession: next,
        canCheckin: nowMinutes <= checkinClose,
        statusText: nowMinutes <= checkinClose ? "Check-in geöffnet" : "Check-in-Fenster geschlossen",
      }
    }
  }

  return {
    session: null as Session | null,
    nextSession: null as Session | null,
    canCheckin: false,
    statusText: "Für heute sind alle Gruppen beendet",
  }
}

export default function Home() {
  const [now, setNow] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [selectedSessionId, setSelectedSessionId] = useState<string>(sessions[0].id)
  const [memberType, setMemberType] = useState<"Mitglied" | "Probetraining">("Mitglied")
  const [fullName, setFullName] = useState(() => storageGet("tsv_last_name", ""))
  const [birthDate, setBirthDate] = useState(() => storageGet("tsv_last_birth_date", ""))
  const [weight, setWeight] = useState("")
  const [trialPhone, setTrialPhone] = useState("")
  const [trialEmail, setTrialEmail] = useState("")
  const [trainerPin, setTrainerPin] = useState(() => storageGet("tsv_trainer_pin", "2026"))
  const [pinInput, setPinInput] = useState("")
  const [trainerMode, setTrainerMode] = useState(false)
  const [viewMode, setViewMode] = useState<"member" | "trainer">("member")
  const [attendanceLog, setAttendanceLog] = useState<AttendanceEntry[]>(() => storageGet("tsv_attendance_log", []))

  useEffect(() => {
    localStorage.setItem("tsv_attendance_log", JSON.stringify(attendanceLog))
  }, [attendanceLog])

  useEffect(() => {
    localStorage.setItem("tsv_trainer_pin", JSON.stringify(trainerPin))
  }, [trainerPin])

  useEffect(() => {
    localStorage.setItem("tsv_last_name", JSON.stringify(fullName))
  }, [fullName])

  useEffect(() => {
    localStorage.setItem("tsv_last_birth_date", JSON.stringify(birthDate))
  }, [birthDate])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = new Date()
      setNow(current)

      if (current.getHours() === 0 && current.getMinutes() === 1) {
        setSelectedDate(todayString())
      }
    }, 60000)

    return () => window.clearInterval(interval)
  }, [])

  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === selectedSessionId) ?? sessions[0]
  }, [selectedSessionId])

  const todaysSessions = useMemo(() => {
    const dayKey = getDayKey(selectedDate)
    return sessions.filter((session) => session.dayKey === dayKey)
  }, [selectedDate])

  const currentYear = useMemo(() => new Date(`${selectedDate}T12:00:00`).getFullYear(), [selectedDate])
  const currentMonthKey = useMemo(() => getMonthKey(selectedDate), [selectedDate])
  const weekRange = useMemo(() => getWeekRange(selectedDate), [selectedDate])

  const memberFlow = useMemo(() => {
    const selected = new Date(`${selectedDate}T12:00:00`)
    const isToday =
      now.getFullYear() === selected.getFullYear() &&
      now.getMonth() === selected.getMonth() &&
      now.getDate() === selected.getDate()

    if (!isToday) {
      return {
        session: todaysSessions[0] ?? null,
        nextSession: todaysSessions[1] ?? null,
        canCheckin: true,
        statusText: "Manuelle Tagesansicht",
      }
    }

    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    return getMemberFlowForToday(todaysSessions, nowMinutes)
  }, [selectedDate, todaysSessions, now])

  useEffect(() => {
    if (viewMode !== "member") return

    if (memberFlow.session) {
      if (memberFlow.session.id !== selectedSessionId) {
        setSelectedSessionId(memberFlow.session.id)
      }
    } else if (todaysSessions.length > 0 && !todaysSessions.some((s) => s.id === selectedSessionId)) {
      setSelectedSessionId(todaysSessions[0].id)
    }
  }, [memberFlow, selectedSessionId, todaysSessions, viewMode])

  const liveStatus = useMemo(() => {
    return {
      currentLabel: memberFlow.session ? memberFlow.session.group : "Keine aktive Gruppe",
      nextLabel: memberFlow.nextSession ? memberFlow.nextSession.group : "Keine weitere Gruppe",
      currentTime: memberFlow.session ? `${memberFlow.session.start} – ${memberFlow.session.end}` : "—",
      nextTime: memberFlow.nextSession ? `${memberFlow.nextSession.start} – ${memberFlow.nextSession.end}` : "—",
      statusText: memberFlow.statusText,
    }
  }, [memberFlow])

  const isLGroupActive = memberFlow.session?.group === "L-Gruppe" && memberFlow.canCheckin

  const todaysAttendance = useMemo(() => {
    return attendanceLog.filter(
      (entry) => entry.date === selectedDate && entry.sessionId === activeSession.id
    )
  }, [attendanceLog, selectedDate, activeSession])

  const totalPresent = memberFlow.session ? todaysAttendance.length : 0
  const trialPresent = memberFlow.session ? todaysAttendance.filter((e) => e.memberType === "Probetraining").length : 0
  const membersPresent = memberFlow.session ? todaysAttendance.filter((e) => e.memberType === "Mitglied").length : 0

  const dayCount = useMemo(() => {
    return attendanceLog.filter((entry) => entry.date === selectedDate).length
  }, [attendanceLog, selectedDate])

  const weekEntries = useMemo(() => {
    return attendanceLog.filter(
      (entry) => entry.date >= weekRange.start && entry.date <= weekRange.end
    )
  }, [attendanceLog, weekRange])

  const monthEntries = useMemo(() => {
    return attendanceLog.filter((entry) => entry.monthKey === currentMonthKey)
  }, [attendanceLog, currentMonthKey])

  const weekCount = weekEntries.length
  const monthCount = monthEntries.length

  const yearCount = useMemo(() => {
    return attendanceLog.filter((entry) => entry.year === currentYear).length
  }, [attendanceLog, currentYear])

  const yearlyTrialEntries = useMemo(() => {
    return attendanceLog.filter(
      (entry) => entry.year === currentYear && entry.memberType === "Probetraining"
    )
  }, [attendanceLog, currentYear])

  const yearlyMemberCount = useMemo(() => {
    return attendanceLog.filter(
      (entry) => entry.year === currentYear && entry.memberType === "Mitglied"
    ).length
  }, [attendanceLog, currentYear])

  const yearlyTrialCount = yearlyTrialEntries.length

  const sessionStats = useMemo(() => {
    const counts: Record<string, number> = {}
    attendanceLog
      .filter((entry) => entry.date === selectedDate)
      .forEach((entry) => {
        counts[entry.sessionGroup] = (counts[entry.sessionGroup] || 0) + 1
      })
    return counts
  }, [attendanceLog, selectedDate])

  const weekdayStats = useMemo(() => {
    const counts: Record<string, number> = {}
    weekdayOrder.forEach((day) => {
      counts[day] = 0
    })

    weekEntries.forEach((entry) => {
      counts[entry.weekdayKey] = (counts[entry.weekdayKey] || 0) + 1
    })

    return weekdayOrder.map((day) => ({
      label: day,
      count: counts[day] || 0,
    }))
  }, [weekEntries])

  const monthlyGroupStats = useMemo(() => {
    const counts: Record<string, number> = {}
    monthEntries.forEach((entry) => {
      counts[entry.sessionGroup] = (counts[entry.sessionGroup] || 0) + 1
    })

    return Object.entries(counts)
      .map(([group, count]) => ({ group, count }))
      .sort((a, b) => b.count - a.count)
  }, [monthEntries])

  const monthByMonthStats = useMemo(() => {
    const counts: Record<string, number> = {}
    monthOrder.forEach((m) => {
      counts[m] = 0
    })

    attendanceLog
      .filter((entry) => entry.year === currentYear)
      .forEach((entry) => {
        const monthNumber = entry.monthKey.slice(5, 7)
        counts[monthNumber] = (counts[monthNumber] || 0) + 1
      })

    return monthOrder.map((m) => ({
      label: monthLabel(m),
      count: counts[m] || 0,
    }))
  }, [attendanceLog, currentYear])

  const monthlyTop3 = useMemo(() => {
    return monthOrder.map((monthNumber) => {
      const monthKey = `${currentYear}-${monthNumber}`
      const counts = new Map<string, { name: string; count: number }>()

      attendanceLog
        .filter((entry) => entry.monthKey === monthKey && entry.memberType === "Mitglied")
        .forEach((entry) => {
          const key = `${normalizeText(entry.name)}|${entry.birthDate}`
          const existing = counts.get(key)

          if (existing) {
            existing.count += 1
          } else {
            counts.set(key, {
              name: entry.name,
              count: 1,
            })
          }
        })

      const top3 = Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)

      return {
        month: monthLabel(monthNumber),
        monthKey,
        top3,
      }
    })
  }, [attendanceLog, currentYear])

  const yearlyTrialStats = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string
        birthDate: string
        phone?: string
        email?: string
        count: number
      }
    >()

    yearlyTrialEntries.forEach((entry) => {
      const key = `${normalizeText(entry.name)}|${entry.birthDate}`
      const existing = map.get(key)

      if (existing) {
        existing.count += 1
      } else {
        map.set(key, {
          name: entry.name,
          birthDate: entry.birthDate,
          phone: entry.phone,
          email: entry.email,
          count: 1,
        })
      }
    })

    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [yearlyTrialEntries])

  const exhaustedTrials = useMemo(() => {
    return yearlyTrialStats.filter((entry) => entry.count >= 3)
  }, [yearlyTrialStats])

  const personalMonthVisits = useMemo(() => {
    const name = normalizeText(fullName)
    if (!name || !birthDate) return 0

    return monthEntries.filter(
      (entry) =>
        normalizeText(entry.name) === name &&
        entry.birthDate === birthDate &&
        entry.memberType === "Mitglied"
    ).length
  }, [monthEntries, fullName, birthDate])

  const personalYearVisits = useMemo(() => {
    const name = normalizeText(fullName)
    if (!name || !birthDate) return 0

    return attendanceLog.filter(
      (entry) =>
        entry.year === currentYear &&
        normalizeText(entry.name) === name &&
        entry.birthDate === birthDate &&
        entry.memberType === "Mitglied"
    ).length
  }, [attendanceLog, fullName, birthDate, currentYear])

  const personalLastCheckin = useMemo(() => {
    const name = normalizeText(fullName)
    if (!name || !birthDate) return null

    return attendanceLog.find(
      (entry) =>
        normalizeText(entry.name) === name &&
        entry.birthDate === birthDate &&
        entry.memberType === "Mitglied"
    ) ?? null
  }, [attendanceLog, fullName, birthDate])

  function getTrialCountForPerson(name: string, personBirthDate: string) {
    return attendanceLog.filter(
      (entry) =>
        entry.year === currentYear &&
        entry.memberType === "Probetraining" &&
        normalizeText(entry.name) === normalizeText(name) &&
        entry.birthDate === personBirthDate
    ).length
  }

  function registerParticipation() {
    const name = fullName.trim()

    if (!name) {
      alert("Bitte Namen eingeben.")
      return
    }

    if (!birthDate) {
      alert("Bitte Geburtsdatum angeben.")
      return
    }

    if (!memberFlow.session || !memberFlow.canCheckin) {
      alert("Check-in ist für diese Gruppe aktuell nicht möglich.")
      return
    }

    if (isLGroupActive && !weight.trim()) {
      alert("Für die L-Gruppe muss bei jedem Login das Gewicht angegeben werden.")
      return
    }

    if (memberType === "Probetraining") {
      if (!trialPhone.trim()) {
        alert("Bitte Telefonnummer angeben.")
        return
      }

      if (!trialEmail.trim()) {
        alert("Bitte E-Mail angeben.")
        return
      }

      const usedCount = getTrialCountForPerson(name, birthDate)

      if (usedCount >= 3) {
        alert("Probetraining erschöpft. Diese Person hat im laufenden Jahr bereits 3 Probetrainings absolviert.")
        return
      }
    }

    const duplicate = attendanceLog.some(
      (entry) =>
        entry.date === selectedDate &&
        entry.sessionId === memberFlow.session!.id &&
        normalizeText(entry.name) === normalizeText(name) &&
        entry.birthDate === birthDate
    )

    if (duplicate) {
      alert("Teilnahme bereits erfasst.")
      return
    }

    setAttendanceLog((prev) => [
      {
        id: `${Date.now()}`,
        date: selectedDate,
        year: currentYear,
        monthKey: currentMonthKey,
        weekdayKey: getDayKey(selectedDate),
        time: timeString(),
        sessionId: memberFlow.session!.id,
        sessionTitle: memberFlow.session!.title,
        sessionGroup: memberFlow.session!.group,
        name,
        birthDate,
        memberType,
        weight: isLGroupActive ? weight.trim() : undefined,
        phone: memberType === "Probetraining" ? trialPhone.trim() : undefined,
        email: memberType === "Probetraining" ? trialEmail.trim() : undefined,
      },
      ...prev,
    ])

    setWeight("")

    if (memberType === "Probetraining") {
      setTrialPhone("")
      setTrialEmail("")
    }
  }

  function handleTrainerLogin() {
    if (pinInput === trainerPin) {
      setTrainerMode(true)
      setViewMode("trainer")
      setPinInput("")
      return
    }

    alert("PIN nicht korrekt.")
  }

  function handleLogout() {
    setTrainerMode(false)
    setViewMode("member")
  }

  function deleteEntry(id: string) {
    setAttendanceLog((prev) => prev.filter((entry) => entry.id !== id))
  }

  function resetCurrentSession() {
    const ok = window.confirm("Alle Check-ins dieser Einheit löschen?")
    if (!ok) return

    setAttendanceLog((prev) =>
      prev.filter(
        (entry) => !(entry.date === selectedDate && entry.sessionId === activeSession.id)
      )
    )
  }

  function exportCsv() {
    const rows = [
      ["Datum", "Uhrzeit", "Training", "Gruppe", "Name", "Geburtsdatum", "Typ", "Gewicht", "Telefon", "E-Mail"],
      ...todaysAttendance.map((a) => [
        a.date,
        a.time,
        a.sessionTitle,
        a.sessionGroup,
        a.name,
        a.birthDate,
        a.memberType,
        a.weight ?? "",
        a.phone ?? "",
        a.email ?? "",
      ]),
    ]

    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")
      )
      .join("\n")

    downloadFile(
      `tsv-anwesenheit-${selectedDate}-${activeSession.group}.csv`,
      csv,
      "text/csv;charset=utf-8"
    )
  }

  return (
    <div className={`min-h-screen ${brand.light} text-zinc-900`}>
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "member" ? "default" : "outline"}
              className={`rounded-2xl ${
                viewMode === "member" ? `${brand.primary} hover:bg-[#123d69] text-white` : ""
              }`}
              onClick={() => setViewMode("member")}
            >
              <Smartphone className="mr-2 h-4 w-4" />
              Mitgliederansicht
            </Button>

            <Button
              variant={viewMode === "trainer" ? "default" : "outline"}
              className={`rounded-2xl ${
                viewMode === "trainer" ? `${brand.primary} hover:bg-[#123d69] text-white` : ""
              }`}
              onClick={() => setViewMode("trainer")}
            >
              <Settings className="mr-2 h-4 w-4" />
              Trainerbereich
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <span className="capitalize">{now.toLocaleDateString("de-DE", { weekday: "long" })}</span>
            <span>·</span>
            <span>{liveDateString(now)}</span>
            <span>·</span>
            <span>{liveTimeString(now)}</span>
          </div>
        </div>

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
                    className="h-16 w-auto rounded-md bg-white/90 p-1"
                  />
                  <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                    TSV BoxGym Check-in
                  </h1>
                </div>
              </div>

              <Card className="rounded-[24px] border-white/10 bg-white/5 text-white shadow-none backdrop-blur">
                <CardContent className="p-5">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-white/10 p-3">
                      <div className="text-zinc-300">Datum</div>
                      <div className="mt-1 font-semibold">{selectedDate}</div>
                    </div>
                    <div className="rounded-2xl bg-white/10 p-3">
                      <div className="text-zinc-300">Aktuelle Gruppe</div>
                      <div className="mt-1 font-semibold">{liveStatus.currentLabel}</div>
                    </div>
                    <div className="rounded-2xl bg-white/10 p-3">
                      <div className="text-zinc-300">Läuft</div>
                      <div className="mt-1 font-semibold">{liveStatus.currentTime}</div>
                    </div>
                    <div className="rounded-2xl bg-white/10 p-3">
                      <div className="text-zinc-300">Nächste Gruppe</div>
                      <div className="mt-1 font-semibold">{liveStatus.nextLabel}</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-2xl bg-white/10 p-3 text-sm">
                    <div className="text-zinc-300">Status</div>
                    <div className="mt-1 font-semibold">{liveStatus.statusText}</div>
                    <div className="mt-1 text-zinc-300">Nächster Zeitraum: {liveStatus.nextTime}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-zinc-500">Gesamt heute</div>
                  <div className="text-3xl font-bold">{dayCount}</div>
                </div>
                <CheckCircle2 className={`h-8 w-8 ${brand.primaryText}`} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-zinc-500">Mitglieder</div>
                  <div className="text-3xl font-bold">{membersPresent}</div>
                </div>
                <Users className={`h-8 w-8 ${brand.primaryText}`} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-zinc-500">Probetraining</div>
                  <div className="text-3xl font-bold">{trialPresent}</div>
                </div>
                <UserPlus className={`h-8 w-8 ${brand.accentText}`} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-zinc-500">Einheit</div>
                  <div className="text-xl font-bold">{memberFlow.session ? memberFlow.session.title : "Keine aktive Einheit"}</div>
                </div>
                <ClipboardList className={`h-8 w-8 ${brand.primaryText}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        {viewMode === "member" ? (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
              <Card className="rounded-[24px] border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>1. Gruppe wählen</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="text-sm text-zinc-500">
                    Es werden nur die Trainingsgruppen des ausgewählten Tages angezeigt. Anmeldung ist bis 30 Minuten nach Start der jeweiligen Gruppe möglich.
                  </div>

                  <div className="space-y-2">
                    <Label>Training</Label>
                    <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                      <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {todaysSessions.length === 0 ? (
                          <SelectItem value="none" disabled>
                            Keine Gruppen für diesen Tag
                          </SelectItem>
                        ) : (
                          todaysSessions.map((session) => (
                            <SelectItem key={session.id} value={session.id}>
                              {session.title}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-2xl bg-zinc-100 p-4 text-sm">
                    <div className="font-semibold">Aktive Einheit</div>
                    <div className="mt-2">
                      Training: <span className="font-medium">{memberFlow.session ? memberFlow.session.title : "Keine aktive Gruppe"}</span>
                    </div>
                    <div>
                      Gruppe: <span className="font-medium">{memberFlow.session ? memberFlow.session.group : "—"}</span>
                    </div>
                    <div>
                      Start: <span className="font-medium">{memberFlow.session ? memberFlow.session.start : "—"}</span>
                    </div>
                    <div>
                      Ende: <span className="font-medium">{memberFlow.session ? memberFlow.session.end : "—"}</span>
                    </div>
                    <div>
                      Check-in: <span className="font-medium">{memberFlow.canCheckin ? "Geöffnet" : "Geschlossen"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[24px] border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>2. Teilnahme bestätigen</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={memberType} onValueChange={(value: "Mitglied" | "Probetraining") => setMemberType(value)}>
                      <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Mitglied">Mitglied</SelectItem>
                        <SelectItem value="Probetraining">Probetraining</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Vorname Nachname"
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Geburtsdatum</Label>
                    <Input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>

                  {isLGroupActive && (
                    <div className="space-y-2">
                      <Label>Gewicht in kg</Label>
                      <Input
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        placeholder="z. B. 71,5"
                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500"
                      />
                    </div>
                  )}

                  {memberType === "Probetraining" && (
                    <>
                      <div className="space-y-2">
                        <Label>Telefonnummer</Label>
                        <Input
                          value={trialPhone}
                          onChange={(e) => setTrialPhone(e.target.value)}
                          placeholder="Telefonnummer"
                          className="rounded-2xl border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>E-Mail</Label>
                        <Input
                          type="email"
                          value={trialEmail}
                          onChange={(e) => setTrialEmail(e.target.value)}
                          placeholder="E-Mail"
                          className="rounded-2xl border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500"
                        />
                      </div>
                    </>
                  )}

                  <Button
                    className={`${brand.primary} rounded-2xl hover:bg-[#123d69] w-full text-white`}
                    onClick={registerParticipation}
                    disabled={!memberFlow.session || !memberFlow.canCheckin}
                  >
                    Teilnahme jetzt bestätigen
                  </Button>

                  <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
                    Name und Geburtsdatum bleiben auf diesem Gerät gespeichert, damit der nächste Login schneller geht.
                  </div>

                  {memberType === "Probetraining" && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      Probetraining ist pro Person auf 3 Termine pro Jahr begrenzt. Der Abgleich erfolgt über Name und Geburtsdatum.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-[24px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Deine Statistik</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {!normalizeText(fullName) || !birthDate ? (
                  <div className="text-sm text-zinc-500">
                    Gib Name und Geburtsdatum ein, dann wird deine persönliche Statistik angezeigt.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-2xl bg-zinc-100 p-4">
                        <div className="text-sm text-zinc-500">Diesen Monat</div>
                        <div className="mt-1 text-3xl font-bold text-[#154c83]">{personalMonthVisits}</div>
                      </div>

                      <div className="rounded-2xl bg-zinc-100 p-4">
                        <div className="text-sm text-zinc-500">Dieses Jahr</div>
                        <div className="mt-1 text-3xl font-bold text-[#154c83]">{personalYearVisits}</div>
                      </div>

                      <div className="rounded-2xl bg-zinc-100 p-4">
                        <div className="text-sm text-zinc-500">Letzter Check-in</div>
                        <div className="mt-1 text-sm font-medium text-zinc-800">
                          {personalLastCheckin
                            ? `${personalLastCheckin.date} · ${personalLastCheckin.time} · ${personalLastCheckin.sessionGroup}`
                            : "Noch kein Check-in gespeichert"}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Tabs defaultValue={trainerMode ? "overview" : "login"} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 rounded-[20px] bg-white p-1 shadow-sm">
              <TabsTrigger value="login" className="rounded-2xl">
                Login
              </TabsTrigger>
              <TabsTrigger value="overview" className="rounded-2xl" disabled={!trainerMode}>
                Übersicht
              </TabsTrigger>
              <TabsTrigger value="stats" className="rounded-2xl" disabled={!trainerMode}>
                Statistik
              </TabsTrigger>
              <TabsTrigger value="settings" className="rounded-2xl" disabled={!trainerMode}>
                Einstellungen
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                <Card className="rounded-[24px] border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <LogIn className="h-5 w-5" />
                      Trainer-Login
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
                      Nur Trainer sehen Teilnehmernamen, Detailübersicht und Export.
                    </div>

                    <div className="space-y-2">
                      <Label>PIN</Label>
                      <Input
                        type="password"
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value)}
                        placeholder="Trainer-PIN"
                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                      />
                    </div>

                    <Button
                      className={`${brand.primary} rounded-2xl hover:bg-[#123d69] w-full text-white`}
                      onClick={handleTrainerLogin}
                    >
                      Login
                    </Button>

                    {trainerMode && (
                      <Button variant="outline" className="rounded-2xl w-full" onClick={handleLogout}>
                        Abmelden
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-[24px] border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle>Öffentliche Tagesstatistik</CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3 text-sm text-zinc-700">
                    <div className="rounded-2xl bg-[#fde8e7] p-4">
                      Mitglieder, Probetrainings und Gesamtauslastung sind für alle sichtbar.
                    </div>
                    <div className="rounded-2xl bg-zinc-100 p-4">
                      Namen und Check-ins im Detail bleiben ausschließlich im Trainerbereich.
                    </div>
                    <div className="rounded-2xl bg-zinc-100 p-4">
                      Geburtsdatum ist für alle Pflicht. Für Probetraining zusätzlich Telefon und E-Mail.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="overview">
              <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
                <Card className="rounded-[24px] border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle>Anwesenheit aktuelle Einheit</CardTitle>
                  </CardHeader>

                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Uhrzeit</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Geburtsdatum</TableHead>
                          <TableHead>Typ</TableHead>
                          <TableHead>Gruppe</TableHead>
                          <TableHead>Gewicht</TableHead>
                          <TableHead>Aktion</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {todaysAttendance.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-zinc-500">
                              Keine Teilnahmen in dieser Einheit.
                            </TableCell>
                          </TableRow>
                        ) : (
                          todaysAttendance.map((entry) => (
                            <TableRow key={entry.id}>
                              <TableCell>{entry.time}</TableCell>
                              <TableCell className="font-medium">{entry.name}</TableCell>
                              <TableCell>{entry.birthDate}</TableCell>
                              <TableCell>{entry.memberType}</TableCell>
                              <TableCell>{entry.sessionGroup}</TableCell>
                              <TableCell>{entry.weight ?? "—"}</TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-xl"
                                  onClick={() => deleteEntry(entry.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Löschen
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        className={`${brand.primary} hover:bg-[#123d69] text-white rounded-2xl`}
                        onClick={exportCsv}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        CSV Export
                      </Button>

                      <Button variant="destructive" className="rounded-2xl" onClick={resetCurrentSession}>
                        Aktuelle Einheit zurücksetzen
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="rounded-[24px] border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Tagesstatistik</CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="rounded-2xl bg-zinc-100 p-4">
                        <div className="mb-2 flex items-center gap-2 font-semibold">
                          <CalendarDays className="h-4 w-4" />
                          Status
                        </div>
                        <div className="text-sm text-zinc-600">Datum: {selectedDate}</div>
                        <div className="text-sm text-zinc-600">Einheit: {activeSession.title}</div>
                      </div>

                      <div className="rounded-2xl bg-zinc-100 p-4">
                        <div className="mb-2 flex items-center gap-2 font-semibold">
                          <Clock3 className="h-4 w-4" />
                          Gruppen gesamt
                        </div>

                        <div className="space-y-2 text-sm">
                          {Object.keys(sessionStats).length === 0 ? (
                            <div className="text-zinc-500">Noch keine Statistik vorhanden.</div>
                          ) : (
                            Object.entries(sessionStats).map(([group, count]) => (
                              <div
                                key={group}
                                className="flex items-center justify-between rounded-xl bg-white px-3 py-2"
                              >
                                <span>{group}</span>
                                <span className="font-semibold">{count}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="stats">
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <Card className="rounded-[24px] border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="text-sm text-zinc-500">Heute</div>
                      <div className="text-3xl font-bold">{dayCount}</div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-[24px] border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="text-sm text-zinc-500">Diese Woche</div>
                      <div className="text-3xl font-bold">{weekCount}</div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-[24px] border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="text-sm text-zinc-500">Dieser Monat</div>
                      <div className="text-3xl font-bold">{monthCount}</div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-[24px] border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="text-sm text-zinc-500">Dieses Jahr</div>
                      <div className="text-3xl font-bold">{yearCount}</div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                  <Card className="rounded-[24px] border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Besuche pro Wochentag
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-2">
                      {weekdayStats.map((item) => (
                        <div key={item.label} className="flex items-center justify-between rounded-xl bg-zinc-100 px-3 py-2">
                          <span>{item.label}</span>
                          <span className="font-semibold">{item.count}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="rounded-[24px] border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Besuche pro Gruppe im Monat</CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-2">
                      {monthlyGroupStats.length === 0 ? (
                        <div className="text-sm text-zinc-500">Noch keine Monatsdaten vorhanden.</div>
                      ) : (
                        monthlyGroupStats.map((item) => (
                          <div key={item.group} className="flex items-center justify-between rounded-xl bg-zinc-100 px-3 py-2">
                            <span>{item.group}</span>
                            <span className="font-semibold">{item.count}</span>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                  <Card className="rounded-[24px] border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Besuche pro Monat im Jahr {currentYear}</CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-2">
                      {monthByMonthStats.map((item) => (
                        <div key={item.label} className="flex items-center justify-between rounded-xl bg-zinc-100 px-3 py-2">
                          <span>{item.label}</span>
                          <span className="font-semibold">{item.count}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="rounded-[24px] border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Top 3 pro Monat</CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {monthlyTop3.map((monthItem) => (
                        <div key={monthItem.monthKey} className="rounded-2xl bg-zinc-100 p-4">
                          <div className="mb-3 font-semibold">{monthItem.month}</div>

                          {monthItem.top3.length === 0 ? (
                            <div className="text-sm text-zinc-500">Keine Daten vorhanden.</div>
                          ) : (
                            <div className="space-y-2">
                              {monthItem.top3.map((person, index) => (
                                <div
                                  key={`${monthItem.monthKey}-${person.name}-${index}`}
                                  className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm"
                                >
                                  <span>{index + 1}. {person.name}</span>
                                  <span className="font-semibold">{person.count}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                  <Card className="rounded-[24px] border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Probetraining erschöpft
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl bg-zinc-100 p-4">
                          <div className="text-sm text-zinc-500">Mitglieder gesamt</div>
                          <div className="text-3xl font-bold">{yearlyMemberCount}</div>
                        </div>
                        <div className="rounded-2xl bg-zinc-100 p-4">
                          <div className="text-sm text-zinc-500">Probetrainings gesamt</div>
                          <div className="text-3xl font-bold">{yearlyTrialCount}</div>
                        </div>
                      </div>

                      {exhaustedTrials.length === 0 ? (
                        <div className="text-sm text-zinc-500">
                          Aktuell keine Personen mit 3 oder mehr Probetrainings im laufenden Jahr.
                        </div>
                      ) : (
                        exhaustedTrials.map((entry, index) => (
                          <div key={`${entry.name}-${entry.birthDate}-${index}`} className="rounded-xl bg-red-50 px-3 py-3">
                            <div className="font-medium text-red-700">{entry.name}</div>
                            <div className="text-sm text-zinc-600">
                              Geburtsdatum: {entry.birthDate || "—"} · Anzahl: {entry.count}
                            </div>
                            <div className="text-sm text-zinc-600">
                              Telefon: {entry.phone || "—"} · E-Mail: {entry.email || "—"}
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rounded-[24px] border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Probetraining nach Person</CardTitle>
                    </CardHeader>

                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Geburtsdatum</TableHead>
                            <TableHead>Anzahl</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>

                        <TableBody>
                          {yearlyTrialStats.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-zinc-500">
                                Noch keine Probetrainings im laufenden Jahr.
                              </TableCell>
                            </TableRow>
                          ) : (
                            yearlyTrialStats.map((entry, index) => (
                              <TableRow key={`${entry.name}-${entry.birthDate}-${index}`}>
                                <TableCell className="font-medium">{entry.name}</TableCell>
                                <TableCell>{entry.birthDate || "—"}</TableCell>
                                <TableCell>{entry.count}</TableCell>
                                <TableCell>
                                  {entry.count >= 3 ? (
                                    <span className="font-medium text-red-600">Erschöpft</span>
                                  ) : (
                                    <span className="font-medium text-green-600">Offen</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings">
              <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                <Card className="rounded-[24px] border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle>Trainer-Setup</CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Datum</Label>
                      <Input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Trainer-PIN</Label>
                      <Input
                        type="password"
                        value={trainerPin}
                        onChange={(e) => setTrainerPin(e.target.value)}
                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-[24px] border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle>Aktive Trainingsgruppen</CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    {sessions.map((session) => (
                      <div key={session.id} className="rounded-xl bg-zinc-100 px-3 py-2 text-sm">
                        {session.title}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
