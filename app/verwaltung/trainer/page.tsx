"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buildAdminMailComposeHref } from "@/lib/adminMailComposeClient"
import { formatDisplayDate, formatDisplayDateTime, formatIsoDateForDisplay } from "@/lib/dateFormat"
import { type TrainerAccountRecord } from "@/lib/trainerDb"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

function getTrainerDisplayName(trainer: TrainerAccountRecord) {
  return `${trainer.first_name ?? ""} ${trainer.last_name ?? ""}`.trim() || trainer.email || "—"
}

function getDisplayedLicense(trainer: TrainerAccountRecord) {
  if (trainer.trainer_license && trainer.trainer_license !== "Keine DOSB-Lizenz") {
    return trainer.trainer_license
  }

  return trainer.lizenzart || "Keine Angabe"
}

async function readResponseError(response: Response, fallback: string) {
  const text = await response.text()
  if (!text.trim()) return fallback

  try {
    const parsed = JSON.parse(text) as { error?: string; details?: string }
    return parsed.details || parsed.error || text
  } catch {
    return text
  }
}

export default function TrainerverwaltungPage() {
  const router = useRouter()
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [trainers, setTrainers] = useState<TrainerAccountRecord[]>([])
  async function loadTrainers() {
    setLoading(true)
    try {
      setLoadError("")
      const response = await fetch("/api/admin/person-roles", {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(await readResponseError(response, "Trainerdaten konnten nicht geladen werden."))
      }

      const payload = (await response.json()) as {
        trainers: TrainerAccountRecord[]
      }

      setTrainers(
        Array.isArray(payload.trainers)
          ? payload.trainers.map((trainer) => ({
              ...trainer,
              role: trainer.role === "admin" ? "admin" : "trainer",
            }))
          : []
      )
    } catch (error) {
      console.error(error)
      setTrainers([])
      setLoadError(error instanceof Error ? error.message : "Trainerdaten konnten nicht geladen werden.")
    } finally {
      setLoading(false)
    }
  }

  async function runTrainerAction(input:
    | { action: "approve_trainer"; trainerId: string }
    | { action: "set_trainer_role"; trainerId: string; role: "trainer" | "admin" }
  ) {
    const response = await fetch("/api/admin/person-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      throw new Error(await readResponseError(response, "Traineraktion konnte nicht gespeichert werden."))
    }
  }

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }

    void loadTrainers()
  }, [authResolved, trainerRole])

  const admins = useMemo(() => trainers.filter((trainer) => trainer.role === "admin"), [trainers])
  const pending = useMemo(() => trainers.filter((trainer) => trainer.role !== "admin" && !trainer.is_approved), [trainers])
  const approved = useMemo(() => trainers.filter((trainer) => trainer.role !== "admin" && trainer.is_approved), [trainers])
  // Kein Mitglieder-Suchfeld/Anlegen mehr auf dieser Seite

  function getLicenseStatus(trainer: TrainerAccountRecord) {
    const d = trainer?.lizenz_gueltig_bis
    if (!d) return { key: "keine", label: "keine Angabe", color: "bg-zinc-100 text-zinc-700" }
    const date = new Date(d + "T00:00:00Z")
    const today = new Date()
    const diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return { key: "abgelaufen", label: "abgelaufen", color: "bg-red-100 text-red-800" }
    if (diff <= 30) return { key: "bald", label: "läuft bald ab", color: "bg-amber-100 text-amber-800" }
    return { key: "gueltig", label: "gültig", color: "bg-green-100 text-green-800" }
  }

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Trainerverwaltung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Nur im Admin-Modus.</div>
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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Trainerverwaltung</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/verwaltung">Zurück zur Übersicht</Link>
          </Button>
          <Button asChild className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]">
            <Link href="/verwaltung/trainer/anlegen">Trainer aus Mitgliedsdaten anlegen</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Trainerkonten gesamt</div>
            <div className="mt-1 text-3xl font-bold">{loading ? "…" : approved.length + pending.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Offene Freigaben</div>
            <div className="mt-1 text-3xl font-bold text-amber-600">{loading ? "…" : pending.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Freigegeben</div>
            <div className="mt-1 text-3xl font-bold text-green-700">{loading ? "…" : approved.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Admins</div>
            <div className="mt-1 text-3xl font-bold text-red-600">{loading ? "…" : admins.length}</div>
          </CardContent>
        </Card>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{loadError}</div>
      ) : null}


      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Aktuelle Trainerliste</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-600">
                  <th className="p-3">Trainer</th>
                  <th className="p-3">Lizenz</th>
                  <th className="p-3">Lizenzdetails</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="p-3 text-zinc-500">Lädt...</td></tr>
                ) : approved.length === 0 ? (
                  <tr><td colSpan={5} className="p-3 text-zinc-500">Keine Trainer vorhanden.</td></tr>
                ) : (
                  approved.map((trainer) => {
                    const status = getLicenseStatus(trainer)
                    return (
                      <tr key={trainer.id} className="border-t border-zinc-100 bg-white align-top">
                        <td className="p-3">
                          <div className="font-medium text-zinc-900">{getTrainerDisplayName(trainer)}</div>
                          <div className="mt-1 text-xs text-zinc-500">{trainer.email}</div>
                          <div className="mt-2 text-xs text-zinc-400">
                            Freigegeben am {trainer.approved_at ? formatDisplayDate(new Date(trainer.approved_at)) : "—"}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-zinc-900">{getDisplayedLicense(trainer)}</div>
                          <div className="mt-1 text-xs text-zinc-500">{trainer.lizenz_verband || "Kein Verband hinterlegt"}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-zinc-900">Nr.: {trainer.lizenznummer || "—"}</div>
                          <div className="mt-1 text-zinc-600">
                            Gültig bis {formatIsoDateForDisplay(trainer.lizenz_gueltig_bis) || "—"}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${status.color}`}>{status.label}</span>
                        </td>
                        <td className="p-3">
                          <div className="flex min-w-[180px] flex-col gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="justify-start rounded-2xl"
                              onClick={async () => {
                                try {
                                  await runTrainerAction({
                                    action: "set_trainer_role",
                                    trainerId: trainer.id,
                                    role: "admin",
                                  })
                                  alert("Trainer wurde zum Admin ernannt.")
                                  await loadTrainers()
                                } catch (error) {
                                  console.error(error)
                                  alert("Fehler beim Ernennen zum Admin.")
                                }
                              }}
                            >
                              Admin ernennen
                            </Button>
                            <Button asChild variant="outline" className="justify-start rounded-2xl">
                              <Link href={`/verwaltung/trainer/${trainer.id}/bearbeiten`}>Trainerdaten bearbeiten</Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create-from-members moved to its own subpage. Use the button above to navigate. */}

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Offene Trainerzugänge</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Trainerkonten werden geladen...</div>
          ) : pending.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine offenen Trainerfreigaben vorhanden.</div>
          ) : (
            pending.map((trainer) => (
              <div key={trainer.id} className="rounded-3xl border border-zinc-200 bg-white p-5">
                <div className="grid gap-4 xl:grid-cols-[1.4fr_auto] xl:items-end">
                  <div className="space-y-2 text-sm text-zinc-600">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold text-zinc-900">{getTrainerDisplayName(trainer)}</div>
                      <Badge
                        variant="outline"
                        className={
                          trainer.email_verified
                            ? "border-blue-200 bg-blue-100 text-blue-800"
                            : "border-zinc-200 bg-zinc-100 text-zinc-700"
                        }
                      >
                        {trainer.email_verified ? "E-Mail bestätigt" : "Wartet auf E-Mail"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          trainer.is_approved
                            ? "border-green-200 bg-green-100 text-green-800"
                            : "border-amber-200 bg-amber-100 text-amber-800"
                        }
                      >
                        {trainer.is_approved ? "Freigegeben" : "Freigabe offen"}
                      </Badge>
                    </div>
                    <div>E-Mail: {trainer.email}</div>
                    <div>Lizenz: {getDisplayedLicense(trainer)}</div>
                    <div>Registriert am: {formatDisplayDateTime(new Date(trainer.created_at))}</div>
                    <div>
                      E-Mail-Bestätigung:{" "}
                      {trainer.email_verified_at ? formatDisplayDateTime(new Date(trainer.email_verified_at)) : "noch offen"}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {!trainer.email_verified && (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        Freigabe erst nach E-Mail-Bestätigung möglich
                      </div>
                    )}
                    <Button
                      className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                      disabled={!trainer.email_verified}
                      onClick={async () => {
                        try {
                          await runTrainerAction({
                            action: "approve_trainer",
                            trainerId: trainer.id,
                          })
                          await loadTrainers()
                          router.push(
                            buildAdminMailComposeHref({
                              title: "Trainer-Freigabemail bearbeiten",
                              returnTo: "/verwaltung/trainer",
                              requests: [
                                {
                                  kind: "approval_notice",
                                  email: trainer.email,
                                  name: getTrainerDisplayName(trainer),
                                  targetKind: "trainer",
                                },
                              ],
                            })
                          )
                        } catch (error) {
                          console.error(error)
                          alert("Fehler bei der Trainerfreigabe.")
                        }
                      }}
                    >
                      Freigeben
                    </Button>
                    <Button asChild variant="outline" className="rounded-2xl">
                      <Link href={`/verwaltung/trainer/${trainer.id}/bearbeiten`}>Trainerdaten bearbeiten</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Admins</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Admin-Konten werden geladen...</div>
          ) : admins.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Noch keine Admin-Konten vorhanden.</div>
          ) : (
            admins.map((trainer) => (
              <div key={trainer.id} className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold">{getTrainerDisplayName(trainer)}</div>
                  <Badge variant="outline" className="border-red-200 bg-white text-red-700">
                    Admin
                  </Badge>
                  {trainer.is_approved ? (
                    <Badge variant="outline" className="border-green-200 bg-green-100 text-green-800">
                      Freigegeben
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-1">{trainer.email}</div>
                <div className="mt-1">Lizenz: {getDisplayedLicense(trainer)}</div>
                <div className="mt-1 text-xs text-red-700">
                  Freigegeben am: {trainer.approved_at ? formatDisplayDateTime(new Date(trainer.approved_at)) : "—"}
                </div>
                <div className="mt-3">
                  <Button asChild variant="outline" className="rounded-2xl">
                    <Link href={`/verwaltung/trainer/${trainer.id}/bearbeiten`}>Trainerdaten bearbeiten</Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

    </div>
  )
}
