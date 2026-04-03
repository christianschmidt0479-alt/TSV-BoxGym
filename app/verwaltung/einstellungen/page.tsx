"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { buildAdminMailComposeHref } from "@/lib/adminMailComposeClient"
import { ADMIN_PASSWORD_HINT, ADMIN_PASSWORD_REQUIREMENTS_MESSAGE, isTrainerPinCompliant } from "@/lib/trainerPin"
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

type CheckinSettingsResponse = {
  disableCheckinTimeWindow: boolean
}

export default function EinstellungenPage() {
  const router = useRouter()
  const { resolved: authResolved, role: trainerRole, accountEmail } = useTrainerAccess()
  const [mailTestEmail, setMailTestEmail] = useState("")
  const [mailTestName, setMailTestName] = useState("Testmitglied")
  const [mailTestSending, setMailTestSending] = useState(false)
  const [mailConfigured, setMailConfigured] = useState<boolean | null>(null)
  const [mailConfigSource, setMailConfigSource] = useState("")
  const [mailFromAddress, setMailFromAddress] = useState("")
  const [mailReplyToAddress, setMailReplyToAddress] = useState("")
  const [mailAdminAddress, setMailAdminAddress] = useState("")
  const [mailAppBaseUrl, setMailAppBaseUrl] = useState("")
  const [disableCheckinTimeWindow, setDisableCheckinTimeWindow] = useState(false)
  const [checkinSettingsLoading, setCheckinSettingsLoading] = useState(true)
  const [checkinSettingsSaving, setCheckinSettingsSaving] = useState(false)
  const [currentAdminPassword, setCurrentAdminPassword] = useState("")
  const [newAdminPassword, setNewAdminPassword] = useState("")
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("")
  const [adminPasswordSaving, setAdminPasswordSaving] = useState(false)
  const [adminPasswordFeedback, setAdminPasswordFeedback] = useState<{ tone: "error" | "success"; message: string } | null>(null)

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") return

    ;(async () => {
      try {
        const response = await fetch("/api/send-verification", { method: "PUT", cache: "no-store" })
        if (!response.ok) {
          setMailConfigured(false)
          setMailConfigSource("")
          setMailFromAddress("")
          setMailReplyToAddress("")
          setMailAdminAddress("")
          setMailAppBaseUrl("")
          return
        }

        const data = (await response.json()) as MailConfigResponse
        setMailConfigured(Boolean(data.configured))
        setMailConfigSource(
          data.using_server_key ? "RESEND_API_KEY" : data.using_public_fallback ? "NEXT_PUBLIC_RESEND_API_KEY" : ""
        )
        setMailFromAddress(typeof data.from === "string" ? data.from : "")
        setMailReplyToAddress(typeof data.reply_to === "string" ? data.reply_to : "")
        setMailAdminAddress(typeof data.admin_notification_email === "string" ? data.admin_notification_email : "")
        setMailAppBaseUrl(typeof data.app_base_url === "string" ? data.app_base_url : "")
      } catch (error) {
        console.error("Mail status loading failed", error)
        setMailConfigured(false)
        setMailConfigSource("")
        setMailFromAddress("")
        setMailReplyToAddress("")
        setMailAdminAddress("")
        setMailAppBaseUrl("")
      }
    })()
  }, [authResolved, trainerRole])

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") return

    ;(async () => {
      try {
        setCheckinSettingsLoading(true)
        const response = await fetch("/api/admin/checkin-settings", { method: "GET", cache: "no-store" })
        if (!response.ok) {
          setDisableCheckinTimeWindow(false)
          return
        }

        const data = (await response.json()) as CheckinSettingsResponse
        setDisableCheckinTimeWindow(Boolean(data.disableCheckinTimeWindow))
      } catch (error) {
        console.error("Checkin settings loading failed", error)
        setDisableCheckinTimeWindow(false)
      } finally {
        setCheckinSettingsLoading(false)
      }
    })()
  }, [authResolved, trainerRole])

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Einstellungen</CardTitle>
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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Einstellungen</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/verwaltung/inbox">Inbox</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/verwaltung/mail">Mail-Verwaltung</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/verwaltung">Zurück zur Übersicht</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Mail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-600">
            <div className="rounded-2xl bg-zinc-100 p-4">
              Status: <span className="font-semibold text-zinc-900">{mailConfigured ? "Aktiv" : "Prüfen"}</span>
            </div>
            <Button asChild variant="outline" className="w-full rounded-2xl">
              <Link href="/verwaltung/mail">Mail-Verwaltung öffnen</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Betrieb</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-600">
            <div className="rounded-2xl bg-zinc-100 p-4">
              Schnelle Wege in Tagesgeschäft und Prioritäten.
            </div>
            <Button asChild variant="outline" className="w-full rounded-2xl">
              <Link href="/verwaltung/heute">Heute öffnen</Link>
            </Button>
            <Button asChild variant="outline" className="w-full rounded-2xl">
              <Link href="/verwaltung/inbox">Inbox öffnen</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>System</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-600">
            <div className="rounded-2xl bg-zinc-100 p-4">
              App-Basis: <span className="font-semibold text-zinc-900">{mailAppBaseUrl || "—"}</span>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4">
              Reply-To: <span className="font-semibold text-zinc-900">{mailReplyToAddress || "—"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Mail-Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`rounded-2xl border p-4 text-sm ${
              mailConfigured
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {mailConfigured
              ? `Mailversand konfiguriert${mailConfigSource ? ` via ${mailConfigSource}` : ""}${mailFromAddress ? ` · Absender: ${mailFromAddress}` : ""}`
              : "Mailversand ist aktuell nicht vollständig konfiguriert. Bitte RESEND_API_KEY und RESEND_FROM_EMAIL prüfen."}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <div className="font-semibold text-zinc-900">Absender</div>
              <div className="mt-1">{mailFromAddress || "—"}</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <div className="font-semibold text-zinc-900">Reply-To</div>
              <div className="mt-1">{mailReplyToAddress || "—"}</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <div className="font-semibold text-zinc-900">Admin-Mail</div>
              <div className="mt-1">{mailAdminAddress || "—"}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Empfänger</Label>
              <Input
                type="email"
                value={mailTestEmail}
                onChange={(event) => setMailTestEmail(event.target.value)}
                placeholder="test@beispiel.de"
                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
              />
            </div>

            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={mailTestName}
                onChange={(event) => setMailTestName(event.target.value)}
                placeholder="Testmitglied"
                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
              />
            </div>
          </div>

          <Button
            className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
            disabled={mailTestSending}
            onClick={async () => {
              if (!mailTestEmail.trim()) {
                alert("Bitte eine Empfänger-E-Mail angeben.")
                return
              }

              try {
                setMailTestSending(true)
                router.push(
                  buildAdminMailComposeHref({
                    title: "Probe-Mail bearbeiten",
                    returnTo: "/verwaltung/einstellungen",
                    requests: [
                      {
                        kind: "verification",
                        email: mailTestEmail.trim(),
                        name: mailTestName.trim() || "Testmitglied",
                        link: window.location.origin,
                        targetKind: "member",
                      },
                    ],
                  })
                )
              } catch (error) {
                console.error(error)
                const message = error instanceof Error ? error.message : "Mailversand fehlgeschlagen."
                alert(`Probe-Mail fehlgeschlagen: ${message}`)
              } finally {
                setMailTestSending(false)
              }
            }}
          >
            {mailTestSending ? "Sendet..." : "Probe-Mail senden"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Ferienmodus</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`rounded-2xl border p-4 text-sm ${
              disableCheckinTimeWindow
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-green-200 bg-green-50 text-green-800"
            }`}
          >
            {disableCheckinTimeWindow
              ? "Ferienmodus ist aktiv. Die 30-Minuten-Regel ist ausser Kraft und Check-ins sind für heutige Einheiten ganztägig möglich."
              : "Standard aktiv: Check-ins sind nur 30 Minuten vor bis 30 Minuten nach Trainingsbeginn möglich."}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            Einsatzbeispiel: Ferien oder Sonderbetrieb, wenn Mitglieder ausserhalb des normalen Zeitfensters einchecken sollen.
          </div>

          <Button
            className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
            disabled={checkinSettingsLoading || checkinSettingsSaving}
            onClick={async () => {
              try {
                setCheckinSettingsSaving(true)

                const response = await fetch("/api/admin/checkin-settings", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    disableCheckinTimeWindow: !disableCheckinTimeWindow,
                  }),
                })

                if (!response.ok) {
                  const message = await response.text()
                  throw new Error(message || "Schalter konnte nicht gespeichert werden.")
                }

                const result = (await response.json()) as CheckinSettingsResponse
                setDisableCheckinTimeWindow(Boolean(result.disableCheckinTimeWindow))
              } catch (error) {
                console.error(error)
                const message = error instanceof Error ? error.message : "Schalter konnte nicht gespeichert werden."
                alert(`Speichern fehlgeschlagen: ${message}`)
              } finally {
                setCheckinSettingsSaving(false)
              }
            }}
          >
            {checkinSettingsSaving
              ? "Speichert..."
              : disableCheckinTimeWindow
                ? "Ferienmodus beenden"
                : "Ferienmodus aktivieren"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Admin-Passwort</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            Angemeldet als <span className="font-semibold text-zinc-900">{accountEmail || "Admin"}</span>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            Das Passwort für den Admin-Zugang kann hier direkt geändert werden. Es gelten weiterhin dieselben Regeln wie beim Login.
            <div className="mt-2 text-xs text-zinc-500">{ADMIN_PASSWORD_HINT}</div>
          </div>

          {adminPasswordFeedback ? (
            <div
              className={`rounded-2xl border p-4 text-sm ${
                adminPasswordFeedback.tone === "success"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              {adminPasswordFeedback.message}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Aktuelles Passwort</Label>
              <PasswordInput
                value={currentAdminPassword}
                onChange={(event) => setCurrentAdminPassword(event.target.value)}
                placeholder="Aktuelles Passwort"
                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
              />
            </div>
            <div className="space-y-2">
              <Label>Neues Passwort</Label>
              <PasswordInput
                value={newAdminPassword}
                onChange={(event) => setNewAdminPassword(event.target.value)}
                placeholder="Neues Passwort"
                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
              />
            </div>
            <div className="space-y-2">
              <Label>Neues Passwort wiederholen</Label>
              <PasswordInput
                value={confirmAdminPassword}
                onChange={(event) => setConfirmAdminPassword(event.target.value)}
                placeholder="Passwort wiederholen"
                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
              />
            </div>
          </div>

          <Button
            className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
            disabled={adminPasswordSaving}
            onClick={async () => {
              const currentPassword = currentAdminPassword.trim()
              const nextPassword = newAdminPassword.trim()
              const nextPasswordConfirm = confirmAdminPassword.trim()

              if (!currentPassword || !nextPassword || !nextPasswordConfirm) {
                setAdminPasswordFeedback({ tone: "error", message: "Bitte alle Passwort-Felder ausfüllen." })
                return
              }

              if (!isTrainerPinCompliant(nextPassword)) {
                setAdminPasswordFeedback({ tone: "error", message: ADMIN_PASSWORD_REQUIREMENTS_MESSAGE })
                return
              }

              if (nextPassword !== nextPasswordConfirm) {
                setAdminPasswordFeedback({ tone: "error", message: "Die neuen Passwörter stimmen nicht überein." })
                return
              }

              try {
                setAdminPasswordSaving(true)
                setAdminPasswordFeedback(null)

                const response = await fetch("/api/admin/account-password", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    currentPassword,
                    newPassword: nextPassword,
                  }),
                })

                if (!response.ok) {
                  const message = await response.text()
                  throw new Error(message || "Passwort konnte nicht geändert werden.")
                }

                setCurrentAdminPassword("")
                setNewAdminPassword("")
                setConfirmAdminPassword("")
                setAdminPasswordFeedback({ tone: "success", message: "Admin-Passwort wurde aktualisiert." })
              } catch (error) {
                console.error(error)
                const message = error instanceof Error ? error.message : "Passwort konnte nicht geändert werden."
                setAdminPasswordFeedback({ tone: "error", message })
              } finally {
                setAdminPasswordSaving(false)
              }
            }}
          >
            {adminPasswordSaving ? "Speichert..." : "Passwort ändern"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
