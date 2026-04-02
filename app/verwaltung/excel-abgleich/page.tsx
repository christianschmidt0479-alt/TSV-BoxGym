"use client"

import { useMemo, useState } from "react"
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
import { buildAdminMailComposeHref } from "@/lib/adminMailComposeClient"
import { TRAINING_GROUPS } from "@/lib/trainingGroups"
import { clearTrainerAccess } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type ResultStatus = "green" | "yellow" | "red" | "gray"

type FilterValue = "all" | "yellow" | "red" | "gray" | "green"

type ReconcileMetricSummary = {
  excelTotal: number
  foundInDb: number
  notFound: number
  tsvOk: number
  deviations: number
  onlyDb: number
  onlyExcel: number
}

type ReconcileRow = {
  id: string
  firstName: string
  lastName: string
  birthdate: string
  excel: "Ja" | "Nein"
  db: "Ja" | "Nein"
  tsvMember: "Ja" | "Nein" | "—"
  groupDb: string
  status: ResultStatus
  statusLabel: string
  note: string
}

type ReconcileResponse = {
  group: string
  fileName: string
  metrics: ReconcileMetricSummary
  rows: ReconcileRow[]
}

function getStatusBadgeClass(status: ResultStatus) {
  switch (status) {
    case "green":
      return "border-emerald-200 bg-emerald-100 text-emerald-800"
    case "yellow":
      return "border-amber-200 bg-amber-100 text-amber-800"
    case "red":
      return "border-red-200 bg-red-100 text-red-800"
    case "gray":
      return "border-zinc-200 bg-zinc-100 text-zinc-700"
  }
}

function getStatusLabel(status: ResultStatus) {
  switch (status) {
    case "green":
      return "OK"
    case "yellow":
      return "Abweichung"
    case "red":
      return "Nur Excel"
    case "gray":
      return "Nur DB"
  }
}

function compareRows(a: ReconcileRow, b: ReconcileRow) {
  const statusOrder: Record<ResultStatus, number> = {
    yellow: 0,
    red: 1,
    gray: 2,
    green: 3,
  }

  const statusCompare = statusOrder[a.status] - statusOrder[b.status]
  if (statusCompare !== 0) return statusCompare

  const lastNameCompare = a.lastName.localeCompare(b.lastName, "de")
  if (lastNameCompare !== 0) return lastNameCompare

  return a.firstName.localeCompare(b.firstName, "de")
}

function buildMetrics(rows: ReconcileRow[]): ReconcileMetricSummary {
  return {
    excelTotal: rows.filter((row) => row.excel === "Ja").length,
    foundInDb: rows.filter((row) => row.excel === "Ja" && row.db === "Ja").length,
    notFound: rows.filter((row) => row.status === "red").length,
    tsvOk: rows.filter((row) => row.tsvMember === "Ja").length,
    deviations: rows.filter((row) => row.status === "yellow").length,
    onlyDb: rows.filter((row) => row.status === "gray").length,
    onlyExcel: rows.filter((row) => row.status === "red").length,
  }
}

function getNoteParts(note: string) {
  return note
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean)
}

function getPreferredFilter(metrics: ReconcileMetricSummary): FilterValue {
  if (metrics.deviations > 0) return "yellow"
  if (metrics.onlyExcel > 0) return "red"
  if (metrics.onlyDb > 0) return "gray"
  return "all"
}

export default function ExcelAbgleichPage() {
  const router = useRouter()
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [group, setGroup] = useState<string>(TRAINING_GROUPS[0] ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ReconcileResponse | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all")
  const [nameSearch, setNameSearch] = useState("")
  const [hasManualFilterSelection, setHasManualFilterSelection] = useState(false)
  const [loading, setLoading] = useState(false)
  const [updatingActionKey, setUpdatingActionKey] = useState<string | null>(null)
  const [error, setError] = useState("")

  const summaryCards = useMemo(() => {
    if (!result) return []
    return [
      { label: "Excel gesamt", value: result.metrics.excelTotal },
      { label: "in DB gefunden", value: result.metrics.foundInDb },
      { label: "nicht gefunden", value: result.metrics.notFound },
      { label: "TSV ok", value: result.metrics.tsvOk },
      { label: "Abweichungen", value: result.metrics.deviations },
      { label: "nur DB", value: result.metrics.onlyDb },
      { label: "nur Excel", value: result.metrics.onlyExcel },
    ]
  }, [result])

  const filterOptions = useMemo(
    () => [
      { value: "all" as const, label: "Alle" },
      { value: "yellow" as const, label: "Abweichungen" },
      { value: "red" as const, label: "Nur Excel" },
      { value: "gray" as const, label: "Nur DB" },
      { value: "green" as const, label: "TSV ok" },
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
      result.metrics.deviations > 0 ? `${result.metrics.deviations} Abweichungen` : null,
      result.metrics.onlyExcel > 0 ? `${result.metrics.onlyExcel} nur in Excel` : null,
      result.metrics.onlyDb > 0 ? `${result.metrics.onlyDb} nur in DB` : null,
    ].filter((item): item is string => Boolean(item))
  }, [result])

  const handleExport = () => {
    if (!filteredRows.length) return

    const headers = [
      "Vorname",
      "Nachname",
      "Geburtsdatum",
      "Excel",
      "DB",
      "TSV-Mitglied",
      "Gruppe DB",
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
          row.birthdate || "—",
          row.excel,
          row.db,
          row.tsvMember,
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
    downloadLink.download = `excel-abgleich-${result?.group ?? "gruppe"}-${fileSuffix}.csv`
    document.body.appendChild(downloadLink)
    downloadLink.click()
    document.body.removeChild(downloadLink)
    URL.revokeObjectURL(url)
  }

  const getNavigableMemberId = (row: ReconcileRow) => {
    if (row.db !== "Ja") return null
    return row.id.startsWith("db-") ? row.id.slice(3) : row.id
  }

  const canSetTsvMember = (row: ReconcileRow) =>
    row.db === "Ja" && row.tsvMember === "Nein" && !row.note.includes("Probemitglied")

  const canAdoptGroup = (row: ReconcileRow) => row.db === "Ja" && row.groupDb !== group

  const getUpdatedDbRow = (entry: ReconcileRow, nextValues: Partial<ReconcileRow>): ReconcileRow => {
    const nextRow = { ...entry, ...nextValues }
    const nextStatus =
      nextRow.db === "Ja" && nextRow.excel === "Ja" && nextRow.tsvMember === "Ja" && getNoteParts(nextRow.note).length === 0
        ? "green"
        : nextRow.status === "red" || nextRow.status === "gray"
          ? nextRow.status
          : "yellow"

    return {
      ...nextRow,
      status: nextStatus,
      statusLabel: getStatusLabel(nextStatus),
      note: getNoteParts(nextRow.note).join(" · ") || (nextStatus === "green" ? "Excel und DB stimmen ueberein" : nextRow.note),
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
          baseGroup: row.groupDb,
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
            tsvMember: "Ja" as const,
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
        router.push(
          buildAdminMailComposeHref({
            title: "Freigabe-Mail bearbeiten",
            returnTo: "/verwaltung/excel-abgleich",
            requests: [
              {
                kind: "approval_notice",
                email: payload.member.email,
                name: `${payload.member.first_name ?? ""} ${payload.member.last_name ?? ""}`.trim() || payload.member.name || undefined,
                targetKind: "member",
                group: row.groupDb,
              },
            ],
          })
        )
      }
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
          baseGroup: group,
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
            .filter((part) => !part.startsWith("Gruppe weicht ab ("))
            .join(" · ")

          return getUpdatedDbRow(entry, {
            groupDb: group,
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
      setError(nextError instanceof Error ? nextError.message : "Gruppe konnte nicht uebernommen werden.")
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
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900">Excel-Abgleich</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Gruppenliste aus Excel hochladen und direkt mit der Mitgliederdatenbank abgleichen.
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
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Gruppe</Label>
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger className="rounded-2xl">
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

            <div className="space-y-2">
              <Label>Excel-Datei</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="rounded-2xl"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null)
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
              disabled={!group || !file || loading}
              onClick={async () => {
                try {
                  if (!file) {
                    setError("Bitte zuerst eine Excel-Datei auswählen.")
                    return
                  }

                  setLoading(true)
                  setError("")
                  const formData = new FormData()
                  formData.set("group", group)
                  formData.set("file", file)

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
                  setResult(null)
                  setError(nextError instanceof Error ? nextError.message : "Abgleich fehlgeschlagen.")
                } finally {
                  setLoading(false)
                }
              }}
            >
              <Upload className="mr-2 h-4 w-4" />
              {loading ? "Abgleich läuft..." : "Abgleich starten"}
            </Button>

            {file ? <div className="text-sm text-zinc-500">Datei: {file.name}</div> : null}
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
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
                  <div className="mt-1 text-3xl font-bold text-zinc-900">{card.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Ergebnisse für {result.group}</CardTitle>
              <div className="text-sm text-zinc-500">{result.fileName}</div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                {problemSummaryItems.length > 0 ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {problemSummaryItems.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : (
                  <span className="text-emerald-700">Keine Problemfälle gefunden. Excel und DB sind sauber abgeglichen.</span>
                )}
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
                          isActive
                            ? "rounded-full bg-[#154c83] text-white hover:bg-[#123d69]"
                            : "rounded-full"
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
                    <TableHead>Excel</TableHead>
                    <TableHead>DB</TableHead>
                    <TableHead>TSV-Mitglied</TableHead>
                    <TableHead>Gruppe DB</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hinweis</TableHead>
                    <TableHead>Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={getNavigableMemberId(row) ? "cursor-pointer hover:bg-zinc-50" : undefined}
                      onClick={() => {
                        const memberId = getNavigableMemberId(row)
                        if (!memberId) return
                        router.push(`/verwaltung/mitglieder?memberId=${encodeURIComponent(memberId)}`)
                      }}
                    >
                      <TableCell>{row.firstName || "—"}</TableCell>
                      <TableCell>{row.lastName || "—"}</TableCell>
                      <TableCell>{row.birthdate || "—"}</TableCell>
                      <TableCell>{row.excel}</TableCell>
                      <TableCell>{row.db}</TableCell>
                      <TableCell>{row.tsvMember}</TableCell>
                      <TableCell>{row.groupDb}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusBadgeClass(row.status)}>
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
                          </div>
                        ) : (
                          <span className="text-sm text-zinc-300">—</span>
                        )}
                      </TableCell>
                    </TableRow>
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
