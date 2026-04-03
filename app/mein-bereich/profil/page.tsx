"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { formatDisplayDate, formatIsoDateForDisplay } from "@/lib/dateFormat"
import { isValidMemberPassword, MEMBER_PASSWORD_HINT, MEMBER_PASSWORD_REQUIREMENTS_MESSAGE } from "@/lib/memberPassword"
export type ProfileSection = "wettkampf" | "gewicht" | "einstellungen"

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
  phone?: string | null
  has_competition_pass?: boolean | null
  is_competition_member?: boolean | null
  competition_license_number?: string | null
  competition_target_weight?: number | null
  last_medical_exam_date?: string | null
  competition_fights?: number | null
  competition_wins?: number | null
  competition_losses?: number | null
  competition_draws?: number | null
  base_group?: string | null
}

type MemberAreaSnapshot = {
  member: MemberRecord
  memberAttendanceRows: CheckinRow[]
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

export function MemberProfilePageContent({ section }: { section: ProfileSection }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [redirectToLoginAfterSave, setRedirectToLoginAfterSave] = useState(false)
  const [memberAreaEmail, setMemberAreaEmail] = useState("")
  const [memberAreaData, setMemberAreaData] = useState<MemberRecord | null>(null)
  const [profileEmail, setProfileEmail] = useState("")
  const [profilePhone, setProfilePhone] = useState("")
  const [memberAttendanceRows, setMemberAttendanceRows] = useState<CheckinRow[]>([])
  const [newMemberPin, setNewMemberPin] = useState("")
  const [confirmNewMemberPin, setConfirmNewMemberPin] = useState("")
  const profileSection = section

  useEffect(() => {
    const email = getStoredString("tsv_member_area_email")
    if (!email) {
      router.replace("/mein-bereich")
      return
    }

    setMemberAreaEmail(email)

    ;(async () => {
      try {
        const response = await fetch("/api/public/member-area", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "member_session" }),
        })

        if (!response.ok) {
          router.replace("/mein-bereich")
          return
        }

        const snapshot = (await response.json()) as MemberAreaSnapshot
        setMemberAttendanceRows(snapshot.memberAttendanceRows)
        setMemberAreaData(snapshot.member)
        setProfileEmail(snapshot.member.email || "")
        setProfilePhone(snapshot.member.phone || "")
      } catch (error) {
        console.error(error)
        router.replace("/mein-bereich")
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  useEffect(() => {
    if (!redirectToLoginAfterSave) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          await fetch("/api/public/member-area", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "logout_member_session" }),
          })
        } catch (error) {
          console.error(error)
        } finally {
          router.replace("/mein-bereich")
          router.refresh()
        }
      })()
    }, 1800)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [redirectToLoginAfterSave, router])

  const competitionWeightRows = memberAttendanceRows.filter((row) => typeof row.weight === "number")

  const latestCompetitionWeight = competitionWeightRows[0] ?? null
  const firstCompetitionWeight = competitionWeightRows[competitionWeightRows.length - 1] ?? null
  const weightChange =
    latestCompetitionWeight && firstCompetitionWeight
      ? latestCompetitionWeight.weight! - firstCompetitionWeight.weight!
      : null
  const isSettingsSection = profileSection === "einstellungen"

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 p-6 text-zinc-900">
        <div className="mx-auto max-w-5xl rounded-[24px] border border-zinc-200 bg-white p-6 shadow-sm">
          Mitgliederbereich wird geladen...
        </div>
      </div>
    )
  }

  if (!memberAreaData) {
    return null
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-6xl p-6 md:p-8">
        <div className="mb-6 overflow-hidden rounded-[28px] border border-[#c8d8ea] bg-white shadow-sm">
          <div className="h-2 bg-[#154c83]" />
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div className="flex items-center gap-4">
              <Image src="/boxgym-headline-old.png" alt="TSV Falkensee BoxGym" width={104} height={70} className="h-auto w-[46px] md:w-[92px]" priority />
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#154c83]">
                  Mein Bereich
                </div>
                <h1 className="mt-2 text-2xl font-bold text-[#154c83]">Sportlerprofil</h1>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[#d8e3ee] bg-white p-4 shadow-[0_10px_24px_rgba(15,39,64,0.06)]">
          <div className="flex flex-wrap gap-2.5">
            <div className="self-center px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Bereiche
            </div>
            <Link
              href="/mein-bereich/profil/wettkampf"
              className={
                profileSection === "wettkampf"
                  ? "rounded-2xl border border-[#154c83] bg-[#154c83] px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-[#123d69]"
                  : "rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
              }
            >
              Digitaler Wettkampfbereich
            </Link>
            <Link
              href="/mein-bereich/profil/gewicht"
              className={
                profileSection === "gewicht"
                  ? "rounded-2xl border border-[#154c83] bg-[#154c83] px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-[#123d69]"
                  : "rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
              }
            >
              Gewichtsdaten
            </Link>
            <Link
              href="/mein-bereich/profil/einstellungen"
              className={
                profileSection === "einstellungen"
                  ? "rounded-2xl border border-[#154c83] bg-[#154c83] px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-[#123d69]"
                  : "rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
              }
            >
              Einstellungen
            </Link>
          </div>
        </div>

        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Mein Bereich</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isSettingsSection ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-zinc-100 p-4">
                  <div className="text-sm text-zinc-500">Mein Name</div>
                  <div className="mt-1 text-lg font-bold text-[#154c83]">{memberAreaData.name || `${memberAreaData.first_name || ""} ${memberAreaData.last_name || ""}`.trim()}</div>
                  <div className="mt-1 text-xs text-zinc-500">Kontaktdaten und Hinweise.</div>
                </div>
                <div className="rounded-2xl bg-zinc-100 p-4">
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <span>Mitgliedschaft</span>
                    <InfoHint text="TSV-Mitgliedschaft, Kündigung und grundlegende Vertragsänderungen laufen direkt über den TSV Falkensee. Dieser Bereich ist nur für den Onlinebereich Boxen." />
                  </div>
                  <div className="mt-1 text-lg font-bold text-[#154c83]">TSV BoxGym</div>
                  <div className="mt-1 text-xs text-zinc-500">Änderungen nur über TSV Falkensee.</div>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border bg-white p-4">
              {profileSection === "einstellungen" ? (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="mb-4 flex items-center gap-2 font-semibold text-zinc-900">
                      <ShieldCheck className="h-4 w-4 text-[#154c83]" />
                      Meine Daten
                    </div>
                    <form
                      className="space-y-4"
                      onSubmit={(event) => {
                        event.preventDefault()
                        setSaveMessage("")
                        setRedirectToLoginAfterSave(false)

                        if (!memberAreaData.id) return
                        if (!profileEmail.trim()) {
                          alert("Bitte eine E-Mail-Adresse angeben.")
                          return
                        }

                        const trimmedNewPin = newMemberPin.trim()
                        if (trimmedNewPin || confirmNewMemberPin.trim()) {
                          if (!isValidMemberPassword(trimmedNewPin)) {
                            alert(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE)
                            return
                          }

                          if (trimmedNewPin !== confirmNewMemberPin.trim()) {
                            alert("Die beiden Passwörter stimmen nicht überein.")
                            return
                          }
                        }

                        void (async () => {
                          try {
                            setSaving(true)
                            const response = await fetch("/api/public/member-area", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "update_profile",
                                memberId: memberAreaData.id,
                                email: profileEmail.trim(),
                                phone: profilePhone.trim(),
                                loginEmail: memberAreaEmail.trim().toLowerCase(),
                                newPassword: trimmedNewPin,
                              }),
                            })

                            if (!response.ok) {
                              throw new Error(await response.text())
                            }

                            const result = (await response.json()) as { member: MemberRecord }
                            setMemberAreaData(result.member)
                            const nextLoginEmail = result.member.email?.trim().toLowerCase() || memberAreaEmail.trim().toLowerCase()
                            setMemberAreaEmail(nextLoginEmail)
                            localStorage.setItem("tsv_member_area_email", JSON.stringify(nextLoginEmail))
                            if (trimmedNewPin) {
                              setNewMemberPin("")
                              setConfirmNewMemberPin("")
                              setSaveMessage("Dein Passwort wurde aktualisiert. Du wirst gleich zum Mitglieder-Login weitergeleitet.")
                              setRedirectToLoginAfterSave(true)
                              return
                            }
                            setSaveMessage("Kontaktdaten gespeichert.")
                          } catch (error) {
                            console.error(error)
                            alert("Fehler beim Speichern der Kontaktdaten.")
                          } finally {
                            setSaving(false)
                          }
                        })()
                      }}
                    >
                      {saveMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{saveMessage}</div> : null}

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>E-Mail</Label>
                          <Input type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} placeholder="E-Mail" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                        </div>

                        <div className="space-y-2">
                          <Label>Telefonnummer</Label>
                          <Input value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} placeholder="Telefonnummer" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                        </div>
                        <div className="space-y-2">
                          <Label>Neues Passwort</Label>
                          <PasswordInput value={newMemberPin} onChange={(event) => setNewMemberPin(event.target.value)} placeholder="Neues Passwort" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                          <div className="text-xs text-zinc-500">{MEMBER_PASSWORD_HINT}</div>
                        </div>
                        <div className="space-y-2">
                          <Label>Passwort wiederholen</Label>
                          <PasswordInput value={confirmNewMemberPin} onChange={(event) => setConfirmNewMemberPin(event.target.value)} placeholder="Passwort wiederholen" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                        </div>
                      </div>

                      <Button type="submit" disabled={saving} className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]">
                        {saving ? "Speichert..." : newMemberPin.trim() || confirmNewMemberPin.trim() ? "Speichern und neu anmelden" : "Kontaktdaten speichern"}
                      </Button>
                    </form>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-zinc-900">Mitgliedschaft beenden</div>
                      <InfoHint text="TSV-Mitgliedschaft kann nur direkt beim TSV Falkensee gekündigt oder grundlegend geändert werden. Hier ist nur der Onlinebereich Boxen." />
                    </div>
                    <div className="mt-2 text-sm text-zinc-600">
                      Nur direkt beim TSV Falkensee.
                    </div>
                  </div>
                </div>
              ) : null}

              {profileSection === "wettkampf" ? (
                memberAreaData.is_competition_member || memberAreaData.has_competition_pass ? (
                  <div className="space-y-4">
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
                        <div className="text-sm text-zinc-500">Zielgewicht</div>
                        <div className="mt-1 text-3xl font-bold text-[#154c83]">
                          {memberAreaData.competition_target_weight != null ? `${String(memberAreaData.competition_target_weight).replace(".", ",")} kg` : "—"}
                        </div>
                      </div>
                    </div>

                    <div className={getMedicalExamStatus(memberAreaData.last_medical_exam_date).boxClass}>
                      <div className="font-semibold text-zinc-900">Ärztliche Untersuchung</div>
                      <div className="mt-1">
                        Letztes Datum: {formatIsoDateForDisplay(memberAreaData.last_medical_exam_date) || "—"}
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
                ) : (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                    Für dich ist aktuell noch kein digitaler Wettkampfbereich freigeschaltet.
                  </div>
                )
              ) : null}

              {profileSection === "gewicht" ? (
                memberAreaData.is_competition_member || memberAreaData.has_competition_pass ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <div className="font-semibold text-zinc-900">Gewichtsdaten</div>
                      <div className="text-sm text-zinc-500">{competitionWeightRows.length} Einträge</div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-2xl bg-zinc-100 p-3">
                        <div className="text-xs text-zinc-500">Zielgewicht</div>
                        <div className="mt-1 text-lg font-bold text-zinc-900">
                          {memberAreaData.competition_target_weight != null ? `${String(memberAreaData.competition_target_weight).replace(".", ",")} kg` : "—"}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-zinc-100 p-3">
                        <div className="text-xs text-zinc-500">Startwert</div>
                        <div className="mt-1 text-lg font-bold text-zinc-900">
                          {firstCompetitionWeight?.weight != null ? `${String(firstCompetitionWeight.weight).replace(".", ",")} kg` : "—"}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-zinc-100 p-3">
                        <div className="text-xs text-zinc-500">Letzter Wert</div>
                        <div className="mt-1 text-lg font-bold text-zinc-900">
                          {latestCompetitionWeight?.weight != null ? `${String(latestCompetitionWeight.weight).replace(".", ",")} kg` : "—"}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-zinc-100 p-3">
                        <div className="text-xs text-zinc-500">Veränderung</div>
                        <div className={`mt-1 text-lg font-bold ${weightChange == null ? "text-zinc-900" : weightChange > 0 ? "text-amber-700" : weightChange < 0 ? "text-emerald-700" : "text-zinc-900"}`}>
                          {weightChange == null ? "—" : `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1).replace(".", ",")} kg`}
                        </div>
                      </div>
                    </div>

                    {competitionWeightRows.length === 0 ? (
                      <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">
                        Noch keine Gewichtseinträge vorhanden.
                      </div>
                    ) : (
                      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                        {competitionWeightRows.map((row) => (
                          <div key={`weight-${row.id}`} className="flex flex-col gap-1 rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700 md:flex-row md:items-center md:justify-between">
                            <div className="font-medium text-zinc-900">{String(row.weight).replace(".", ",")} kg</div>
                            <div>
                              {row.date} · {row.time} · {row.group_name}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                      Zielgewicht wird von Trainer oder Admin gepflegt.
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                    Gewichtsdaten werden sichtbar, sobald du im Wettkampfbereich geführt wirst.
                  </div>
                )
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function MemberProfilePage() {
  return <MemberProfilePageContent section="wettkampf" />
}
