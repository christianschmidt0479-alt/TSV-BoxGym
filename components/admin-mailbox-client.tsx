"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCheck, ChevronLeft, FileText, MailPlus, Send, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { AdminMailboxRecord } from "@/lib/adminMailbox"
import { getMailboxStatusLabel, getMailboxTypeLabel } from "@/lib/adminMailbox"
import { formatDisplayDateTime } from "@/lib/dateFormat"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type AdminMailboxClientProps = {
  basePath: string
  backHref: string
  detailId?: string | null
}

type MailboxPayload = {
  inbox: AdminMailboxRecord[]
  drafts: AdminMailboxRecord[]
}

type MailboxTab = "inbox" | "drafts"

function getTabFromSearchParam(value: string | null): MailboxTab {
  return value === "drafts" ? "drafts" : "inbox"
}

function buildTabHref(basePath: string, tab: MailboxTab) {
  return `${basePath}?tab=${tab}`
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = "Aktion konnte nicht abgeschlossen werden."

    try {
      const payload = (await response.json()) as { error?: string }
      if (typeof payload.error === "string" && payload.error.trim()) {
        errorMessage = payload.error.trim()
      }
    } catch {
      // Fall back to a generic message when the error body is not valid JSON.
    }

    throw new Error(errorMessage)
  }

  return (await response.json()) as T
}

export function AdminMailboxClient({ basePath, backHref, detailId }: AdminMailboxClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [aiBusy, setAiBusy] = useState<"reply" | "summary" | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [summaryText, setSummaryText] = useState("")
  const [data, setData] = useState<MailboxPayload>({ inbox: [], drafts: [] })
  const [selectedId, setSelectedId] = useState<string | null>(detailId ?? null)
  const [draftForm, setDraftForm] = useState({ to: "", subject: "", content: "" })
  const activeTab = getTabFromSearchParam(searchParams.get("tab"))
  const isDetailPage = Boolean(detailId)

  async function loadMailbox() {
    try {
      setLoading(true)
      setError("")

      const payload = await readJson<{ inbox?: AdminMailboxRecord[]; drafts?: AdminMailboxRecord[] }>(
        await fetch("/api/admin/mailbox", { cache: "no-store" })
      )

      setData({
        inbox: payload.inbox ?? [],
        drafts: payload.drafts ?? [],
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Postfach konnte nicht geladen werden.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }

    void loadMailbox()
  }, [authResolved, trainerRole])

  const visibleItems = useMemo(() => (activeTab === "drafts" ? data.drafts : data.inbox), [activeTab, data.drafts, data.inbox])

  useEffect(() => {
    if (isDetailPage) return
    if (visibleItems.length === 0) {
      setSelectedId(null)
      return
    }

    setSelectedId((current) => (current && visibleItems.some((item) => item.id === current) ? current : visibleItems[0]?.id ?? null))
  }, [isDetailPage, visibleItems])

  const selectedRecord = useMemo(() => {
    if (isDetailPage && detailId) {
      return [...data.inbox, ...data.drafts].find((item) => item.id === detailId) ?? null
    }

    return visibleItems.find((item) => item.id === selectedId) ?? null
  }, [data.drafts, data.inbox, detailId, isDetailPage, selectedId, visibleItems])

  useEffect(() => {
    setError("")
    setSuccess("")
    setSummaryText("")

    if (!selectedRecord || selectedRecord.type !== "draft") {
      return
    }

    setDraftForm({
      to: selectedRecord.to,
      subject: selectedRecord.subject,
      content: selectedRecord.content,
    })
  }, [selectedRecord])

  function switchTab(nextTab: MailboxTab, nextSelected?: string | null) {
    const target = buildTabHref(basePath, nextTab)
    setSelectedId(nextSelected ?? null)
    router.replace(target)
  }

  async function patchMailboxRecord(recordId: string, payload: Record<string, unknown>) {
    return readJson<{ record: AdminMailboxRecord }>(
      await fetch(`/api/admin/mailbox/${encodeURIComponent(recordId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    )
  }

  async function handleSaveDraft() {
    if (!selectedRecord || selectedRecord.type !== "draft") return

    try {
      setSaving(true)
      setError("")
      setSuccess("")

      await patchMailboxRecord(selectedRecord.id, draftForm)
      await loadMailbox()
      setSuccess("Entwurf gespeichert.")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Entwurf konnte nicht gespeichert werden.")
    } finally {
      setSaving(false)
    }
  }

  async function handleSendDraft() {
    if (!selectedRecord || selectedRecord.type !== "draft") return

    try {
      setSending(true)
      setError("")
      setSuccess("")

      await patchMailboxRecord(selectedRecord.id, draftForm)
      await readJson(
        await fetch(`/api/admin/mailbox/${encodeURIComponent(selectedRecord.id)}/send`, {
          method: "POST",
        })
      )

      await loadMailbox()
      setSuccess("Entwurf gesendet.")

      if (isDetailPage) {
        router.replace(buildTabHref(basePath, "drafts"))
      } else {
        setSelectedId(data.drafts.find((row) => row.id !== selectedRecord.id)?.id ?? null)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Entwurf konnte nicht gesendet werden.")
    } finally {
      setSending(false)
    }
  }

  async function handleMarkDone() {
    if (!selectedRecord) return

    try {
      setSaving(true)
      setError("")
      setSuccess("")

      await patchMailboxRecord(selectedRecord.id, { status: "done" })
      await loadMailbox()
      setSuccess("Nachricht als erledigt markiert.")

      if (isDetailPage) {
        router.replace(buildTabHref(basePath, "inbox"))
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Status konnte nicht gespeichert werden.")
    } finally {
      setSaving(false)
    }
  }

  async function createReplyDraft() {
    if (!selectedRecord) throw new Error("Keine Nachricht ausgewählt.")

    const result = await readJson<{ draft: AdminMailboxRecord }>(
      await fetch("/api/admin/mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", sourceId: selectedRecord.id }),
      })
    )

    await loadMailbox()
    switchTab("drafts", result.draft.id)
    return result.draft
  }

  async function runAi(mode: "reply" | "summary") {
    if (!selectedRecord) return

    try {
      setAiBusy(mode)
      setError("")
      setSuccess("")

      if (mode === "summary") {
        const result = await readJson<{ text: string; usedFallback?: boolean }>(
          await fetch("/api/admin/mail-ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode,
              subject: selectedRecord.subject,
              content: selectedRecord.content,
            }),
          })
        )

        setSummaryText(result.text)
        setSuccess(result.usedFallback ? "Zusammenfassung mit Fallback erstellt." : "Zusammenfassung erstellt.")
        return
      }

      let targetDraft = selectedRecord
      if (selectedRecord.type !== "draft") {
        targetDraft = await createReplyDraft()
      }

      const result = await readJson<{ text: string; usedFallback?: boolean }>(
        await fetch("/api/admin/mail-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            subject: selectedRecord.subject,
            content: selectedRecord.content,
          }),
        })
      )

      await patchMailboxRecord(targetDraft.id, { content: result.text })
      await loadMailbox()
      switchTab("drafts", targetDraft.id)
      setSuccess(result.usedFallback ? "Antwortvorschlag mit Fallback erstellt." : "Antwortvorschlag erstellt.")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "KI-Aktion fehlgeschlagen.")
    } finally {
      setAiBusy(null)
    }
  }

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Postfach</CardTitle>
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

  const detailContent = selectedRecord ? (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-[#b9cde2] bg-[#eef4fb] text-[#154c83]">
            {getMailboxTypeLabel(selectedRecord.type)}
          </Badge>
          <Badge variant="outline" className="border-zinc-200 bg-zinc-100 text-zinc-700">
            {getMailboxStatusLabel(selectedRecord.status)}
          </Badge>
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900">{selectedRecord.subject}</h2>
          <div className="mt-2 space-y-1 text-sm text-zinc-600">
            <div>Von: {selectedRecord.from || "—"}</div>
            <div>An: {selectedRecord.to || "—"}</div>
            <div>{formatDisplayDateTime(new Date(selectedRecord.created_at))}</div>
          </div>
        </div>
      </div>

      {summaryText ? <div className="rounded-3xl border border-[#d8e3ee] bg-[#f7fbff] p-4 text-sm text-zinc-700">{summaryText}</div> : null}

      {selectedRecord.type === "draft" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">An</label>
            <Input
              value={draftForm.to}
              onChange={(event) => setDraftForm((current) => ({ ...current, to: event.target.value }))}
              className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Betreff</label>
            <Input
              value={draftForm.subject}
              onChange={(event) => setDraftForm((current) => ({ ...current, subject: event.target.value }))}
              className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Inhalt</label>
            <Textarea
              value={draftForm.content}
              onChange={(event) => setDraftForm((current) => ({ ...current, content: event.target.value }))}
              className="min-h-[320px] rounded-2xl border-zinc-300 bg-white text-zinc-900"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]" disabled={saving || sending} onClick={() => void handleSaveDraft()}>
              <FileText className="h-4 w-4" />
              Speichern
            </Button>
            <Button className="rounded-2xl bg-[#e6332a] text-white hover:bg-[#c52c24]" disabled={saving || sending} onClick={() => void handleSendDraft()}>
              <Send className="h-4 w-4" />
              Senden
            </Button>
            <Button type="button" variant="outline" className="rounded-2xl" disabled={aiBusy !== null} onClick={() => void runAi("summary")}>
              <Sparkles className="h-4 w-4" />
              Zusammenfassen (KI)
            </Button>
            <Button type="button" variant="outline" className="rounded-2xl" disabled={aiBusy !== null} onClick={() => void runAi("reply")}>
              <Sparkles className="h-4 w-4" />
              Antwort verbessern (KI)
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="whitespace-pre-wrap rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-800">{selectedRecord.content}</div>

          <div className="flex flex-wrap gap-3">
            <Button className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]" disabled={saving || aiBusy !== null} onClick={() => void createReplyDraft()}>
              <MailPlus className="h-4 w-4" />
              Antworten
            </Button>
            <Button type="button" variant="outline" className="rounded-2xl" disabled={saving || aiBusy !== null} onClick={() => void runAi("reply")}>
              <Sparkles className="h-4 w-4" />
              Antwort vorschlagen (KI)
            </Button>
            <Button type="button" variant="outline" className="rounded-2xl" disabled={saving || aiBusy !== null} onClick={() => void runAi("summary")}>
              <Sparkles className="h-4 w-4" />
              Zusammenfassen (KI)
            </Button>
            <Button type="button" variant="outline" className="rounded-2xl" disabled={saving} onClick={() => void handleMarkDone()}>
              <CheckCheck className="h-4 w-4" />
              Als erledigt markieren
            </Button>
          </div>
        </>
      )}
    </div>
  ) : (
    <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500">
      {loading ? "Postfach wird geladen..." : "Keine Nachricht ausgewählt."}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Postfach</h1>
          <p className="text-sm text-zinc-500">Kompakter Eingang und bearbeitbare Entwürfe mit KI-Helfern für Antwort und Zusammenfassung.</p>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href={backHref}>Zurück zur Übersicht</Link>
        </Button>
      </div>

      <Tabs value={activeTab} className="space-y-4">
        <TabsList variant="line" className="rounded-2xl border border-[#d8e3ee] bg-white p-1">
          <TabsTrigger value="inbox" className="rounded-xl px-4 py-2" onClick={() => switchTab("inbox", null)}>
            Eingang
            <Badge variant="outline" className="ml-2 border-zinc-200 bg-zinc-100 text-zinc-700">
              {data.inbox.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="drafts" className="rounded-xl px-4 py-2" onClick={() => switchTab("drafts", null)}>
            Entwürfe
            <Badge variant="outline" className="ml-2 border-zinc-200 bg-zinc-100 text-zinc-700">
              {data.drafts.length}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}

      {isDetailPage ? (
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Detail</CardTitle>
            <Button asChild variant="outline" className="rounded-2xl">
              <Link href={buildTabHref(basePath, activeTab)}>
                <ChevronLeft className="h-4 w-4" />
                Zur Liste
              </Link>
            </Button>
          </CardHeader>
          <CardContent>{detailContent}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardHeader>
              <CardTitle>{activeTab === "drafts" ? "Entwürfe" : "Eingang"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Postfach wird geladen...</div>
              ) : visibleItems.length === 0 ? (
                <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine Einträge vorhanden.</div>
              ) : (
                visibleItems.map((item) => {
                  const active = item.id === selectedId
                  const itemHref = `${basePath}/${encodeURIComponent(item.id)}?tab=${activeTab}`

                  return (
                    <div key={item.id}>
                      <Link
                        href={itemHref}
                        className="block rounded-3xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-[#154c83] hover:bg-white lg:hidden"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="truncate font-semibold text-zinc-900">{item.subject}</div>
                            <div className="text-xs text-zinc-500">{item.from || item.to || "—"}</div>
                            <div className="overflow-hidden text-sm leading-5 text-zinc-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                              {item.snippet}
                            </div>
                          </div>
                          <div className="text-right text-xs text-zinc-500">{formatDisplayDateTime(new Date(item.created_at))}</div>
                        </div>
                      </Link>

                      <button
                        type="button"
                        className={`hidden w-full rounded-3xl border p-4 text-left transition lg:block ${
                          active ? "border-[#154c83] bg-[#eef4fb]" : "border-zinc-200 bg-zinc-50 hover:border-[#154c83] hover:bg-white"
                        }`}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="truncate font-semibold text-zinc-900">{item.subject}</div>
                            <div className="text-xs text-zinc-500">{item.from || item.to || "—"}</div>
                            <div className="overflow-hidden text-sm leading-5 text-zinc-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                              {item.snippet}
                            </div>
                          </div>
                          <div className="text-right text-xs text-zinc-500">{formatDisplayDateTime(new Date(item.created_at))}</div>
                        </div>
                      </button>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <Card className="hidden rounded-[24px] border-0 shadow-sm lg:block">
            <CardHeader>
              <CardTitle>Detail</CardTitle>
            </CardHeader>
            <CardContent>{detailContent}</CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}