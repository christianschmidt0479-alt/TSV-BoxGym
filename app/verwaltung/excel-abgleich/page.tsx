"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertCircle, FileSpreadsheet, Upload } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDisplayDateTime, formatIsoDateForDisplay } from "@/lib/dateFormat"
import { getOfficeListStatusBadgeClass, getOfficeListStatusLabel, type OfficeListResultStatus } from "@/lib/officeListStatus"
import { isCompatibleOfficeListGroup, normalizeTrainingGroup, TRAINING_GROUPS } from "@/lib/trainingGroups"
import { clearTrainerAccess } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type FilterValue = "all" | OfficeListResultStatus

type ReconcileMetricSummary = {
  excelTotal: number
  foundInDb: number
  green: number
  yellow: number
  red: number
  gray: number
}

type FileSummary = {
  fileName: string
  group: string
  rowCount: number
}

type ReconcileRow = {
  id: string
  memberId: string | null
  isTrainerLinked?: boolean
  hasTrainerAccount?: boolean
  email?: string
  phone?: string
  firstName: string
  lastName: string
  birthdate: string
  source: string
  excel: "Ja" | "Nein"
  db: "Ja" | "Nein"
  tsvMember: "Ja" | "Nein" | "—"
  groupExcel: string
  groupDb: string
  status: OfficeListResultStatus
  statusLabel: string
  note: string
}

type RunHistoryEntry = {
  id: string
  checkedAt: string
  isActive: boolean
  runStatus: "green" | "gray"
  fileCount: number
  metrics: ReconcileMetricSummary
}

type ReconcileResponse = {
  runId: string | null
  runStatus: "green" | "gray"
  isActive: boolean
  storageAvailable: boolean
  checkedAt: string
  fileCount: number
  files: FileSummary[]
  metrics: ReconcileMetricSummary
  history: RunHistoryEntry[]
  rows: ReconcileRow[]
}

type UploadDraft = {
  file: File
  group: string
}

type ExcelCreateDraft = {
  firstName: string
  lastName: string
  birthDate: string
  email: string
  phone: string
  baseGroup: string
  sendVerification: boolean
}

type DuplicateMatch = {
  id: string
  name: string
  birthdate: string | null
  email: string | null
  phone: string | null
  reason: string
}

function compareRows(a: ReconcileRow, b: ReconcileRow) {
  const statusOrder: Record<OfficeListResultStatus, number> = {
    yellow: 0,
    red: 1,
    gray: 2,
    green: 3,
  }

  const statusCompare = statusOrder[a.status] - statusOrder[b.status]
  if (statusCompare !== 0) return statusCompare

  const groupCompare = a.groupExcel.localeCompare(b.groupExcel, "de")
  if (groupCompare !== 0) return groupCompare

  const lastNameCompare = a.lastName.localeCompare(b.lastName, "de")
  if (lastNameCompare !== 0) return lastNameCompare

  return a.firstName.localeCompare(b.firstName, "de")
}

function buildMetrics(rows: ReconcileRow[]): ReconcileMetricSummary {
  return {
    excelTotal: rows.filter((row) => row.excel === "Ja").length,
    foundInDb: rows.filter((row) => row.excel === "Ja" && row.db === "Ja").length,
    green: rows.filter((row) => row.status === "green").length,
    yellow: rows.filter((row) => row.status === "yellow").length,
    red: rows.filter((row) => row.status === "red").length,
    gray: rows.filter((row) => row.status === "gray").length,
  }
}

function getNoteParts(note: string) {
  return note
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean)
}

function getPreferredFilter(metrics: ReconcileMetricSummary): FilterValue {
  if (metrics.yellow > 0) return "yellow"
  if (metrics.red > 0) return "red"
  if (metrics.gray > 0) return "gray"
  return "all"
}

function inferGroupFromFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "")
  const sanitized = withoutExtension.replace(/[_-]+/g, " ")
  return normalizeTrainingGroup(sanitized)
}

function formatCheckedAt(value: string) {
  return formatDisplayDateTime(new Date(value))
}

function formatHistorySummary(metrics: ReconcileMetricSummary) {
  return `${metrics.green} grün · ${metrics.yellow} gelb · ${metrics.red} rot · ${metrics.gray} grau`
}

export default function ExcelAbgleichPage() {
  const router = useRouter()
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [uploads, setUploads] = useState<UploadDraft[]>([])
  const [result, setResult] = useState<ReconcileResponse | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all")
  const [nameSearch, setNameSearch] = useState("")
  const [hasManualFilterSelection, setHasManualFilterSelection] = useState(false)
  const [loading, setLoading] = useState(false)
  const [updatingActionKey, setUpdatingActionKey] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [createDraftRowId, setCreateDraftRowId] = useState<string | null>(null)
  const [createDraft, setCreateDraft] = useState<ExcelCreateDraft | null>(null)
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([])

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") return

    let cancelled = false

    void (async () => {
      try {
        const response = await fetch("/api/admin/excel-abgleich", { method: "GET" })

        if (response.status === 204) {
          return
        }

        if (!response.ok) {
          if (response.status === 401) {
            clearTrainerAccess()
          }
          throw new Error(await response.text())
        }

        const payload = (await response.json()) as ReconcileResponse
        if (cancelled) return

        setResult(payload)
        if (!hasManualFilterSelection) {
          setActiveFilter(getPreferredFilter(payload.metrics))
        }
      } catch (nextError) {
        if (cancelled) return
        setError(nextError instanceof Error ? nextError.message : "Gespeicherter Abgleich konnte nicht geladen werden.")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authResolved, hasManualFilterSelection, trainerRole])

  const summaryCards = useMemo(() => {
    if (!result) return []
    return [
      {
        label: "Laufstatus",
        value: result.isActive ? "Aktiv" : "Archiv",
        detail: formatCheckedAt(result.checkedAt),
        badgeClass: getOfficeListStatusBadgeClass(result.runStatus),
      },
      {
        label: "Dateien / Personen",
        value: `${result.fileCount} / ${result.metrics.excelTotal}`,
        detail: `${result.metrics.foundInDb} DB-Treffer`,
      },
      {
        label: "Prüfen",
        value: result.metrics.yellow + result.metrics.gray,
        detail: `${result.metrics.yellow} gelb · ${result.metrics.gray} grau`,
      },
      {
        label: "Nicht in Liste",
        value: result.metrics.red,
        detail: `${result.metrics.green} grün bestätigt`,
      },
    ]
  }, [result])

  const filterOptions = useMemo(
    () => [
      { value: "all" as const, label: "Alle" },
      { value: "yellow" as const, label: "Gelb" },
      { value: "red" as const, label: "Rot" },
      { value: "gray" as const, label: "Grau" },
      { value: "green" as const, label: "Grün" },
    ],
    [],
  )

  const filteredRows = useMemo(() => {
    if (!result) return []
    const normalizedSearch = nameSearch.trim().toLocaleLowerCase("de-DE")
    const rows = activeFilter === "all" ? result.rows : result.rows.filter((row) => row.status === activeFilter)

    const searchedRows =
      normalizedSearch === ""
        ? rows
        : rows.filter((row) => {
            const firstName = row.firstName.toLocaleLowerCase("de-DE")
            const lastName = row.lastName.toLocaleLowerCase("de-DE")
            return firstName.includes(normalizedSearch) || lastName.includes(normalizedSearch)
          })

    return [...searchedRows].sort(compareRows)
  }, [activeFilter, nameSearch, result])

  const problemSummaryItems = useMemo(() => {
    if (!result) return []

    return [
      result.metrics.yellow > 0 ? `${result.metrics.yellow} gelb` : null,
      result.metrics.red > 0 ? `${result.metrics.red} rot` : null,
      result.metrics.gray > 0 ? `${result.metrics.gray} grau` : null,
    ].filter((item): item is string => Boolean(item))
  }, [result])

  const hasUploadWithoutGroup = uploads.some((upload) => !upload.group)

  const handleExport = () => {
    if (!filteredRows.length) return

    const headers = [
      "Vorname",
      "Nachname",
      "Geburtsdatum",
      "Quelle",
      "Excel",
      "DB",
      "TSV-Mitglied",
      "Excel-Gruppe",
      "DB-Gruppe",
      "Status",
      "Hinweis",
    ]

    const escapeCsvValue = (value: string) => `"${value.replace(/"/g, '""')}"`
    const csvRows = [
      headers.map(escapeCsvValue).join(";"),
      ...filteredRows.map((row) =>
        [
          row.firstName || "—",
          row.lastName || "—",
          formatIsoDateForDisplay(row.birthdate) || row.birthdate || "—",
          row.source,
          row.excel,
          row.db,
          row.tsvMember,
          row.groupExcel,
          row.groupDb,
          row.statusLabel,
          row.note,
        ]
          .map((value) => escapeCsvValue(String(value ?? "")))
          .join(";"),
      ),
    ]
    const csvContent = `\uFEFF${csvRows.join("\n")}`
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const downloadLink = document.createElement("a")
    const fileSuffix = activeFilter === "all" ? "alle" : activeFilter

    downloadLink.href = url
    downloadLink.download = `office-listen-abgleich-${fileSuffix}.csv`
    document.body.appendChild(downloadLink)
    downloadLink.click()
    document.body.removeChild(downloadLink)
    URL.revokeObjectURL(url)
  }

  const getNavigableMemberId = (row: ReconcileRow) => row.memberId

  const getPreferredApprovalGroup = (row: ReconcileRow) => (row.groupExcel !== "—" ? row.groupExcel : row.groupDb)

  const canSetTsvMember = (row: ReconcileRow) => row.db === "Ja" && row.excel === "Ja" && row.tsvMember === "Nein"

  const canAdoptGroup = (row: ReconcileRow) =>
    row.db === "Ja" &&
    row.excel === "Ja" &&
    row.groupExcel !== "—" &&
    row.groupDb !== "—" &&
    !isCompatibleOfficeListGroup(row.groupDb, row.groupExcel, { isTrainer: Boolean(row.isTrainerLinked) })

  const canActivateTrainerAccount = (row: ReconcileRow) => Boolean(row.email?.trim()) && !row.hasTrainerAccount

  const canCreateMember = (row: ReconcileRow) => row.excel === "Ja" && row.db === "Nein" && !row.hasTrainerAccount

  const openCreateDraft = (row: ReconcileRow) => {
    setCreateDraftRowId(row.id)
    setDuplicateMatches([])
    setCreateDraft({
      firstName: row.firstName || "",
      lastName: row.lastName || "",
      birthDate: row.birthdate && row.birthdate !== "—" ? row.birthdate : "",
      email: row.email?.trim() || "",
      phone: row.phone?.trim() || "",
      baseGroup: row.groupExcel !== "—" ? row.groupExcel : TRAINING_GROUPS[0],
      sendVerification: Boolean(row.email?.trim()),
    })
    setError("")
  }

  const closeCreateDraft = () => {
    setCreateDraftRowId(null)
    setCreateDraft(null)
    setDuplicateMatches([])
  }

  const getUpdatedDbRow = (entry: ReconcileRow, nextValues: Partial<ReconcileRow>): ReconcileRow => {
    const nextRow = { ...entry, ...nextValues }
    if (nextRow.db !== "Ja" || nextRow.excel !== "Ja") {
      return nextRow
    }

    const normalizedNotes = getNoteParts(nextRow.note)
    const nextStatus: OfficeListResultStatus = normalizedNotes.length === 0 ? "green" : "yellow"

    return {
      ...nextRow,
      status: nextStatus,
      statusLabel: getOfficeListStatusLabel(nextStatus),
      note: normalizedNotes.join(" · ") || "Excel und DB stimmen überein",
    }
  }

  const handleSetTsvMember = async (row: ReconcileRow) => {
    const memberId = getNavigableMemberId(row)
    if (!memberId || !canSetTsvMember(row)) return

    try {
      setUpdatingActionKey(`tsv:${memberId}`)
      setError("")

      const response = await fetch("/api/admin/member-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          memberId,
          baseGroup: getPreferredApprovalGroup(row),
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          clearTrainerAccess()
        }
        throw new Error(await response.text())
      }

      const payload = (await response.json()) as {
        member?: {
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          name?: string | null
        }
      }

      setResult((current) => {
        if (!current) return current

        const nextRows = current.rows.map((entry) => {
          if (entry.id !== row.id) return entry

          const nextNote = getNoteParts(entry.note)
            .filter((part) => part !== "TSV-Mitglied nicht freigegeben")
            .join(" · ")

          return getUpdatedDbRow(entry, {
            tsvMember: "Ja",
            note: nextNote,
          })
        })

        return {
          ...current,
          rows: nextRows,
          metrics: buildMetrics(nextRows),
        }
      })

      if (payload.member?.email) {
        const mailResponse = await fetch("/api/admin/manual-mail-outbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request: {
              kind: "approval_notice",
              email: payload.member.email,
              name:
                `${payload.member.first_name ?? ""} ${payload.member.last_name ?? ""}`.trim() ||
                payload.member.name ||
                undefined,
              targetKind: "member",
              group: getPreferredApprovalGroup(row),
            },
          }),
        })

        if (!mailResponse.ok) {
          throw new Error((await mailResponse.text()) || "Freigabe-Mail konnte nicht in den Postausgang gelegt werden.")
        }
      }

      alert(payload.member?.email ? "TSV-Mitglied gesetzt. Die Freigabe-Mail liegt jetzt im Postausgang." : "TSV-Mitglied gesetzt.")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "TSV-Mitglied konnte nicht gesetzt werden.")
    } finally {
      setUpdatingActionKey(null)
    }
  }

  const handleAdoptGroup = async (row: ReconcileRow) => {
    const memberId = getNavigableMemberId(row)
    if (!memberId || !canAdoptGroup(row)) return

    try {
      setUpdatingActionKey(`group:${memberId}`)
      setError("")

      const response = await fetch("/api/admin/member-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_group",
          memberId,
          baseGroup: row.groupExcel,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          clearTrainerAccess()
        }
        throw new Error(await response.text())
      }

      setResult((current) => {
        if (!current) return current

        const nextRows = current.rows.map((entry) => {
          if (entry.id !== row.id) return entry

          const nextNote = getNoteParts(entry.note)
            .filter((part) => !part.startsWith("Stammgruppe weicht ab (DB:"))
            .join(" · ")

          return getUpdatedDbRow(entry, {
            groupDb: row.groupExcel,
            note: nextNote,
          })
        })

        return {
          ...current,
          rows: nextRows,
          metrics: buildMetrics(nextRows),
        }
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Gruppe konnte nicht übernommen werden.")
    } finally {
      setUpdatingActionKey(null)
    }
  }

  const handleActivateTrainerAccount = async (row: ReconcileRow) => {
    if (!canActivateTrainerAccount(row)) return

    const email = row.email?.trim().toLowerCase() ?? ""
    if (!email) return

    try {
      setUpdatingActionKey(`trainer:${row.id}`)
      setError("")

      const placeholderPin = crypto.randomUUID()

      const response = await fetch("/api/admin/trainer-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: row.firstName,
          lastName: row.lastName,
          email,
          pin: placeholderPin,
          skipMemberLink: true,
          useSetPasswordLink: true,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          clearTrainerAccess()
        }
        throw new Error(await response.text())
      }

      setResult((current) => {
        if (!current) return current

        const nextRows = current.rows.map((entry) => {
          if (entry.id !== row.id) return entry
          return {
            ...entry,
            hasTrainerAccount: true,
          }
        })

        return {
          ...current,
          rows: nextRows,
        }
      })

      alert("Trainerkonto angelegt. Die Bestätigungs-Mail wurde versendet.")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Trainerkonto konnte nicht aktiviert werden.")
    } finally {
      setUpdatingActionKey(null)
    }
  }

  const handleCreateMemberFromExcel = async (row: ReconcileRow) => {
    if (!canCreateMember(row) || !createDraft) return

    try {
      setUpdatingActionKey(`create:${row.id}`)
      setDuplicateMatches([])
      setError("")

      const response = await fetch("/api/admin/excel-abgleich/create-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: createDraft.firstName,
          lastName: createDraft.lastName,
          birthDate: createDraft.birthDate,
          email: createDraft.email,
          phone: createDraft.phone,
          baseGroup: createDraft.baseGroup,
          officeListGroup: row.groupExcel,
          officeListCheckedAt: result?.checkedAt,
        }),
      })

      if (response.status === 409) {
        const payload = (await response.json()) as { error?: string; matches?: DuplicateMatch[] }
        setDuplicateMatches(Array.isArray(payload.matches) ? payload.matches : [])
        setError(payload.error || "Möglicher Dublettentreffer gefunden.")
        return
      }

      if (!response.ok) {
        if (response.status === 401) {
          clearTrainerAccess()
        }
        throw new Error(await response.text())
      }

      const payload = (await response.json()) as {
        ok: true
        member: {
          id: string
          email?: string | null
          phone?: string | null
          first_name?: string | null
          last_name?: string | null
          birthdate?: string | null
          is_approved?: boolean
          base_group?: string | null
          office_list_status?: string | null
        }
      }

      setResult((current) => {
        if (!current) return current

        const nextRows = current.rows.map((entry) => {
          if (entry.id !== row.id) return entry

          return {
            ...entry,
            memberId: payload.member.id,
            db: "Ja" as const,
            tsvMember: payload.member.is_approved ? "Ja" as const : "Nein" as const,
            groupDb: payload.member.base_group || createDraft.baseGroup,
            email: payload.member.email || createDraft.email,
            phone: payload.member.phone || createDraft.phone,
            firstName: payload.member.first_name || createDraft.firstName,
            lastName: payload.member.last_name || createDraft.lastName,
            birthdate: payload.member.birthdate || createDraft.birthDate,
            status: "green" as const,
            statusLabel: getOfficeListStatusLabel("green"),
            note: "Neu aus Excel angelegt",
          }
        })

        return {
          ...current,
          rows: nextRows,
          metrics: buildMetrics(nextRows),
        }
      })

      closeCreateDraft()

      let verificationSent = false
      if (createDraft.sendVerification && payload.member.email) {
        const verificationResponse = await fetch("/api/admin/member-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "resend_verification",
            memberId: payload.member.id,
          }),
        })

        if (!verificationResponse.ok) {
          setError(`Mitglied angelegt, aber Bestätigungslink konnte nicht gesendet werden: ${await verificationResponse.text()}`)
        } else {
          verificationSent = true

          setResult((current) => {
            if (!current) return current

            const nextRows = current.rows.map((entry) => {
              if (entry.memberId !== payload.member.id) return entry
              return {
                ...entry,
                note: "Neu aus Excel angelegt · Bestätigungslink gesendet",
              }
            })

            return {
              ...current,
              rows: nextRows,
            }
          })
        }
      }
      alert(verificationSent ? "Mitglied angelegt und Bestätigungslink gesendet." : "Mitglied angelegt.")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Mitglied konnte nicht angelegt werden.")
    } finally {
      setUpdatingActionKey(null)
    }
  }

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Excel-Abgleich</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Dieser Bereich ist nur mit Adminzugang verfügbar.
          </div>
          <Button asChild className="rounded-2xl">
            <Link href="/trainer-zugang">Zum Login</Link>
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
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Admin-Werkzeug
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900">GS-Sammelabgleich</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Mehrere aktuelle Gruppenlisten gemeinsam hochladen und den Office-Abgleich für offene Freigaben automatisch setzen.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/verwaltung">Zur Übersicht</Link>
        </Button>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Abgleich starten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Excel-Dateien</Label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              multiple
              className="rounded-2xl"
              onChange={(event) => {
                const selectedFiles = Array.from(event.target.files ?? [])
                setUploads(
                  selectedFiles.map((file) => ({
                    file,
                    group: inferGroupFromFileName(file.name),
                  })),
                )
                setError("")
              }}
            />
            <div className="text-xs text-zinc-500">Pro Datei bitte die passende aktuelle Trainingsgruppe prüfen.</div>
          </div>

          {uploads.length > 0 ? (
            <div className="grid gap-3">
              {uploads.map((upload, index) => (
                <div
                  key={`${upload.file.name}-${index}`}
                  className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-[1.6fr_1fr] md:items-end"
                >
                  <div>
                    <div className="font-medium text-zinc-900">{upload.file.name}</div>
                    <div className="text-xs text-zinc-500">
                      {(upload.file.size / 1024).toFixed(1).replace(".", ",")} KB
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Gruppe</Label>
                    <Select
                      value={upload.group}
                      onValueChange={(value) =>
                        setUploads((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...entry,
                                  group: value,
                                }
                              : entry,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="rounded-2xl bg-white">
                        <SelectValue placeholder="Gruppe wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {TRAINING_GROUPS.map((entry) => (
                          <SelectItem key={entry} value={entry}>
                            {entry}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
              disabled={uploads.length === 0 || hasUploadWithoutGroup || loading}
              onClick={async () => {
                try {
                  if (uploads.length === 0) {
                    setError("Bitte zuerst mindestens eine Excel-Datei auswählen.")
                    return
                  }

                  if (hasUploadWithoutGroup) {
                    setError("Bitte jeder Datei eine Gruppe zuordnen.")
                    return
                  }

                  setLoading(true)
                  setError("")
                  const formData = new FormData()
                  uploads.forEach((upload) => {
                    formData.append("files", upload.file)
                    formData.append("groups", upload.group)
                  })

                  const response = await fetch("/api/admin/excel-abgleich", {
                    method: "POST",
                    body: formData,
                  })

                  if (!response.ok) {
                    if (response.status === 401) {
                      clearTrainerAccess()
                    }
                    throw new Error(await response.text())
                  }

                  const payload = (await response.json()) as ReconcileResponse
                  if (!hasManualFilterSelection) {
                    setActiveFilter(getPreferredFilter(payload.metrics))
                  }
                  setResult(payload)
                } catch (nextError) {
                  setError(nextError instanceof Error ? nextError.message : "Abgleich fehlgeschlagen.")
                } finally {
                  setLoading(false)
                }
              }}
            >
              <Upload className="mr-2 h-4 w-4" />
              {loading ? "Abgleich läuft..." : "Sammelabgleich starten"}
            </Button>

            {uploads.length > 0 ? <div className="text-sm text-zinc-500">{uploads.length} Datei(en) ausgewählt</div> : null}
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {result && !result.storageAvailable ? (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Der aktuelle Abgleich wurde ausgeführt, aber die kleine Lauf-Historie wird erst gespeichert, wenn die neue Supabase-SQL eingespielt ist.</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {result ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <Card key={card.label} className="rounded-[24px] border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-sm text-zinc-500">{card.label}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="text-3xl font-bold text-zinc-900">{card.value}</div>
                    {"badgeClass" in card && card.badgeClass ? (
                      <Badge variant="outline" className={card.badgeClass}>
                        {result?.runStatus === "green" ? "Grün" : "Archiv"}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{card.detail}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Ergebnisse</CardTitle>
              <div className="space-y-1 text-sm text-zinc-500">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{result.fileCount} Datei(en) · Zeitstempel {formatCheckedAt(result.checkedAt)}</span>
                  <Badge variant="outline" className={getOfficeListStatusBadgeClass(result.runStatus)}>
                    {result.isActive ? "Aktiver Lauf" : "Archiviert"}
                  </Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {result.files.map((file) => (
                    <div key={`${file.fileName}-${file.group}`} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{file.group}</div>
                      <div className="truncate text-sm font-medium text-zinc-900">{file.fileName}</div>
                      <div className="text-xs text-zinc-500">{file.rowCount} Personenzeilen</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid items-stretch gap-4 xl:grid-cols-[1.3fr_1fr]">
                <div className="h-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                  <div className="mb-2 font-semibold text-zinc-900">Schnellüberblick</div>
                  {problemSummaryItems.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-red-700">Rot</div>
                        <div className="mt-1 text-2xl font-bold text-red-900">{result.metrics.red}</div>
                        <div className="text-xs text-red-700">Nicht in den hochgeladenen Listen</div>
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Gelb</div>
                        <div className="mt-1 text-2xl font-bold text-amber-900">{result.metrics.yellow}</div>
                        <div className="text-xs text-amber-700">Prüfen oder manuell klären</div>
                      </div>
                      <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Grau</div>
                        <div className="mt-1 text-2xl font-bold text-zinc-900">{result.metrics.gray}</div>
                        <div className="text-xs text-zinc-500">Nur in Excel gefunden</div>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Grün</div>
                        <div className="mt-1 text-2xl font-bold text-emerald-900">{result.metrics.green}</div>
                        <div className="text-xs text-emerald-700">Sauber zugeordnet</div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-emerald-700">
                      Keine Problemfälle gefunden. Offene Freigaben und Excel-Listen passen zusammen.
                    </span>
                  )}
                </div>

                <Link
                  href="/verwaltung/excel-abgleich/laeufe"
                  className="block self-start rounded-2xl border border-zinc-200 bg-white p-3 transition hover:border-[#154c83] hover:bg-zinc-50"
                >
                  <div className="flex flex-col gap-3">
                    <div className="text-sm font-semibold text-zinc-900">Letzte Läufe</div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-zinc-900">{formatCheckedAt(result.checkedAt)}</span>
                        <Badge variant="outline" className={getOfficeListStatusBadgeClass(result.runStatus)}>
                          {result.isActive ? "Aktiv" : "Archiv"}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-zinc-600">{result.fileCount} Datei(en) · {formatHistorySummary(result.metrics)}</div>
                    </div>
                    <div className="text-sm font-medium text-[#154c83]">Laufdokumentation öffnen</div>
                  </div>
                </Link>
              </div>

              <div className="flex flex-col gap-3">
                <Input
                  value={nameSearch}
                  onChange={(event) => setNameSearch(event.target.value)}
                  placeholder="Nach Vor- oder Nachname suchen"
                  className="max-w-md rounded-2xl"
                />

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.map((option) => {
                      const isActive = activeFilter === option.value

                      return (
                        <Button
                          key={option.value}
                          type="button"
                          variant={isActive ? "default" : "outline"}
                          className={
                            isActive ? "rounded-full bg-[#154c83] text-white hover:bg-[#123d69]" : "rounded-full"
                          }
                          onClick={() => {
                            setHasManualFilterSelection(true)
                            setActiveFilter(option.value)
                          }}
                        >
                          {option.label}
                        </Button>
                      )
                    })}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    disabled={!filteredRows.length}
                    onClick={handleExport}
                  >
                    CSV exportieren
                  </Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vorname</TableHead>
                    <TableHead>Nachname</TableHead>
                    <TableHead>Geburtsdatum</TableHead>
                    <TableHead>Quelle</TableHead>
                    <TableHead>Excel</TableHead>
                    <TableHead>DB</TableHead>
                    <TableHead>TSV-Mitglied</TableHead>
                    <TableHead>Excel-Gruppe</TableHead>
                    <TableHead>DB-Gruppe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hinweis</TableHead>
                    <TableHead>Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <Fragment key={row.id}>
                    <TableRow
                      className={getNavigableMemberId(row) ? "cursor-pointer hover:bg-zinc-50" : undefined}
                      onClick={() => {
                        const memberId = getNavigableMemberId(row)
                        if (!memberId) return
                        router.push(`/verwaltung/mitglieder?memberId=${encodeURIComponent(memberId)}`)
                      }}
                    >
                      <TableCell>{row.firstName || "—"}</TableCell>
                      <TableCell>{row.lastName || "—"}</TableCell>
                      <TableCell>{formatIsoDateForDisplay(row.birthdate) || row.birthdate || "—"}</TableCell>
                      <TableCell>{row.source}</TableCell>
                      <TableCell>{row.excel}</TableCell>
                      <TableCell>{row.db}</TableCell>
                      <TableCell>{row.tsvMember}</TableCell>
                      <TableCell>{row.groupExcel}</TableCell>
                      <TableCell>{row.groupDb}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getOfficeListStatusBadgeClass(row.status)}>
                          {row.statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-[260px] whitespace-normal text-sm text-zinc-600">{row.note}</TableCell>
                      <TableCell>
                        {getNavigableMemberId(row) ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-xl px-3 text-[#154c83] hover:text-[#123d69]"
                              onClick={(event) => {
                                event.stopPropagation()
                                const memberId = getNavigableMemberId(row)
                                if (!memberId) return
                                router.push(`/verwaltung/mitglieder?memberId=${encodeURIComponent(memberId)}`)
                              }}
                            >
                              Öffnen
                            </Button>

                            {canSetTsvMember(row) ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-xl px-3"
                                disabled={updatingActionKey === `tsv:${getNavigableMemberId(row)}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void handleSetTsvMember(row)
                                }}
                              >
                                {updatingActionKey === `tsv:${getNavigableMemberId(row)}` ? "Setzt..." : "TSV setzen"}
                              </Button>
                            ) : null}

                            {canAdoptGroup(row) ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-xl px-3"
                                disabled={updatingActionKey === `group:${getNavigableMemberId(row)}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void handleAdoptGroup(row)
                                }}
                              >
                                {updatingActionKey === `group:${getNavigableMemberId(row)}` ? "Setzt..." : "Gruppe übernehmen"}
                              </Button>
                            ) : null}

                            {canActivateTrainerAccount(row) ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-xl px-3"
                                disabled={updatingActionKey === `trainer:${row.id}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void handleActivateTrainerAccount(row)
                                }}
                              >
                                {updatingActionKey === `trainer:${row.id}` ? "Aktiviert..." : "Trainerkonto aktivieren"}
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {canCreateMember(row) ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-xl px-3"
                                disabled={updatingActionKey === `create:${row.id}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openCreateDraft(row)
                                }}
                              >
                                Anlegen
                              </Button>
                            ) : null}
                            {canActivateTrainerAccount(row) ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-xl px-3"
                                disabled={updatingActionKey === `trainer:${row.id}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void handleActivateTrainerAccount(row)
                                }}
                              >
                                {updatingActionKey === `trainer:${row.id}` ? "Aktiviert..." : "Trainerkonto aktivieren"}
                              </Button>
                            ) : null}
                            {!canCreateMember(row) && !canActivateTrainerAccount(row) ? <span className="text-sm text-zinc-300">—</span> : null}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                    {createDraftRowId === row.id && createDraft ? (
                      <TableRow>
                        <TableCell colSpan={12} className="bg-zinc-50/70 p-4">
                          <div className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
                            <div>
                              <div className="font-semibold text-zinc-900">Mitglied aus Excel anlegen</div>
                              <div className="text-sm text-zinc-500">Der Datensatz bleibt zunächst unbestätigt und nicht vollständig freigegeben.</div>
                            </div>

                            {duplicateMatches.length > 0 ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                <div className="font-semibold">Mögliche Dubletten gefunden</div>
                                <div className="mt-2 space-y-2">
                                  {duplicateMatches.map((match) => (
                                    <div key={match.id} className="rounded-xl border border-amber-200 bg-white px-3 py-2">
                                      <div className="font-medium text-zinc-900">{match.name}</div>
                                      <div className="text-xs text-zinc-600">
                                        {match.birthdate || "ohne Geburtsdatum"}
                                        {match.email ? ` · ${match.email}` : ""}
                                        {match.phone ? ` · ${match.phone}` : ""}
                                      </div>
                                      <div className="mt-1 text-xs text-amber-800">{match.reason}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                              <div className="space-y-2">
                                <Label>Vorname</Label>
                                <Input value={createDraft.firstName} onChange={(event) => setCreateDraft((current) => current ? { ...current, firstName: event.target.value } : current)} className="rounded-2xl" />
                              </div>
                              <div className="space-y-2">
                                <Label>Nachname</Label>
                                <Input value={createDraft.lastName} onChange={(event) => setCreateDraft((current) => current ? { ...current, lastName: event.target.value } : current)} className="rounded-2xl" />
                              </div>
                              <div className="space-y-2">
                                <Label>Geburtsdatum</Label>
                                <Input type="date" value={createDraft.birthDate} onChange={(event) => setCreateDraft((current) => current ? { ...current, birthDate: event.target.value } : current)} className="rounded-2xl" />
                              </div>
                              <div className="space-y-2">
                                <Label>E-Mail</Label>
                                <Input type="email" value={createDraft.email} onChange={(event) => setCreateDraft((current) => current ? { ...current, email: event.target.value } : current)} className="rounded-2xl" />
                              </div>
                              <div className="space-y-2">
                                <Label>Telefon</Label>
                                <Input value={createDraft.phone} onChange={(event) => setCreateDraft((current) => current ? { ...current, phone: event.target.value } : current)} className="rounded-2xl" />
                              </div>
                              <div className="space-y-2">
                                <Label>Gruppe</Label>
                                <Select value={createDraft.baseGroup} onValueChange={(value) => setCreateDraft((current) => current ? { ...current, baseGroup: value } : current)}>
                                  <SelectTrigger className="rounded-2xl bg-white">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {TRAINING_GROUPS.map((entry) => (
                                      <SelectItem key={entry} value={entry}>{entry}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {createDraft.email.trim() ? (
                              <label className="flex items-center gap-2 text-sm text-zinc-700">
                                <input
                                  type="checkbox"
                                  checked={createDraft.sendVerification}
                                  onChange={(event) => setCreateDraft((current) => current ? { ...current, sendVerification: event.target.checked } : current)}
                                />
                                Anlegen + Bestätigungslink senden
                              </label>
                            ) : null}

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                                disabled={updatingActionKey === `create:${row.id}`}
                                onClick={() => void handleCreateMemberFromExcel(row)}
                              >
                                {updatingActionKey === `create:${row.id}` ? "Legt an..." : createDraft.email.trim() && createDraft.sendVerification ? "Anlegen + Link senden" : "Anlegen"}
                              </Button>
                              <Button type="button" variant="outline" className="rounded-2xl" onClick={closeCreateDraft} disabled={updatingActionKey === `create:${row.id}`}>
                                Abbrechen
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
