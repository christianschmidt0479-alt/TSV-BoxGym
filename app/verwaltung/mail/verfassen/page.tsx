"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AdminMailDraftPreview, AdminMailDraftRequest } from "@/lib/adminMailComposer"

type RoutePayload = {
  title?: string
  returnTo?: string
  requests?: AdminMailDraftRequest[]
}

type EditableDraft = AdminMailDraftPreview & {
  request: AdminMailDraftRequest
}

export default function MailVerfassenPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [payload, setPayload] = useState<RoutePayload | null>(null)
  const [drafts, setDrafts] = useState<EditableDraft[]>([])

  const rawDraft = searchParams.get("draft") || ""

  useEffect(() => {
    let cancelled = false

    async function loadDrafts() {
      try {
        setLoading(true)
        setError("")
        setSuccess("")

        if (!rawDraft) {
          throw new Error("Kein Mail-Entwurf übergeben.")
        }

        const parsed = JSON.parse(rawDraft) as RoutePayload
        const requests = Array.isArray(parsed.requests) ? parsed.requests : []

        if (requests.length === 0) {
          throw new Error("Keine Mail-Anfrage übergeben.")
        }

        const response = await fetch("/api/admin/mail-compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        })

        if (!response.ok) {
          throw new Error((await response.text()) || "Entwurf konnte nicht geladen werden.")
        }

        const result = (await response.json()) as { drafts?: AdminMailDraftPreview[] }
        if (cancelled) return

        setPayload(parsed)
        setDrafts((result.drafts ?? []).map((draft, index) => ({ ...draft, request: requests[index] })))
      } catch (nextError) {
        if (cancelled) return
        setError(nextError instanceof Error ? nextError.message : "Entwurf konnte nicht geladen werden.")
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadDrafts()

    return () => {
      cancelled = true
    }
  }, [rawDraft])

  const pageTitle = useMemo(() => {
    return payload?.title?.trim() || "Mail vor dem Versand bearbeiten"
  }, [payload])

  const returnTo = payload?.returnTo?.trim() || "/verwaltung/mail"

  useEffect(() => {
    if (!success) return

    const timeoutId = window.setTimeout(() => {
      router.push(returnTo)
    }, 1800)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [returnTo, router, success])

  async function sendDrafts() {
    try {
      setSending(true)
      setError("")
      setSuccess("")

      const response = await fetch("/api/admin/mail-compose", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drafts: drafts.map((draft) => ({
            request: draft.request,
            to: draft.to,
            subject: draft.subject,
            body: draft.body,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error((await response.text()) || "Mail konnte nicht versendet werden.")
      }

      const result = (await response.json()) as {
        deliveries?: Array<{ successMessage?: string }>
      }
      const message = result.deliveries?.map((entry) => entry.successMessage).filter(Boolean).join(" · ") || "Mail versendet"
      setSuccess(message)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Mail konnte nicht versendet werden.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{pageTitle}</h1>
          <p className="text-sm text-zinc-500">Empfänger, Betreff und Inhalt können hier vor dem Versand angepasst werden.</p>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href={returnTo}>Zurück</Link>
        </Button>
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Versand</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]" disabled={loading || sending || drafts.length === 0} onClick={() => void sendDrafts()}>
            {sending ? "Versendet..." : drafts.length > 1 ? `Alle ${drafts.length} Mails senden` : "Mail senden"}
          </Button>
          <Button type="button" variant="outline" className="rounded-2xl" disabled={sending} onClick={() => router.push(returnTo)}>
            Abbrechen
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Entwurf wird geladen...</div>
      ) : drafts.length === 0 ? (
        <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine Mail vorhanden.</div>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft, index) => (
            <Card key={`${draft.kind}-${index}`} className="rounded-[24px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>{draft.subject}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {draft.topicSuggestions && draft.topicSuggestions.length > 0 ? (
                  <div className="space-y-2">
                    <Label>Themenvorschläge</Label>
                    <div className="flex flex-wrap gap-2">
                      {draft.topicSuggestions.map((topic) => (
                        <Button
                          key={`${topic.id}-${index}`}
                          type="button"
                          variant="outline"
                          className="rounded-2xl"
                          onClick={() =>
                            setDrafts((current) =>
                              current.map((entry, currentIndex) =>
                                currentIndex === index
                                  ? { ...entry, subject: topic.subject, body: topic.body }
                                  : entry
                              )
                            )
                          }
                        >
                          {topic.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Empfänger</Label>
                    <Input
                      type="email"
                      value={draft.to}
                      onChange={(event) =>
                        setDrafts((current) => current.map((entry, currentIndex) => (currentIndex === index ? { ...entry, to: event.target.value } : entry)))
                      }
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reply-To</Label>
                    <Input value={draft.replyTo} disabled className="rounded-2xl border-zinc-300 bg-zinc-50 text-zinc-600" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Betreff</Label>
                  <Input
                    value={draft.subject}
                    onChange={(event) =>
                      setDrafts((current) => current.map((entry, currentIndex) => (currentIndex === index ? { ...entry, subject: event.target.value } : entry)))
                    }
                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Mailtext</Label>
                  <Textarea
                    value={draft.body}
                    onChange={(event) =>
                      setDrafts((current) => current.map((entry, currentIndex) => (currentIndex === index ? { ...entry, body: event.target.value } : entry)))
                    }
                    className="min-h-[320px] rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}