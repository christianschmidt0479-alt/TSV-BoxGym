"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { formatDisplayDateTime, formatIsoDateForDisplay } from "@/lib/dateFormat"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type MailConfigResponse = {
  configured: boolean
  using_server_key: boolean
  using_public_fallback: boolean
  from: string
  reply_to: string
  app_base_url: string
  admin_notification_email: string
}

type AdminQueueRow = {
  id: string
  kind: "member" | "trainer" | "boxzwerge"
  member_name: string
  email: string | null
  group_name: string | null
  created_at: string
  sent_at: string | null
}

type OutgoingQueueRow = {
  id: string
  purpose:
    | "competition_assigned"
    | "competition_removed"
    | "medical_exam_reminder_member"
    | "medical_exam_reminder_admin"
  email: string
  name: string | null
  context_key: string | null
  created_at: string
  sent_at: string | null
}

type ParentFamilyMailRow = {
  parent_account_id: string
  parent_name: string
  parent_email: string
  parent_phone?: string | null
  children: Array<{
    member_id: string
    child_name: string
    child_birthdate?: string | null
    child_group?: string | null
  }>
}

type ManualParentOutboxRow = {
  id: string
  parent_account_id: string
  parent_name: string
  parent_email: string
  parent_phone?: string | null
  subject: string
  body: string
  link: string
  children: ParentFamilyMailRow["children"]
  created_at: string
}

function getKindLabel(kind: AdminQueueRow["kind"]) {
  switch (kind) {
    case "member":
      return "Mitglied"
    case "trainer":
      return "Trainer"
    case "boxzwerge":
      return "Boxzwerge"
  }
}

function getOutgoingPurposeLabel(purpose: OutgoingQueueRow["purpose"]) {
  switch (purpose) {
    case "competition_assigned":
      return "Wettkämpfer zugewiesen"
    case "competition_removed":
      return "Wettkämpfer entfernt"
    case "medical_exam_reminder_member":
      return "Untersuchung Erinnerung Sportler"
    case "medical_exam_reminder_admin":
      return "Untersuchung Erinnerung Admin"
  }
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || message.includes("could not find the table")
}

export default function MailVerwaltungPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [sendingNow, setSendingNow] = useState(false)
  const [buildingParentDrafts, setBuildingParentDrafts] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [mailConfig, setMailConfig] = useState<MailConfigResponse | null>(null)
  const [adminQueueRows, setAdminQueueRows] = useState<AdminQueueRow[]>([])
  const [outgoingQueueRows, setOutgoingQueueRows] = useState<OutgoingQueueRow[]>([])
  const [parentFamilyMailRows, setParentFamilyMailRows] = useState<ParentFamilyMailRow[]>([])
  const [manualParentOutboxRows, setManualParentOutboxRows] = useState<ManualParentOutboxRow[]>([])

  async function loadMailData() {
    try {
      setLoading(true)
      setLoadError("")

      const sessionRefreshResponse = await fetch("/api/trainer-session", {
        method: "POST",
        cache: "no-store",
      })

      if (sessionRefreshResponse.status === 401) {
        setLoadError("Admin-Sitzung abgelaufen. Bitte im Adminzugang neu anmelden, damit die Entwürfe geladen werden.")
        setAdminQueueRows([])
        setOutgoingQueueRows([])
        setParentFamilyMailRows([])
        setManualParentOutboxRows([])
        return
      }

      const [configResponse, adminQueueResponse] = await Promise.all([
        fetch("/api/send-verification", { method: "PUT", cache: "no-store" }),
        fetch("/api/admin/mail-overview", { cache: "no-store" }),
      ])

      if (configResponse.ok) {
        setMailConfig((await configResponse.json()) as MailConfigResponse)
      }

      if (adminQueueResponse.ok) {
        const payload = (await adminQueueResponse.json()) as {
          adminQueueRows: AdminQueueRow[]
          outgoingQueueRows: OutgoingQueueRow[]
          parentFamilyMailRows: ParentFamilyMailRow[]
          manualParentOutboxRows: ManualParentOutboxRow[]
        }
        setAdminQueueRows(payload.adminQueueRows ?? [])
        setOutgoingQueueRows(payload.outgoingQueueRows ?? [])
        setParentFamilyMailRows(payload.parentFamilyMailRows ?? [])
        setManualParentOutboxRows(payload.manualParentOutboxRows ?? [])
      } else if (adminQueueResponse.status === 401) {
        setLoadError("Admin-Sitzung abgelaufen. Bitte im Adminzugang neu anmelden, damit die Entwürfe geladen werden.")
        setAdminQueueRows([])
        setOutgoingQueueRows([])
        setParentFamilyMailRows([])
        setManualParentOutboxRows([])
      } else {
        const errorText = await adminQueueResponse.text()
        if (!isMissingTableError({ message: errorText })) {
          throw new Error(errorText || "Maildaten konnten nicht geladen werden.")
        }
      }
    } catch (error) {
      console.error(error)
      setLoadError(error instanceof Error ? error.message : "Maildaten konnten nicht geladen werden.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }

    void loadMailData()
  }, [authResolved, trainerRole])

  const adminDigestSummary = useMemo(() => {
    return {
      total: adminQueueRows.length,
      members: adminQueueRows.filter((row) => row.kind === "member").length,
      trainers: adminQueueRows.filter((row) => row.kind === "trainer").length,
      boxzwerge: adminQueueRows.filter((row) => row.kind === "boxzwerge").length,
      latest: adminQueueRows[0] ?? null,
    }
  }, [adminQueueRows])

  const outgoingSummary = useMemo(() => {
    return {
      total: outgoingQueueRows.length,
      assigned: outgoingQueueRows.filter((row) => row.purpose === "competition_assigned").length,
      removed: outgoingQueueRows.filter((row) => row.purpose === "competition_removed").length,
      medicalMember: outgoingQueueRows.filter((row) => row.purpose === "medical_exam_reminder_member").length,
      medicalAdmin: outgoingQueueRows.filter((row) => row.purpose === "medical_exam_reminder_admin").length,
      latest: outgoingQueueRows[0] ?? null,
    }
  }, [outgoingQueueRows])

  const visibleParentOutboxRows =
    manualParentOutboxRows.length > 0
      ? manualParentOutboxRows
      : parentFamilyMailRows.map((row) => ({
          id: row.parent_account_id,
          parent_account_id: row.parent_account_id,
          parent_name: row.parent_name,
          parent_email: row.parent_email,
          parent_phone: row.parent_phone || null,
          subject: getParentFamilySubject(row),
          body: getParentFamilyBody(row),
          link: getParentFamilyLink(row),
          children: row.children,
          created_at: new Date().toISOString(),
        }))

  function getParentFamilyLink(row: ParentFamilyMailRow) {
    const baseUrl = mailConfig?.app_base_url || "http://localhost:3000"
    const firstChildId = row.children[0]?.member_id || ""
    const params = new URLSearchParams({
      view: "parent",
      email: row.parent_email,
      child: firstChildId,
    })

    return `${baseUrl}/mein-bereich?${params.toString()}#familienkonto`
  }

  function getParentFamilySubject(row: ParentFamilyMailRow) {
    if (row.children.length === 1) {
      return `TSV BoxGym: Digitaler Zugang für ${row.children[0]?.child_name || "euer Kind"}`
    }

    return "TSV BoxGym: Digitaler Zugang für eure Kinder"
  }

  function getParentFamilyBody(row: ParentFamilyMailRow) {
    const link = getParentFamilyLink(row)
    const childLines = row.children
      .map((child, index) => `${index + 1}. ${[child.child_name, formatIsoDateForDisplay(child.child_birthdate), child.child_group || null].filter(Boolean).join(" · ")}`)
      .join("\n")

    return `Liebe Eltern,

wir möchten euch informieren, dass wir im TSV BoxGym zukünftig eine digitale Anwesenheitsliste führen.

Für euer Elternkonto sind bereits folgende Kinder im System angelegt:
${childLines}

Über diesen Link gelangt ihr direkt in den Elternbereich:
${link}

Dort findet ihr alle angelegten Kinder direkt im Familienkonto. Die Eltern-E-Mail ist bereits vorausgefüllt.

Wichtig:
- Beim ersten Öffnen gebt ihr Vorname und Nachname des Elternteils an.
- Danach legt ihr euer eigenes Eltern-Passwort fest.
- Die Anwesenheit wird künftig vor Ort digital erfasst.
- Falls sich eure Kontaktdaten geändert haben, gebt uns bitte kurz Bescheid.

Vielen Dank für eure Unterstützung.

Sportliche Grüße
TSV BoxGym`
  }

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Mail-Verwaltung</CardTitle>
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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Mail-Verwaltung</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/verwaltung">Zurück zur Übersicht</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
          disabled={sendingNow || loading || (adminDigestSummary.total === 0 && outgoingSummary.total === 0)}
          onClick={async () => {
            try {
              setSendingNow(true)
              const response = await fetch("/api/admin-digest", {
                method: "POST",
              })

              if (!response.ok) {
                const message = await response.text()
                throw new Error(message || "Mailversand konnte nicht gestartet werden.")
              }

              const data = await response.json()
              if (data.skipped) {
                alert("Zurzeit liegen keine offenen Mails im Ausgang.")
              } else {
                alert(`Versand gestartet. ${data.count} Mail(s) wurden verarbeitet.`)
              }
              await loadMailData()
            } catch (error) {
              console.error(error)
              alert(error instanceof Error ? error.message : "Mailversand konnte nicht gestartet werden.")
            } finally {
              setSendingNow(false)
            }
          }}
        >
          {sendingNow ? "Versendet..." : "Versandordner jetzt senden"}
        </Button>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-600">
          Automatisch werktags um 09:00 Uhr. Bei Bedarf kannst du sofort manuell senden.
        </div>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{loadError}</div>
      ) : null}

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Menü</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline" className="rounded-2xl">
            <a href="#admin-sammelmail">Admin-Sammelmail</a>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl border-[#e6332a] text-[#e6332a] hover:bg-red-50">
            <a href="#entwuerfe">Entwürfe</a>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl">
            <a href="#wettkampf-mails">Wettkampf-Mails</a>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Maildienst</div>
            <div className="mt-1 text-3xl font-bold text-zinc-900">
              {loading ? "…" : mailConfig?.configured ? "Aktiv" : "Offen"}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Admin-Sammelmail offen</div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">{loading ? "…" : adminDigestSummary.total}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Wettkampf-Mails offen</div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">{loading ? "…" : outgoingSummary.total}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Versandzeit</div>
            <div className="mt-1 text-3xl font-bold text-zinc-900">Mo-Fr 09:00</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm" id="admin-sammelmail">
        <CardHeader>
          <CardTitle>Konfiguration</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            <div className="font-semibold text-zinc-900">Absender</div>
            <div className="mt-1">{mailConfig?.from || "—"}</div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            <div className="font-semibold text-zinc-900">Reply-To</div>
            <div className="mt-1">{mailConfig?.reply_to || "—"}</div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            <div className="font-semibold text-zinc-900">Öffentliche Basis-URL</div>
            <div className="mt-1">{mailConfig?.app_base_url || "—"}</div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            <div className="font-semibold text-zinc-900">Admin-Mailadresse</div>
            <div className="mt-1">{mailConfig?.admin_notification_email || "—"}</div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            <div className="font-semibold text-zinc-900">Server-Key</div>
            <div className="mt-1">{mailConfig?.using_server_key ? "Ja" : "Nein"}</div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            <div className="font-semibold text-zinc-900">Public Fallback</div>
            <div className="mt-1">{mailConfig?.using_public_fallback ? "Aktiv" : "Aus"}</div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Admin-Sammelmail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Mitglieder</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900">{adminDigestSummary.members}</div>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Trainer</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900">{adminDigestSummary.trainers}</div>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Boxzwerge</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900">{adminDigestSummary.boxzwerge}</div>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Zuletzt eingegangen</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">
                {adminDigestSummary.latest ? formatDisplayDateTime(new Date(adminDigestSummary.latest.created_at)) : "—"}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {adminQueueRows.length === 0 ? (
              <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine offenen Einträge in der Admin-Sammelmail.</div>
            ) : (
              adminQueueRows.slice(0, 10).map((row) => (
                <div key={row.id} className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-zinc-900">{row.member_name}</div>
                    <Badge variant="outline" className="border-blue-200 bg-blue-100 text-blue-800">
                      {getKindLabel(row.kind)}
                    </Badge>
                  </div>
                  <div className="mt-1">{row.email || "Keine E-Mail gespeichert"}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {row.group_name || "Ohne Gruppe"} · {formatDisplayDateTime(new Date(row.created_at))}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm" id="eltern-einzelmail">
        <CardHeader>
          <CardTitle>Elternmails vorbereiten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Familienmails vorbereitet</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900">{loading ? "…" : visibleParentOutboxRows.length}</div>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Direktlinks enthalten</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900">{loading ? "…" : visibleParentOutboxRows.length}</div>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Ziel</div>
              <div className="mt-1 font-semibold text-zinc-900">Ein Elternkonto mit allen Kindern</div>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Jede Mail ist pro Familie vorbereitet.</span>
              <InfoHint text="Jeder Eintrag enthält eine eigene Mail an ein Elternkonto mit direktem Link in den Elternbereich. Wenn mehrere Kinder wie bei Familie Wieding zu einem Elternkonto gehören, stehen sie gemeinsam in derselben Mail." />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            Die Elternmails stehen unten gesammelt im Bereich <span className="font-semibold text-zinc-900">Entwürfe</span> und werden erst beim Klick auf <span className="font-semibold text-zinc-900">Mail manuell senden</span> in dein Mailprogramm übernommen.
          </div>

          {visibleParentOutboxRows.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Noch keine Elternmails im Entwürfe-Bereich vorhanden.</div>
          ) : (
            <div className="rounded-2xl border border-[#e6332a]/20 bg-red-50/60 p-4 text-sm text-zinc-700">
              <div className="font-semibold text-zinc-900">Elternmails sind vorbereitet.</div>
              <div className="mt-1">
                {visibleParentOutboxRows.length} Entwurf{visibleParentOutboxRows.length === 1 ? "" : "e"} liegen unten im Bereich <span className="font-semibold text-zinc-900">Entwürfe</span> bereit.
              </div>
              <div className="mt-3">
                <Button asChild className="rounded-2xl bg-[#e6332a] text-white hover:bg-[#c92b23]">
                  <a href="#entwuerfe">Zu den Entwürfen</a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm" id="entwuerfe">
        <CardHeader>
          <CardTitle>Entwürfe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl border-[#e6332a] text-[#e6332a] hover:bg-red-50"
              disabled={buildingParentDrafts || loading}
              onClick={async () => {
                try {
                  setBuildingParentDrafts(true)
                  setLoadError("")
                  const response = await fetch("/api/admin/parent-mail-outbox", {
                    method: "POST",
                  })

                  if (response.status === 401) {
                    throw new Error("Admin-Sitzung abgelaufen. Bitte im Adminzugang neu anmelden.")
                  }

                  if (!response.ok) {
                    throw new Error((await response.text()) || "Entwürfe konnten nicht vorbereitet werden.")
                  }

                  await loadMailData()
                } catch (error) {
                  console.error(error)
                  setLoadError(error instanceof Error ? error.message : "Entwürfe konnten nicht vorbereitet werden.")
                } finally {
                  setBuildingParentDrafts(false)
                }
              }}
            >
              {buildingParentDrafts ? "Entwürfe werden aufgebaut..." : "Eltern-Entwürfe neu aufbauen"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              disabled={loading}
              onClick={() => {
                void loadMailData()
              }}
            >
              Entwürfe neu laden
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Eltern-Entwürfe</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900">{loading ? "…" : visibleParentOutboxRows.length}</div>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Versandart</div>
              <div className="mt-1 font-semibold text-zinc-900">Nur manuell einzeln</div>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Automatik</div>
              <div className="mt-1 font-semibold text-zinc-900">Ausgeschlossen</div>
            </div>
          </div>

          {visibleParentOutboxRows.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Noch keine Elternmails im Postausgang.</div>
          ) : (
            <div className="space-y-4">
              {visibleParentOutboxRows.map((row) => {
                const params = new URLSearchParams({
                  subject: row.subject,
                  body: row.body,
                })

                return (
                  <div key={row.id} className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2">
                        <div className="text-lg font-semibold text-zinc-900">{row.parent_name}</div>
                        <div className="text-sm text-zinc-600">{row.parent_email}</div>
                        <div className="text-sm text-zinc-500">{row.parent_phone || "Telefon offen"}</div>
                        <div className="text-xs text-zinc-500">Im Postausgang seit {formatDisplayDateTime(new Date(row.created_at))}</div>
                      </div>

                      <div className="flex flex-wrap gap-3 xl:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl"
                          onClick={async () => {
                            await navigator.clipboard.writeText(row.link)
                            alert("Direktlink kopiert.")
                          }}
                        >
                          Link kopieren
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl"
                          onClick={async () => {
                            await navigator.clipboard.writeText(row.body)
                            alert("Mailtext kopiert.")
                          }}
                        >
                          Text kopieren
                        </Button>
                        <Button asChild className="rounded-2xl bg-[#e6332a] text-white hover:bg-[#c92b23]">
                          <a href={`mailto:${row.parent_email}?${params.toString()}`}>Mail manuell senden</a>
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                        <div className="font-semibold text-zinc-900">Kinder im Elternkonto</div>
                        <div className="mt-2 space-y-1">
                          {row.children.map((child) => (
                            <div key={child.member_id}>
                              {child.child_name}
                              {child.child_birthdate ? ` · ${child.child_birthdate}` : ""}
                              {child.child_group ? ` · ${child.child_group}` : ""}
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 font-semibold text-zinc-900">Betreff</div>
                        <div className="mt-2">{row.subject}</div>
                        <div className="mt-4 font-semibold text-zinc-900">Direktlink</div>
                        <div className="mt-2 break-all">{row.link}</div>
                      </div>
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                        <div className="font-semibold text-zinc-900">Mailtext</div>
                        <div className="mt-2 whitespace-pre-wrap leading-relaxed">{row.body}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm" id="wettkampf-mails">
        <CardHeader>
          <CardTitle>Ausgehende Wettkampf-Mails</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Neu zugewiesen</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900">{outgoingSummary.assigned}</div>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Entfernt</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900">{outgoingSummary.removed}</div>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Untersuchung Sportler</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900">{outgoingSummary.medicalMember}</div>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Untersuchung Admin</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900">{outgoingSummary.medicalAdmin}</div>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="text-zinc-500">Zuletzt eingegangen</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">
                {outgoingSummary.latest ? formatDisplayDateTime(new Date(outgoingSummary.latest.created_at)) : "—"}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Automatischer Versand werktags um 09:00 Uhr.</span>
              <InfoHint text="Wettkämpfer-Mails werden gesammelt und automatisch werktags um 09:00 Uhr verschickt. Bei Bedarf kannst du den Versand oben sofort auslösen." />
            </div>
          </div>

          <div className="space-y-3">
            {outgoingQueueRows.length === 0 ? (
              <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine offenen Wettkampf-Mails im Ausgang.</div>
            ) : (
              outgoingQueueRows.slice(0, 10).map((row) => (
                <div key={row.id} className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-zinc-900">{row.name || row.email}</div>
                    <Badge variant="outline" className="border-blue-200 bg-blue-100 text-blue-800">
                      {getOutgoingPurposeLabel(row.purpose)}
                    </Badge>
                  </div>
                  <div className="mt-1">{row.email}</div>
                  <div className="mt-1 text-xs text-zinc-500">{formatDisplayDateTime(new Date(row.created_at))}</div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
