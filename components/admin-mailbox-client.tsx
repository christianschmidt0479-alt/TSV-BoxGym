"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCheck, ChevronLeft, FileText, MailPlus, RotateCcw, Send, Sparkles, Trash2 } from "lucide-react"
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
  deleted: AdminMailboxRecord[]
}

type MailboxTab = "inbox" | "drafts" | "compose" | "sent" | "deleted" | "eingehend"

type InboundEmail = {
  id: string
  from_email: string
  to_email: string
  subject: string
  text: string
  received_at: string
}

function getTabFromSearchParam(value: string | null): MailboxTab {
  if (value === "drafts") return "drafts"
  if (value === "compose") return "compose"
  if (value === "sent") return "sent"
  if (value === "deleted") return "deleted"
  if (value === "eingehend") return "eingehend"
  return "inbox"
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
  const [data, setData] = useState<MailboxPayload>({ inbox: [], drafts: [], deleted: [] })
  const [selectedId, setSelectedId] = useState<string | null>(detailId ?? null)
  const [draftForm, setDraftForm] = useState({ to: searchParams.get("to") ?? "", subject: "", content: "" })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [inboundEmails, setInboundEmails] = useState<InboundEmail[]>([])
  const [inboundLoading, setInboundLoading] = useState(false)
  const [inboundError, setInboundError] = useState("")
  const [selectedInboundId, setSelectedInboundId] = useState<string | null>(null)
  const activeTab = getTabFromSearchParam(searchParams.get("tab"))
  const isDetailPage = Boolean(detailId)



  async function loadInboundEmails() {
    try {
      setInboundLoading(true)
      setInboundError("")

      const response = await fetch("/api/admin/inbound-emails", { cache: "no-store" })
      const payload = (await response.json()) as { ok?: boolean; emails?: InboundEmail[]; error?: string }

      if (!response.ok) {
        setInboundError(typeof payload.error === "string" ? payload.error : "Eingehende Mails konnten nicht geladen werden.")
        return
      }

      setInboundEmails(payload.emails ?? [])

      if (payload.emails && payload.emails.length > 0) {
        setSelectedInboundId((current) =>
          current && payload.emails!.some((e) => e.id === current) ? current : (payload.emails![0]?.id ?? null)
        )
      } else {
        setSelectedInboundId(null)
      }
    } catch {
      setInboundError("Eingehende Mails konnten nicht geladen werden.")
    } finally {
      setInboundLoading(false)
    }
  }

  async function loadMailbox() {
    try {
      setLoading(true)
      setError("")

      const payload = await readJson<{ inbox?: AdminMailboxRecord[]; drafts?: AdminMailboxRecord[]; deleted?: AdminMailboxRecord[] }>(
        await fetch("/api/admin/mailbox", { cache: "no-store" })
      )

      setData({
        inbox: payload.inbox ?? [],
        drafts: payload.drafts ?? [],
        deleted: payload.deleted ?? [],
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

  useEffect(() => {
    setSelectedIds([])
  }, [activeTab])

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") return
    if (activeTab === "eingehend") {
      void loadInboundEmails()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, authResolved, trainerRole])

  // Inbox: alle offenen Nachrichten
  const visibleInbox = useMemo(() => data.inbox, [data.inbox])
  // Verlauf: alle gesendeten Nachrichten
  const visibleSent = useMemo(() => {
    return [...data.inbox, ...data.drafts].filter((item) => item.status === "sent")
  }, [data.inbox, data.drafts])
  const visibleDrafts = useMemo(() => data.drafts, [data.drafts])
  const visibleDeleted = useMemo(() => data.deleted, [data.deleted])

  useEffect(() => {
    if (isDetailPage) return
    if (activeTab === "inbox") {
      if (visibleInbox.length === 0) {
        setSelectedId(null)
        return
      }
      setSelectedId((current) => (current && visibleInbox.some((item) => item.id === current) ? current : visibleInbox[0]?.id ?? null))
    } else if (activeTab === "sent") {
      if (visibleSent.length === 0) {
        setSelectedId(null)
        return
      }
      setSelectedId((current) => (current && visibleSent.some((item) => item.id === current) ? current : visibleSent[0]?.id ?? null))
    } else if (activeTab === "compose" || activeTab === "drafts") {
      setSelectedId((current) => (current && visibleDrafts.some((d) => d.id === current) ? current : visibleDrafts[0]?.id ?? null))
    } else if (activeTab === "deleted") {
      setSelectedId((current) => (current && visibleDeleted.some((d) => d.id === current) ? current : visibleDeleted[0]?.id ?? null))
    } else {
      setSelectedId(null)
    }
  }, [isDetailPage, activeTab, visibleInbox, visibleSent, visibleDrafts, visibleDeleted])

  const selectedRecord = useMemo(() => {
    if (isDetailPage && detailId) {
      return [...data.inbox, ...data.drafts, ...data.deleted].find((item) => item.id === detailId) ?? null
    }
    if (activeTab === "inbox") {
      return visibleInbox.find((item) => item.id === selectedId) ?? null
    }
    if (activeTab === "sent") {
      return visibleSent.find((item) => item.id === selectedId) ?? null
    }
    if (activeTab === "compose" || activeTab === "drafts") {
      return visibleDrafts.find((item) => item.id === selectedId) ?? null
    }
    if (activeTab === "deleted") {
      return visibleDeleted.find((item) => item.id === selectedId) ?? null
    }
    return null
  }, [data.drafts, data.inbox, data.deleted, detailId, isDetailPage, selectedId, activeTab, visibleInbox, visibleSent, visibleDrafts, visibleDeleted])

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

  function toggleSelectedId(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function clearSelectedIds() {
    setSelectedIds([])
  }

  function isSelected(id: string) {
    return selectedIds.includes(id)
  }

  function selectAllIds(ids: string[]) {
    setSelectedIds(ids)
  }

  async function handleBulkDelete(ids: string[]) {
    try {
      setBulkBusy(true)
      setError("")
      setSuccess("")
      for (const id of ids) {
        await patchMailboxRecord(id, { status: "deleted" })
      }
      await loadMailbox()
      setSelectedIds([])
      setSelectedId(null)
      setSuccess(`${ids.length} ${ids.length === 1 ? "Eintrag" : "Einträge"} in den Papierkorb verschoben.`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Sammelaktion fehlgeschlagen.")
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleBulkRestore(ids: string[]) {
    try {
      setBulkBusy(true)
      setError("")
      setSuccess("")
      for (const id of ids) {
        await patchMailboxRecord(id, { status: "draft" })
      }
      await loadMailbox()
      setSelectedIds([])
      setSelectedId(null)
      setSuccess(`${ids.length} ${ids.length === 1 ? "Eintrag" : "Einträge"} wiederhergestellt.`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Wiederherstellen fehlgeschlagen.")
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleBulkPermanentDelete(ids: string[]) {
    try {
      setBulkBusy(true)
      setError("")
      setSuccess("")
      for (const id of ids) {
        await readJson(
          await fetch(`/api/admin/mailbox/${encodeURIComponent(id)}`, { method: "DELETE" })
        )
      }
      await loadMailbox()
      setSelectedIds([])
      setSelectedId(null)
      setSuccess(`${ids.length} ${ids.length === 1 ? "Eintrag" : "Einträge"} endgültig gelöscht.`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Löschen fehlgeschlagen.")
    } finally {
      setBulkBusy(false)
    }
  }

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
        router.replace(buildTabHref(basePath, "inbox"))
      } else {
        switchTab("compose", null)
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

  async function handleDeleteRecord(id: string) {
    try {
      setSaving(true)
      setError("")
      setSuccess("")
      await patchMailboxRecord(id, { status: "deleted" })
      await loadMailbox()
      setSuccess("In den Papierkorb verschoben.")
      switchTab("deleted", id)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Nachricht konnte nicht gelöscht werden.")
    } finally {
      setSaving(false)
    }
  }

  async function handleRestoreFromDeleted(id: string) {
    try {
      setSaving(true)
      setError("")
      setSuccess("")
      await patchMailboxRecord(id, { status: "draft" })
      await loadMailbox()
      setSuccess("Entwurf wiederhergestellt.")
      switchTab("drafts", id)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Wiederherstellen fehlgeschlagen.")
    } finally {
      setSaving(false)
    }
  }

  async function handlePermanentDelete(id: string) {
    try {
      setSaving(true)
      setError("")
      setSuccess("")
      await readJson(
        await fetch(`/api/admin/mailbox/${encodeURIComponent(id)}`, { method: "DELETE" })
      )
      await loadMailbox()
      setSuccess("Endgültig gelöscht.")
      setSelectedId(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Löschen fehlgeschlagen.")
    } finally {
      setSaving(false)
    }
  }

  async function handlePermanentDeleteAll() {
    try {
      setSaving(true)
      setError("")
      setSuccess("")
      await Promise.all(
        data.deleted.map(async (item) =>
          readJson(
            await fetch(`/api/admin/mailbox/${encodeURIComponent(item.id)}`, { method: "DELETE" })
          )
        )
      )
      await loadMailbox()
      setSuccess("Papierkorb geleert.")
      setSelectedId(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Papierkorb leeren fehlgeschlagen.")
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
    switchTab("compose", null)
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
      switchTab("compose", null)
      setSuccess(result.usedFallback ? "Antwortvorschlag mit Fallback erstellt." : "Antwortvorschlag erstellt.")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "KI-Aktion fehlgeschlagen.")
    } finally {
      setAiBusy(null)
    }
  }

  async function runAiOnCompose() {
    const content = draftForm.content.trim()
    if (!content) {
      setError("Kein Inhalt vorhanden. Bitte zuerst Text eingeben.")
      return
    }

    try {
      setAiBusy("reply")
      setError("")
      setSuccess("")

      const result = await readJson<{ text: string; usedFallback?: boolean }>(
        await fetch("/api/admin/mail-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "reply", subject: draftForm.subject, content }),
        })
      )

      setDraftForm((current) => ({ ...current, content: result.text }))
      setSuccess(result.usedFallback ? "KI-Vorschlag mit Fallback erstellt." : "KI-Textvorschlag übernommen.")
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
            <Button type="button" variant="outline" className="rounded-2xl text-red-600 hover:border-red-300 hover:bg-red-50" disabled={saving} onClick={() => void handleDeleteRecord(selectedRecord.id)}>
              <Trash2 className="h-4 w-4" />
              Löschen
            </Button>
          </div>
        </>
      )}
    </div>
  ) : (
    <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500">
      {loading ? "Wird geladen\u2026" : "Keine Nachricht ausgewählt."}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Kommunikation</h1>
          <p className="text-sm text-zinc-500">Eingang, Entwürfe, Verfassen, Verlauf und Papierkorb zentral im Postfach.</p>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href={backHref}>Zurück zur Übersicht</Link>
        </Button>
      </div>

      <Tabs value={activeTab} className="space-y-4">
        <TabsList variant="line" className="flex-wrap rounded-2xl border border-[#d8e3ee] bg-white p-1">
          <TabsTrigger value="inbox" className="rounded-xl px-4 py-2" onClick={() => switchTab("inbox", null)}>
            Eingang
            <Badge variant="outline" className="ml-2 border-zinc-200 bg-zinc-100 text-zinc-700">{visibleInbox.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="drafts" className="rounded-xl px-4 py-2" onClick={() => switchTab("drafts", null)}>
            Entwürfe
            {visibleDrafts.length > 0 && (
              <Badge variant="outline" className="ml-2 border-zinc-200 bg-zinc-100 text-zinc-700">{visibleDrafts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="compose" className="rounded-xl px-4 py-2" onClick={() => switchTab("compose", null)}>
            Verfassen
          </TabsTrigger>
          <TabsTrigger value="sent" className="rounded-xl px-4 py-2" onClick={() => switchTab("sent", null)}>
            Verlauf
            <Badge variant="outline" className="ml-2 border-zinc-200 bg-zinc-100 text-zinc-700">{visibleSent.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="deleted" className="rounded-xl px-4 py-2" onClick={() => switchTab("deleted", null)}>
            Gelöscht
            {visibleDeleted.length > 0 && (
              <Badge variant="outline" className="ml-2 border-red-200 bg-red-50 text-red-700">{visibleDeleted.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="eingehend" className="rounded-xl px-4 py-2" onClick={() => switchTab("eingehend", null)}>
            Eingehend
            {inboundEmails.length > 0 && (
              <Badge variant="outline" className="ml-2 border-zinc-200 bg-zinc-100 text-zinc-700">{inboundEmails.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}

      {/* Eingang */}
      {activeTab === "inbox" && !isDetailPage && (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardContent className="space-y-3 pt-6">
              {loading ? (
                <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Wird geladen…</div>
              ) : visibleInbox.length === 0 ? (
                <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Posteingang ist leer.</div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 pb-1">
                    <button
                      type="button"
                      className="text-xs text-zinc-500 hover:text-zinc-700"
                      onClick={() => {
                        if (selectedIds.length === visibleInbox.length) {
                          clearSelectedIds()
                        } else {
                          selectAllIds(visibleInbox.map((i) => i.id))
                        }
                      }}
                    >
                      {selectedIds.length === visibleInbox.length ? "Auswahl aufheben" : "Alle auswählen"}
                    </button>
                    {selectedIds.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">{selectedIds.length} ausgewählt</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl text-red-600 hover:border-red-300 hover:bg-red-50"
                          disabled={bulkBusy}
                          onClick={() => void handleBulkDelete(selectedIds)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Auswahl löschen
                        </Button>
                      </div>
                    )}
                  </div>
                  {visibleInbox.map((item) => {
                    const active = item.id === selectedId
                    const itemHref = `${basePath}/${encodeURIComponent(item.id)}?tab=inbox`
                    return (
                      <div key={item.id} className="flex items-start gap-2">
                        <div
                          className="flex-shrink-0 pt-3.5 pl-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected(item.id)}
                            onChange={() => toggleSelectedId(item.id)}
                            disabled={bulkBusy}
                            className="h-4 w-4 cursor-pointer rounded accent-[#154c83] disabled:cursor-not-allowed"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
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
                      </div>
                    )
                  })}
                </>
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

      {/* Entwürfe */}
      {activeTab === "drafts" && !isDetailPage && (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardContent className="space-y-3 pt-6">
              {loading ? (
                <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Wird geladen…</div>
              ) : visibleDrafts.length === 0 ? (
                <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine Entwürfe vorhanden.</div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 pb-1">
                    <button
                      type="button"
                      className="text-xs text-zinc-500 hover:text-zinc-700"
                      onClick={() => {
                        if (selectedIds.length === visibleDrafts.length) {
                          clearSelectedIds()
                        } else {
                          selectAllIds(visibleDrafts.map((i) => i.id))
                        }
                      }}
                    >
                      {selectedIds.length === visibleDrafts.length ? "Auswahl aufheben" : "Alle auswählen"}
                    </button>
                    {selectedIds.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">{selectedIds.length} ausgewählt</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl text-red-600 hover:border-red-300 hover:bg-red-50"
                          disabled={bulkBusy}
                          onClick={() => void handleBulkDelete(selectedIds)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Auswahl löschen
                        </Button>
                      </div>
                    )}
                  </div>
                  {visibleDrafts.map((item) => {
                    const active = item.id === selectedId
                    return (
                      <div key={item.id} className="flex items-start gap-2">
                        <div
                          className="flex-shrink-0 pt-3.5 pl-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected(item.id)}
                            onChange={() => toggleSelectedId(item.id)}
                            disabled={bulkBusy}
                            className="h-4 w-4 cursor-pointer rounded accent-[#154c83] disabled:cursor-not-allowed"
                          />
                        </div>
                        <button
                          type="button"
                          className={`min-w-0 flex-1 rounded-3xl border p-4 text-left transition ${
                            active ? "border-[#154c83] bg-[#eef4fb]" : "border-zinc-200 bg-zinc-50 hover:border-[#154c83] hover:bg-white"
                          }`}
                          onClick={() => setSelectedId(item.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <div className="truncate font-semibold text-zinc-900">{item.subject || "(Kein Betreff)"}</div>
                              <div className="text-xs text-zinc-500">{item.to || "—"}</div>
                              <div className="overflow-hidden text-sm leading-5 text-zinc-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                                {item.snippet}
                              </div>
                            </div>
                            <div className="text-right text-xs text-zinc-500">{formatDisplayDateTime(new Date(item.created_at))}</div>
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Entwurf bearbeiten</CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedRecord ? (
                <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500">
                  {loading ? "Wird geladen\u2026" : "Keinen Entwurf ausgewählt."}
                </div>
              ) : (
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
                      className="min-h-[280px] rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                      disabled={saving || sending || aiBusy !== null}
                      onClick={() => void handleSaveDraft()}
                    >
                      <FileText className="h-4 w-4" />
                      Speichern
                    </Button>
                    <Button
                      className="rounded-2xl bg-[#e6332a] text-white hover:bg-[#c52c24]"
                      disabled={saving || sending || aiBusy !== null}
                      onClick={() => void handleSendDraft()}
                    >
                      <Send className="h-4 w-4" />
                      Senden
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-2xl text-red-600 hover:border-red-300 hover:bg-red-50"
                      disabled={saving || sending || aiBusy !== null}
                      onClick={() => void handleDeleteRecord(selectedRecord.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Löschen
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Verfassen */}
      {activeTab === "compose" && !isDetailPage && (
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="space-y-4 pt-6">
            {!selectedRecord ? (
              <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">
                Kein Entwurf aktiv. Wähle einen Entwurf im Tab „Entwürfe“ oder starte eine Antwort aus dem Eingang.
              </div>
            ) : (
              <>
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
                  <Button
                    className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                    disabled={saving || sending || aiBusy !== null}
                    onClick={() => void handleSaveDraft()}
                  >
                    <FileText className="h-4 w-4" />
                    Speichern
                  </Button>
                  <Button
                    className="rounded-2xl bg-[#e6332a] text-white hover:bg-[#c52c24]"
                    disabled={saving || sending || aiBusy !== null}
                    onClick={() => void handleSendDraft()}
                  >
                    <Send className="h-4 w-4" />
                    Senden
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl"
                    disabled={aiBusy !== null}
                    onClick={() => void runAiOnCompose()}
                  >
                    <Sparkles className="h-4 w-4" />
                    KI Textvorschlag
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl text-red-600 hover:border-red-300 hover:bg-red-50"
                    disabled={saving || sending || aiBusy !== null}
                    onClick={() => { if (selectedRecord) void handleDeleteRecord(selectedRecord.id) }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Löschen
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Verlauf */}
      {activeTab === "sent" && !isDetailPage && (
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="pt-6">
            {loading ? (
              <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Wird geladen…</div>
            ) : visibleSent.length === 0 ? (
              <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Noch keine gesendeten Nachrichten.</div>
            ) : (
              <>
                {selectedIds.length > 0 && (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{selectedIds.length} ausgewählt</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl text-red-600 hover:border-red-300 hover:bg-red-50"
                      disabled={bulkBusy}
                      onClick={() => void handleBulkDelete(selectedIds)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Auswahl löschen
                    </Button>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200">
                        <th className="py-2 pr-3 text-left font-semibold text-zinc-700">
                          <input
                            type="checkbox"
                            checked={visibleSent.length > 0 && selectedIds.length === visibleSent.length}
                            onChange={() => {
                              if (selectedIds.length === visibleSent.length) {
                                clearSelectedIds()
                              } else {
                                selectAllIds(visibleSent.map((i) => i.id))
                              }
                            }}
                            disabled={bulkBusy}
                            className="h-4 w-4 cursor-pointer rounded accent-[#154c83] disabled:cursor-not-allowed"
                          />
                        </th>
                        <th className="py-2 pr-4 text-left font-semibold text-zinc-700">Datum</th>
                        <th className="py-2 pr-4 text-left font-semibold text-zinc-700">Empfänger</th>
                        <th className="py-2 text-left font-semibold text-zinc-700">Betreff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSent.map((item) => (
                        <tr key={item.id} className="border-b border-zinc-100 last:border-0">
                          <td className="py-2.5 pr-3">
                            <input
                              type="checkbox"
                              checked={isSelected(item.id)}
                              onChange={() => toggleSelectedId(item.id)}
                              disabled={bulkBusy}
                              className="h-4 w-4 cursor-pointer rounded accent-[#154c83] disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="py-2.5 pr-4 text-xs text-zinc-500 whitespace-nowrap">{formatDisplayDateTime(new Date(item.created_at))}</td>
                          <td className="py-2.5 pr-4"><div className="max-w-[160px] truncate text-zinc-700">{item.to || "—"}</div></td>
                          <td className="py-2.5 text-zinc-900">{item.subject}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Gelöscht */}
      {activeTab === "deleted" && !isDetailPage && (
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="pt-6">
            {visibleDeleted.length === 0 ? (
              <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Papierkorb ist leer.</div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs text-zinc-500 hover:text-zinc-700"
                      onClick={() => {
                        if (selectedIds.length === visibleDeleted.length) {
                          clearSelectedIds()
                        } else {
                          selectAllIds(visibleDeleted.map((i) => i.id))
                        }
                      }}
                    >
                      {selectedIds.length === visibleDeleted.length ? "Auswahl aufheben" : "Alle auswählen"}
                    </button>
                    {selectedIds.length > 0 && (
                      <>
                        <span className="text-xs text-zinc-400">|</span>
                        <span className="text-xs text-zinc-500">{selectedIds.length} ausgewählt</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          disabled={bulkBusy}
                          onClick={() => void handleBulkRestore(selectedIds)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Auswahl wiederherstellen
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl text-red-600 hover:border-red-300 hover:bg-red-50"
                          disabled={bulkBusy}
                          onClick={() => void handleBulkPermanentDelete(selectedIds)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Auswahl endgültig löschen
                        </Button>
                      </>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-red-600 hover:border-red-300 hover:bg-red-50"
                    disabled={saving || bulkBusy}
                    onClick={() => void handlePermanentDeleteAll()}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Alle endgültig löschen
                  </Button>
                </div>
                <div className="space-y-3">
                  {visibleDeleted.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 pt-0.5">
                          <input
                            type="checkbox"
                            checked={isSelected(item.id)}
                            onChange={() => toggleSelectedId(item.id)}
                            disabled={bulkBusy || saving}
                            className="h-4 w-4 cursor-pointer rounded accent-[#154c83] disabled:cursor-not-allowed"
                          />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="truncate font-semibold text-zinc-900">{item.subject || "(Kein Betreff)"}</div>
                          <div className="text-xs text-zinc-500">
                            {item.to || item.from || "—"} · {formatDisplayDateTime(new Date(item.created_at))}
                          </div>
                          <div className="overflow-hidden text-sm leading-5 text-zinc-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1]">
                            {item.snippet}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          disabled={saving || bulkBusy}
                          onClick={() => void handleRestoreFromDeleted(item.id)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Wiederherstellen
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl text-red-600 hover:border-red-300 hover:bg-red-50"
                          disabled={saving || bulkBusy}
                          onClick={() => void handlePermanentDelete(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Endgültig
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Eingehend */}
      {activeTab === "eingehend" && !isDetailPage && (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardContent className="space-y-3 pt-6">
              {inboundLoading ? (
                <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Wird geladen…</div>
              ) : inboundError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{inboundError}</div>
              ) : inboundEmails.length === 0 ? (
                <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine eingehenden E-Mails vorhanden.</div>
              ) : (
                inboundEmails.map((item) => {
                  const active = item.id === selectedInboundId
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`w-full rounded-3xl border p-4 text-left transition ${
                        active ? "border-[#154c83] bg-[#eef4fb]" : "border-zinc-200 bg-zinc-50 hover:border-[#154c83] hover:bg-white"
                      }`}
                      onClick={() => setSelectedInboundId(item.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="truncate font-semibold text-zinc-900">{item.subject || "(Kein Betreff)"}</div>
                          <div className="text-xs text-zinc-500">{item.from_email || "—"}</div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-zinc-500">{formatDisplayDateTime(new Date(item.received_at))}</div>
                      </div>
                    </button>
                  )
                })
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Eingegangene E-Mail</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const selected = inboundEmails.find((e) => e.id === selectedInboundId)
                if (!selected) {
                  return (
                    <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500">
                      {inboundLoading ? "Wird geladen\u2026" : "Keine E-Mail ausgewählt."}
                    </div>
                  )
                }
                return (
                  <div className="space-y-4">
                    <div className="space-y-1 text-sm text-zinc-600">
                      <div><span className="font-medium">Von:</span> {selected.from_email || "—"}</div>
                      <div><span className="font-medium">An:</span> {selected.to_email || "—"}</div>
                      <div><span className="font-medium">Betreff:</span> {selected.subject || "—"}</div>
                      <div><span className="font-medium">Empfangen:</span> {formatDisplayDateTime(new Date(selected.received_at))}</div>
                    </div>
                    <div className="whitespace-pre-wrap rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-800">
                      {selected.text || "(Kein Textinhalt)"}
                    </div>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailansicht */}
      {isDetailPage && (
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Detail</CardTitle>
            <Button asChild variant="outline" className="rounded-2xl">
              <Link href={buildTabHref(basePath, "inbox")}>
                <ChevronLeft className="h-4 w-4" />
                Zur Liste
              </Link>
            </Button>
          </CardHeader>
          <CardContent>{detailContent}</CardContent>
        </Card>
      )}
    </div>
  )
}