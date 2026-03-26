"use client"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, BarChart3, Clock3, Printer, ScanLine, Settings, ShieldCheck, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { groupOptions, sessions } from "@/lib/boxgymSessions"
import { DEFAULT_APP_BASE_URL } from "@/lib/mailConfig"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type MemberOverviewRow = {
  id: string
  first_name?: string
  last_name?: string
  name?: string
  birthdate?: string
  base_group?: string | null
  is_trial?: boolean
  is_approved?: boolean
}

type CheckinOverviewRow = {
  id: string
  group_name: string
  date: string
}

type AdminDigestQueueRow = {
  id: string
  kind: "member" | "trainer" | "boxzwerge"
  member_name: string
  created_at: string
  sent_at: string | null
}

type OverviewAction = {
  href: string
  title: string
  description: string
}

type OverviewSection = {
  title: string
  description: string
  actions: OverviewAction[]
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

function getMemberDisplayName(member?: Partial<MemberOverviewRow> | null) {
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

export default function VerwaltungOverviewPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [memberRows, setMemberRows] = useState<MemberOverviewRow[]>([])
  const [todayCheckins, setTodayCheckins] = useState<CheckinOverviewRow[]>([])
  const [digestQueueRows, setDigestQueueRows] = useState<AdminDigestQueueRow[]>([])

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    if (!authResolved || !trainerRole) {
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/admin/overview?today=${encodeURIComponent(today)}`, {
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error(await response.text())
        }

        const payload = (await response.json()) as {
          memberRows: MemberOverviewRow[]
          todayCheckins: CheckinOverviewRow[]
          digestQueueRows: AdminDigestQueueRow[]
        }

        setMemberRows(payload.memberRows ?? [])
        setTodayCheckins(payload.todayCheckins ?? [])
        setDigestQueueRows(payload.digestQueueRows ?? [])
      } finally {
        setLoading(false)
      }
    })()
  }, [authResolved, today, trainerRole])

  const summary = useMemo(() => {
    const pendingApprovals = memberRows.filter((member) => !member.is_trial && !member.is_approved).length
    const approvedMembers = memberRows.filter((member) => member.is_approved).length
    const trialMembers = memberRows.filter((member) => member.is_trial).length
    const activeGroupsToday = new Set(todayCheckins.map((row) => row.group_name)).size
    const todaySessions = sessions.filter((session) => session.dayKey === getDayKey(today))

    return {
      totalMembers: memberRows.length,
      approvedMembers,
      trialMembers,
      pendingApprovals,
      todayCheckins: todayCheckins.length,
      activeGroupsToday,
      todaySessions: todaySessions.length,
    }
  }, [memberRows, today, todayCheckins])

  const boxzwergeAgingWarnings = useMemo(() => {
    return memberRows
      .filter((member) => member.base_group === "Boxzwerge")
      .map((member) => ({
        ...member,
        age: getAgeInYears(member.birthdate),
      }))
      .filter((member) => (member.age ?? -1) >= 10)
      .sort((a, b) => (b.age ?? 0) - (a.age ?? 0))
  }, [memberRows])

  const digestSummary = useMemo(() => {
    return {
      total: digestQueueRows.length,
      members: digestQueueRows.filter((row) => row.kind === "member").length,
      trainers: digestQueueRows.filter((row) => row.kind === "trainer").length,
      boxzwerge: digestQueueRows.filter((row) => row.kind === "boxzwerge").length,
      latest: digestQueueRows[0] ?? null,
    }
  }, [digestQueueRows])

  const memberRegistrationUrl = useMemo(() => {
    if (typeof window === "undefined") return `${DEFAULT_APP_BASE_URL}/tsv-mitglied-registrieren`
    return `${window.location.origin}/tsv-mitglied-registrieren`
  }, [])

  const memberRegistrationQrUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=16&data=${encodeURIComponent(memberRegistrationUrl)}`
  }, [memberRegistrationUrl])

  const overviewSections = useMemo<OverviewSection[]>(() => {
    const operationsSection = {
      title: "Betrieb",
      description: "Tagesgeschäft, Gruppen und Wettkampf.",
      actions: [
        {
          href: "/verwaltung/heute",
          title: "Heute",
          description: "Kompakte Tagesansicht öffnen.",
        },
        {
          href: "/verwaltung/checkins",
          title: "Check-ins",
          description: "Tageslisten und Verlauf prüfen.",
        },
        {
          href: "/verwaltung/gruppen",
          title: "Gruppen",
          description: "Gruppen und Wochenbezug öffnen.",
        },
        {
          href: "/verwaltung/wettkampf",
          title: "Wettkampf",
          description: "Kampfdaten und L-Gruppe pflegen.",
        },
        {
          href: "/verwaltung/qr-codes",
          title: "QR Codes",
          description: "QR Codes zum Ausdrucken: Mitglied registrieren & Checkin.",
        },
      ],
    }

    if (trainerRole === "admin") {
      return [
        {
          title: "Inbox",
          description: "Alles Offene und Dringende auf einen Blick.",
          actions: [
            {
              href: "/verwaltung/inbox",
              title: "Inbox",
              description: "Offene Themen priorisiert sehen.",
            },
            {
              href: "/verwaltung/freigaben",
              title: "Freigaben",
              description: "Offene Registrierungen abarbeiten.",
            },
          ],
        },
        {
          title: "Personen",
          description: "Mitglieder, Trainer und Rollen zusammenführen.",
          actions: [
            {
              href: "/verwaltung/trainer",
              title: "Trainer",
              description: "Trainerkonten und Freigaben prüfen.",
            },
            {
              href: "/verwaltung/personen",
              title: "Rollen",
              description: "Mehrfachrollen zentral zusammenführen.",
            },
            {
              href: "/verwaltung/mitglieder",
              title: "Mitglieder",
              description: "Suche, Status und Boxzwerge 10+.",
            },
          ],
        },
        operationsSection,
        {
          title: "System",
          description: "Mail, Sicherheit und Einstellungen.",
          actions: [
            {
              href: "/verwaltung/mail",
              title: "Mail",
              description: "Queues und Mailstatus prüfen.",
            },
            {
              href: "/verwaltung/sicherheit",
              title: "Sicherheit",
              description: "Audit-Log und Schutzmechanismen.",
            },
            {
              href: "/verwaltung/einstellungen",
              title: "Einstellungen",
              description: "Mail, System und Direktwerkzeuge.",
            },
          ],
        },
      ]
    }

    return [operationsSection]
  }, [trainerRole])

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (!trainerRole) {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Verwaltung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Nur mit Trainer- oder Adminzugang.</div>
          <Button asChild className="rounded-2xl">
            <Link href="/">Zur Startseite</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
            <ShieldCheck className="h-3.5 w-3.5" />
            {trainerRole === "admin" ? "Adminzugang aktiv" : "Trainerzugang aktiv"}
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900">Verwaltungsübersicht</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/">Zurück zum Check-in</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="hidden rounded-[24px] border-0 shadow-sm md:block">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Users className="h-4 w-4" />
              Mitglieder gesamt
            </div>
            <div className="mt-1 text-3xl font-bold text-zinc-900">{loading ? "…" : summary.totalMembers}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <BarChart3 className="h-4 w-4" />
              Check-ins heute
            </div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">{loading ? "…" : summary.todayCheckins}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Clock3 className="h-4 w-4" />
              Trainings heute
            </div>
            <div className="mt-1 text-3xl font-bold text-zinc-900">{loading ? "…" : summary.todaySessions}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">
              {trainerRole === "admin" ? "Offene Freigaben" : "Aktive Gruppen heute"}
            </div>
            <div className="mt-1 text-3xl font-bold text-emerald-700">
              {loading ? "…" : trainerRole === "admin" ? summary.pendingApprovals : summary.activeGroupsToday}
            </div>
          </CardContent>
        </Card>
      </div>

      {trainerRole === "admin" ? (
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>QR-Code Registrierung</CardTitle>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <span>Direkt im Admin-Bereich sichtbar, auch mobil.</span>
              <InfoHint text="Der QR-Code fuehrt direkt zur Registrierungsseite fuer den TSV-Boxbereich und ist fuer Handyansicht und Ausdruck gedacht." />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 rounded-[24px] border border-[#d8e3ee] bg-[linear-gradient(135deg,#f7fbff_0%,#ffffff_100%)] p-4 md:grid-cols-[1.2fr_220px] md:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#154c83]/8 px-3 py-1 text-xs font-semibold tracking-wide text-[#154c83]">
                  <ScanLine className="h-4 w-4" />
                  Registrierung per Handy
                </div>
                <div className="mt-3 text-lg font-bold tracking-tight text-zinc-900">
                  QR-Code fuer Sportler zur Registrierung
                </div>
                <div className="mt-2 text-sm leading-6 text-zinc-600">
                  Ideal fuer Handyansicht, direkte Ausgabe im Gym oder zum Ausdrucken als Aushang.
                </div>
                <div className="mt-4 break-all rounded-2xl bg-white/80 px-3 py-2 text-xs text-zinc-500">
                  {memberRegistrationUrl}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button asChild className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]">
                    <a href={memberRegistrationUrl} target="_blank" rel="noreferrer">
                      Registrierungsseite oeffnen
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(memberRegistrationUrl)
                        alert("Registrierungslink kopiert.")
                      } catch (error) {
                        console.error(error)
                        alert("Registrierungslink konnte nicht kopiert werden.")
                      }
                    }}
                  >
                    Link kopieren
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => {
                      const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=1200")
                      if (!printWindow) {
                        alert("Druckansicht konnte nicht geöffnet werden.")
                        return
                      }

                      printWindow.document.write(`
                        <!doctype html>
                        <html lang="de">
                          <head>
                            <meta charset="utf-8" />
                            <title>TSV BoxGym Registrierung QR-Code</title>
                            <style>
                              @page {
                                size: A4 portrait;
                                margin: 14mm;
                              }
                              body {
                                font-family: "Avenir Next", "Segoe UI", sans-serif;
                                margin: 0;
                                padding: 0;
                                color: #18181b;
                                background: #f4f7fb;
                              }
                              .sheet {
                                box-sizing: border-box;
                                width: 100%;
                                min-height: calc(297mm - 28mm);
                                max-width: 182mm;
                                margin: 0 auto;
                                border: 3px solid #154c83;
                                border-radius: 28px;
                                padding: 28px 28px 32px;
                                text-align: center;
                                background:
                                  radial-gradient(circle at top right, rgba(230, 51, 42, 0.12), transparent 28%),
                                  linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
                              }
                              .header {
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 18px;
                                margin-bottom: 18px;
                              }
                              .logo {
                                width: 170px;
                                height: auto;
                                padding: 10px 12px;
                                border-radius: 18px;
                                background: rgba(255, 255, 255, 0.92);
                                border: 1px solid #d8e3ee;
                              }
                              .brand-badge {
                                display: inline-block;
                                background: #154c83;
                                color: #ffffff;
                                padding: 8px 16px;
                                border-radius: 999px;
                                font-size: 13px;
                                font-weight: 700;
                                letter-spacing: 0.05em;
                                text-transform: uppercase;
                              }
                              h1 {
                                margin: 16px 0 10px;
                                font-size: 38px;
                                line-height: 1.08;
                              }
                              p {
                                margin: 0 auto 24px;
                                max-width: 620px;
                                font-size: 19px;
                                line-height: 1.55;
                                color: #3f3f46;
                              }
                              .qr-wrap {
                                margin: 28px auto 18px;
                                width: fit-content;
                                padding: 18px;
                                border-radius: 28px;
                                border: 1px solid #d8e3ee;
                                background: #ffffff;
                                box-shadow: 0 18px 40px rgba(21, 76, 131, 0.08);
                              }
                              .qr {
                                width: 360px;
                                height: 360px;
                                border-radius: 24px;
                                display: block;
                              }
                              .steps {
                                display: grid;
                                grid-template-columns: repeat(3, minmax(0, 1fr));
                                gap: 14px;
                                margin: 28px 0 20px;
                                text-align: left;
                              }
                              .step {
                                border: 1px solid #d8e3ee;
                                border-radius: 20px;
                                background: rgba(255, 255, 255, 0.92);
                                padding: 16px;
                              }
                              .step-number {
                                display: inline-flex;
                                width: 32px;
                                height: 32px;
                                align-items: center;
                                justify-content: center;
                                border-radius: 999px;
                                background: #154c83;
                                color: #ffffff;
                                font-size: 15px;
                                font-weight: 700;
                                margin-bottom: 10px;
                              }
                              .step-title {
                                font-size: 16px;
                                font-weight: 700;
                                margin-bottom: 6px;
                              }
                              .step-text {
                                color: #52525b;
                                font-size: 14px;
                                line-height: 1.5;
                              }
                              .note {
                                margin: 4px auto 0;
                                max-width: 640px;
                                border-radius: 20px;
                                background: #edf4fb;
                                border: 1px solid #cfe0f0;
                                padding: 16px 18px;
                                font-size: 15px;
                                line-height: 1.6;
                                color: #23405f;
                              }
                              .url {
                                margin-top: 24px;
                                font-size: 14px;
                                color: #52525b;
                                word-break: break-all;
                              }
                            </style>
                          </head>
                          <body>
                            <div class="sheet">
                              <div class="header">
                                <img class="logo" src="${window.location.origin}/BoxGym%20Kompakt.png" alt="TSV Falkensee BoxGym" />
                                <div class="brand-badge">TSV Falkensee · BoxGym</div>
                              </div>
                              <h1>Jetzt fuer den Boxbereich registrieren</h1>
                              <p>QR-Code mit dem Handy scannen und die Registrierung direkt online ausfuellen.</p>
                              <div class="qr-wrap">
                                <img class="qr" src="${memberRegistrationQrUrl}" alt="QR-Code zur Registrierung" />
                              </div>
                              <div class="steps">
                                <div class="step">
                                  <div class="step-number">1</div>
                                  <div class="step-title">QR-Code scannen</div>
                                  <div class="step-text">Mit der Handykamera oder einer QR-App den Code oeffnen.</div>
                                </div>
                                <div class="step">
                                  <div class="step-number">2</div>
                                  <div class="step-title">Formular ausfuellen</div>
                                  <div class="step-text">Persoenliche Daten fuer die Registrierung im Boxbereich eintragen.</div>
                                </div>
                                <div class="step">
                                  <div class="step-number">3</div>
                                  <div class="step-title">Absenden</div>
                                  <div class="step-text">Anmeldung abschliessen und die Bestaetigung auf dem Handy pruefen.</div>
                                </div>
                              </div>
                              <div class="note">
                                Nur fuer TSV-Mitglieder bzw. Personen, die parallel die TSV-Mitgliedschaft beantragen.
                              </div>
                              <div class="url">${memberRegistrationUrl}</div>
                            </div>
                          </body>
                        </html>
                      `)
                      printWindow.document.close()
                      printWindow.focus()
                      printWindow.print()
                    }}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Drucken
                  </Button>
                </div>
              </div>

              <div className="mx-auto w-full max-w-[220px] rounded-[28px] border border-[#d8e3ee] bg-white p-4 shadow-sm">
                <Image
                  src={memberRegistrationQrUrl}
                  alt="QR-Code zur Registrierung für den TSV Boxbereich"
                  width={320}
                  height={320}
                  className="h-auto w-full rounded-2xl"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="space-y-4 md:hidden">
          {overviewSections.map((section) => (
            <details key={section.title} className="rounded-[24px] border-0 bg-white shadow-sm">
              <summary className="cursor-pointer list-none rounded-[24px] px-4 py-4 text-left">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-zinc-900">{section.title}</div>
                    <div className="mt-1 text-sm text-zinc-500">{section.description}</div>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />
                </div>
              </summary>
              <div className="space-y-2 border-t border-zinc-200 px-4 py-4">
                {section.actions.map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 transition hover:border-[#154c83] hover:bg-white"
                  >
                    <div>
                      <div className="font-semibold text-zinc-900">{action.title}</div>
                      <div className="mt-1 text-xs leading-5 text-zinc-600">{action.description}</div>
                    </div>
                    {action.href === "/verwaltung/einstellungen" ? (
                      <Settings className="h-4 w-4 shrink-0 text-zinc-400" />
                    ) : (
                      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" />
                    )}
                  </Link>
                ))}
              </div>
            </details>
          ))}

          <details className="rounded-[24px] border-0 bg-white shadow-sm">
            <summary className="cursor-pointer list-none rounded-[24px] px-4 py-4 text-left">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-base font-semibold text-zinc-900">Stand heute</div>
                  <div className="mt-1 text-sm text-zinc-500">Warnungen und Sammelmail kompakt.</div>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />
              </div>
            </summary>
            <div className="space-y-3 border-t border-zinc-200 px-4 py-4 text-sm text-zinc-600">
              {boxzwergeAgingWarnings.length > 0 ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
                  <div className="font-semibold">Warnung für Christian Schmidt</div>
                  <div className="mt-1">
                    {boxzwergeAgingWarnings.length} Boxzwerge sind 10 Jahre oder älter und sollten geprüft werden.
                  </div>
                  <div className="mt-3 space-y-1 text-sm">
                    {boxzwergeAgingWarnings.map((member) => (
                      <div key={member.id}>
                        {getMemberDisplayName(member)} · {member.birthdate || "Geburtsdatum offen"} · {member.age} Jahre
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <Button asChild variant="outline" className="rounded-2xl border-red-200 bg-white text-red-900 hover:bg-red-100">
                      <Link href="/verwaltung/mitglieder?gruppe=Boxzwerge">Zur Mitgliederverwaltung</Link>
                    </Button>
                  </div>
                </div>
              ) : null}
              {trainerRole === "admin" ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
                  <div className="font-semibold">Admin-Sammelmail</div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-blue-900">
                    <span><span className="font-semibold">{loading ? "…" : digestSummary.total}</span> offen.</span>
                    <InfoHint text={`Versand werktags um 09:00 Uhr. Aktuell warten ${loading ? "…" : digestSummary.total} Vorgänge auf die nächste Sammelmail.`} />
                  </div>
                  <div className="mt-3 grid gap-2 text-sm">
                    <div className="rounded-2xl bg-white/80 p-3">Boxbereich: <span className="font-semibold">{loading ? "…" : digestSummary.members}</span></div>
                    <div className="rounded-2xl bg-white/80 p-3">Trainer: <span className="font-semibold">{loading ? "…" : digestSummary.trainers}</span></div>
                    <div className="rounded-2xl bg-white/80 p-3">Boxzwerge: <span className="font-semibold">{loading ? "…" : digestSummary.boxzwerge}</span></div>
                  </div>
                  {digestSummary.latest ? (
                    <div className="mt-3 text-xs text-blue-800">
                      Letzter Eingang: {digestSummary.latest.member_name} ·{" "}
                      {new Date(digestSummary.latest.created_at).toLocaleString("de-DE")}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-blue-800">Zurzeit liegt kein offener Vorgang in der Sammelmail-Warteschlange.</div>
                  )}
                </div>
              ) : null}
              <div className="rounded-2xl bg-zinc-100 p-4">
                Freigegebene Mitglieder: <span className="font-semibold text-zinc-900">{loading ? "…" : summary.approvedMembers}</span>
              </div>
              <div className="rounded-2xl bg-zinc-100 p-4">
                Probemitglieder: <span className="font-semibold text-zinc-900">{loading ? "…" : summary.trialMembers}</span>
              </div>
              <div className="rounded-2xl bg-zinc-100 p-4">
                Gruppen im Wochenplan: <span className="font-semibold text-zinc-900">{groupOptions.length}</span>
              </div>
              <div className="rounded-2xl bg-zinc-100 p-4">
                Aktive Gruppen heute: <span className="font-semibold text-zinc-900">{loading ? "…" : summary.activeGroupsToday}</span>
              </div>
            </div>
          </details>
        </div>

        <div className="hidden gap-4 md:grid md:grid-cols-2">
          {overviewSections.map((section) => (
            <Card key={section.title} className="rounded-[24px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <span>Kompakter Überblick.</span>
                  <InfoHint text={section.description} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {section.actions.map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex items-start justify-between gap-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-[#154c83] hover:bg-white"
                  >
                    <div>
                      <div className="font-semibold text-zinc-900">{action.title}</div>
                      <div className="mt-1 text-sm text-zinc-600">{action.description}</div>
                    </div>
                    {action.href === "/verwaltung/einstellungen" ? (
                      <Settings className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />
                    ) : (
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />
                    )}
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader className="md:items-start">
            <CardTitle>Stand heute</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-600 md:block">
            {boxzwergeAgingWarnings.length > 0 ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
                <div className="font-semibold">Warnung für Christian Schmidt</div>
                <div className="mt-1">
                  {boxzwergeAgingWarnings.length} Boxzwerge sind 10 Jahre oder älter und sollten geprüft werden.
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  {boxzwergeAgingWarnings.map((member) => (
                    <div key={member.id}>
                      {getMemberDisplayName(member)} · {member.birthdate || "Geburtsdatum offen"} · {member.age} Jahre
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Button asChild variant="outline" className="rounded-2xl border-red-200 bg-white text-red-900 hover:bg-red-100">
                    <Link href="/verwaltung/mitglieder?gruppe=Boxzwerge">Zur Mitgliederverwaltung</Link>
                  </Button>
                </div>
              </div>
            ) : null}
            {trainerRole === "admin" ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
                <div className="font-semibold">Admin-Sammelmail</div>
                <div className="mt-1 flex items-center gap-2 text-sm text-blue-900">
                  <span><span className="font-semibold">{loading ? "…" : digestSummary.total}</span> offen.</span>
                  <InfoHint text={`Versand werktags um 09:00 Uhr. Aktuell warten ${loading ? "…" : digestSummary.total} Vorgänge auf die nächste Sammelmail.`} />
                </div>
                <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                  <div className="rounded-2xl bg-white/80 p-3">Boxbereich: <span className="font-semibold">{loading ? "…" : digestSummary.members}</span></div>
                  <div className="rounded-2xl bg-white/80 p-3">Trainer: <span className="font-semibold">{loading ? "…" : digestSummary.trainers}</span></div>
                  <div className="rounded-2xl bg-white/80 p-3">Boxzwerge: <span className="font-semibold">{loading ? "…" : digestSummary.boxzwerge}</span></div>
                </div>
                {digestSummary.latest ? (
                  <div className="mt-3 text-xs text-blue-800">
                    Letzter Eingang: {digestSummary.latest.member_name} ·{" "}
                    {new Date(digestSummary.latest.created_at).toLocaleString("de-DE")}
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-blue-800">Zurzeit liegt kein offener Vorgang in der Sammelmail-Warteschlange.</div>
                )}
              </div>
            ) : null}
            <div className="rounded-2xl bg-zinc-100 p-4">
              Freigegebene Mitglieder: <span className="font-semibold text-zinc-900">{loading ? "…" : summary.approvedMembers}</span>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4">
              Probemitglieder: <span className="font-semibold text-zinc-900">{loading ? "…" : summary.trialMembers}</span>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4">
              Gruppen im Wochenplan: <span className="font-semibold text-zinc-900">{groupOptions.length}</span>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4">
              Aktive Gruppen heute: <span className="font-semibold text-zinc-900">{loading ? "…" : summary.activeGroupsToday}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
