"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ALL_OFFICE_UPLOAD_GROUPS,
  BOXZWERGE_UPLOAD_GROUP,
  NORMAL_OFFICE_UPLOAD_GROUPS,
  type NormalOfficeUploadGroup,
  type OfficeUploadGroup,
} from "@/lib/officeUploadGroups"

type StoredRunRow = {
  id?: string
  rowId?: string
  firstName?: string
  lastName?: string
  birthdate?: string
  email?: string
  phone?: string
  groupExcel?: string
  groupName?: string
  group?: string
  group_name?: string
  fileGroup?: string
  sourceGroup?: string
  source?: string
  fileName?: string
  excel?: "Ja" | "Nein" | string
}

type StoredRunFile = {
  fileName: string
  group: OfficeUploadGroup
  rowCount: number
}

type LastFullRunResponse = {
  checkedAt?: string
  rows?: StoredRunRow[]
  files?: StoredRunFile[]
  message?: string
  error?: string
}

type UploadInfo = {
  group: OfficeUploadGroup
  rowCount: number
  checkedAt: string
}

type SyncResponse = {
  ok?: boolean
  error?: string
  dryRun?: boolean
  checkedAt?: string
  counts?: {
    green?: number
    yellow?: number
    red?: number
    gray?: number
    skipped?: number
  }
  reasons?: {
    email?: number
    name_birthdate?: number
    phone?: number
    not_found?: number
    group_mismatch?: number
    skipped_no_group?: number
    skipped_no_uploaded_group?: number
  }
}

function normalizeGroupValue(value?: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ")
}

function safeCellValue(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim()
}

function getStoredRowGroup(row: StoredRunRow): OfficeUploadGroup | null {
  const candidates = [
    row.groupExcel,
    row.groupName,
    row.group,
    row.group_name,
    row.fileGroup,
    row.sourceGroup,
  ]

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeGroupValue(candidate)
    if (!normalizedCandidate) continue

    const matched = ALL_OFFICE_UPLOAD_GROUPS.find(
      (group) => normalizeGroupValue(group) === normalizedCandidate,
    )

    if (matched) return matched
  }

  return null
}

function getStoredRowDeleteId(row: StoredRunRow) {
  return safeCellValue(row.id) || safeCellValue(row.rowId)
}

function getStoredRowKey(row: StoredRunRow, index: number) {
  const fallbackGroup =
    getStoredRowGroup(row) ||
    safeCellValue(row.groupName) ||
    safeCellValue(row.groupExcel) ||
    safeCellValue(row.group) ||
    safeCellValue(row.group_name) ||
    safeCellValue(row.fileGroup) ||
    safeCellValue(row.sourceGroup)

  const baseKeyParts = [
    safeCellValue(row.id),
    safeCellValue(row.rowId),
    safeCellValue(row.source),
    safeCellValue(row.fileName),
    fallbackGroup,
    safeCellValue(row.firstName),
    safeCellValue(row.lastName),
    safeCellValue(row.birthdate),
    safeCellValue(row.email),
    safeCellValue(row.phone),
  ]

  const baseKey = baseKeyParts.filter((part) => part.length > 0).join("|") || "stored-row"

  // Always suffix with index so duplicated legacy ids/rowIds can still render safely.
  return `${baseKey}-${index}`
}

function isStoredExcelRow(row: StoredRunRow) {
  return !row.excel || row.excel === "Ja"
}

function toCheckedAtText(value?: string | null) {
  if (!value) return "-"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"

  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function GsAbgleichPage() {
  const [selectedGroup, setSelectedGroup] = useState<NormalOfficeUploadGroup | "">("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [uploadInfo, setUploadInfo] = useState<UploadInfo | null>(null)

  const [boxzwergeFile, setBoxzwergeFile] = useState<File | null>(null)
  const [boxzwergeLoading, setBoxzwergeLoading] = useState(false)
  const [boxzwergeError, setBoxzwergeError] = useState("")
  const [boxzwergeInfo, setBoxzwergeInfo] = useState<UploadInfo | null>(null)

  const [lastFullReconcileAt, setLastFullReconcileAt] = useState<string | null>(null)
  const [storedRows, setStoredRows] = useState<StoredRunRow[]>([])
  const [storedFiles, setStoredFiles] = useState<StoredRunFile[]>([])

  const [storedRowsError, setStoredRowsError] = useState("")
  const [storedRowsInfo, setStoredRowsInfo] = useState("")
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null)
  const [groupFilter, setGroupFilter] = useState<OfficeUploadGroup | "all">("all")
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncError, setSyncError] = useState("")
  const [syncInfo, setSyncInfo] = useState("")
  const [syncResult, setSyncResult] = useState<SyncResponse | null>(null)

  function applyRunPayload(payload: LastFullRunResponse) {
    setLastFullReconcileAt(typeof payload.checkedAt === "string" ? payload.checkedAt : null)
    setStoredRows(Array.isArray(payload.rows) ? payload.rows : [])
    setStoredFiles(Array.isArray(payload.files) ? payload.files : [])
  }

  useEffect(() => {
    let active = true

    async function loadStoredRun() {
      try {
        const response = await fetch("/api/admin/excel-abgleich", {
          method: "GET",
          credentials: "include",
        })

        if (!active) return

        if (response.status === 204) {
          setLastFullReconcileAt(null)
          setStoredRows([])
          setStoredFiles([])
          setStoredRowsError("")
          return
        }

        if (!response.ok) {
          setLastFullReconcileAt(null)
          setStoredRows([])
          setStoredFiles([])
          setStoredRowsError(response.status === 401
            ? "GS-Liste konnte nicht geladen werden (401). Bitte Admin-Session prüfen."
            : "GS-Liste konnte nicht geladen werden.")
          return
        }

        const payload = (await response.json()) as LastFullRunResponse
        applyRunPayload(payload)
        setStoredRowsError("")
      } catch {
        if (!active) return
        setLastFullReconcileAt(null)
        setStoredRows([])
        setStoredFiles([])
        setStoredRowsError("GS-Liste konnte nicht geladen werden.")
      }
    }

    void loadStoredRun()

    return () => {
      active = false
    }
  }, [])

  const filteredStoredRows = useMemo(() => {
    return storedRows
      .filter((row) => isStoredExcelRow(row))
      .filter((row) => {
        if (groupFilter === "all") return true
        return getStoredRowGroup(row) === groupFilter
      })
  }, [groupFilter, storedRows])

  const groupedRows = useMemo(
    () =>
      ALL_OFFICE_UPLOAD_GROUPS
        .map((group) => ({
          group,
          rows: filteredStoredRows.filter((row) => getStoredRowGroup(row) === group),
        }))
        .filter((entry) => entry.rows.length > 0),
    [filteredStoredRows],
  )

  async function handleDeleteStoredRow(row: StoredRunRow) {
    const rowId = getStoredRowDeleteId(row)
    if (!rowId) {
      setStoredRowsError("Datensatz ohne ID kann nicht gelöscht werden. Bitte Liste neu hochladen.")
      return
    }

    const confirmDelete = confirm("Datensatz wirklich nur aus GS-Liste entfernen? Das Mitglied in der App bleibt erhalten.")
    if (!confirmDelete) return

    setDeletingRowId(rowId)
    setStoredRowsInfo("")
    setStoredRowsError("")

    try {
      const response = await fetch("/api/admin/excel-abgleich", {
        method: "DELETE",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ rowId }),
      })

      const payloadText = await response.text()
      let payload: LastFullRunResponse = {}

      if (payloadText) {
        try {
          payload = JSON.parse(payloadText) as LastFullRunResponse
        } catch {
          payload = {}
        }
      }

      if (!response.ok) {
        throw new Error(payload.error || "Datensatz konnte nicht entfernt werden.")
      }

      applyRunPayload(payload)
      setStoredRowsInfo(payload.message || "Datensatz wurde aus der GS-Liste entfernt. App-Mitglied bleibt unverändert.")
    } catch (error) {
      setStoredRowsError(error instanceof Error ? error.message : "Datensatz konnte nicht entfernt werden.")
    } finally {
      setDeletingRowId(null)
    }
  }

  async function runUpload(params: {
    group: OfficeUploadGroup
    file: File
    uploadScope: "normal" | "boxzwerge"
    onSuccess: (payload: LastFullRunResponse) => void
    onError: (message: string) => void
    onFinally: () => void
  }) {
    const { group, file, uploadScope, onSuccess, onError, onFinally } = params

    try {
      const formData = new FormData()
      formData.append("files", file)
      formData.append("groups", group)
      formData.append("uploadScope", uploadScope)

      const response = await fetch("/api/admin/excel-abgleich", {
        method: "POST",
        body: formData,
        credentials: "include",
      })

      const payloadText = await response.text()
      let payload: LastFullRunResponse = {}

      if (payloadText) {
        try {
          payload = JSON.parse(payloadText) as LastFullRunResponse
        } catch {
          payload = {}
        }
      }

      if (!response.ok) {
        throw new Error(payload.error || payloadText || "Upload fehlgeschlagen")
      }

      onSuccess(payload)
    } catch (error) {
      onError(error instanceof Error ? error.message : "Abgleich fehlgeschlagen.")
    } finally {
      onFinally()
    }
  }

  async function handleUpload() {
    if (!selectedGroup) {
      setUploadError("Bitte zuerst Gruppe auswählen.")
      return
    }

    if (!selectedFile) {
      setUploadError("Bitte zuerst eine Datei auswählen.")
      return
    }

    setUploadError("")
    setUploadLoading(true)
    setBoxzwergeError("")
    setSyncError("")
    setSyncInfo("")
    setSyncResult(null)
    setStoredRowsInfo("")
    setStoredRowsError("")

    await runUpload({
      group: selectedGroup,
      file: selectedFile,
      uploadScope: "normal",
      onSuccess: (payload) => {
        applyRunPayload(payload)

        const uploadedCount = (Array.isArray(payload.files) ? payload.files : [])
          .filter((file) => file.group === selectedGroup)
          .reduce((sum, file) => sum + file.rowCount, 0)

        setUploadInfo({
          group: selectedGroup,
          rowCount: uploadedCount,
          checkedAt: typeof payload.checkedAt === "string" ? payload.checkedAt : new Date().toISOString(),
        })
        setSelectedFile(null)
      },
      onError: (message) => setUploadError(message),
      onFinally: () => setUploadLoading(false),
    })
  }

  async function handleBoxzwergeUpload() {
    if (!boxzwergeFile) {
      setBoxzwergeError("Bitte zuerst eine Datei auswählen.")
      return
    }

    setBoxzwergeError("")
    setBoxzwergeLoading(true)
    setUploadError("")
    setSyncError("")
    setSyncInfo("")
    setSyncResult(null)
    setStoredRowsInfo("")
    setStoredRowsError("")

    await runUpload({
      group: BOXZWERGE_UPLOAD_GROUP,
      file: boxzwergeFile,
      uploadScope: "boxzwerge",
      onSuccess: (payload) => {
        applyRunPayload(payload)

        const uploadedCount = (Array.isArray(payload.files) ? payload.files : [])
          .filter((file) => file.group === BOXZWERGE_UPLOAD_GROUP)
          .reduce((sum, file) => sum + file.rowCount, 0)

        setBoxzwergeInfo({
          group: BOXZWERGE_UPLOAD_GROUP,
          rowCount: uploadedCount,
          checkedAt: typeof payload.checkedAt === "string" ? payload.checkedAt : new Date().toISOString(),
        })
        setBoxzwergeFile(null)
      },
      onError: (message) => setBoxzwergeError(message),
      onFinally: () => setBoxzwergeLoading(false),
    })
  }

  async function handleSync() {
    setSyncLoading(true)
    setSyncError("")
    setSyncInfo("")

    try {
      const response = await fetch("/api/admin/excel-abgleich/sync", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ mode: "apply" }),
      })

      const payloadText = await response.text()
      let payload: SyncResponse = {}

      if (payloadText) {
        try {
          payload = JSON.parse(payloadText) as SyncResponse
        } catch {
          payload = {}
        }
      }

      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.error || payloadText || "GS-Synchronisierung fehlgeschlagen.")
      }

      setSyncResult(payload)
      setSyncInfo("GS-Status wurde synchronisiert.")
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "GS-Synchronisierung fehlgeschlagen.")
    } finally {
      setSyncLoading(false)
    }
  }

  const checkedAtText = toCheckedAtText(lastFullReconcileAt)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 shadow-sm">
        <span className="font-semibold text-zinc-900">Letzter GS-Abgleich:</span> {checkedAtText === "-" ? "noch kein vollständiger GS-Abgleich" : checkedAtText}
        <div className="mt-2 text-xs text-zinc-600">
          Upload speichert die GS-Liste. Der sichtbare Mitgliederstatus wird über GS-Synchronisierung aktualisiert.
        </div>
        <div className="mt-1 text-xs text-zinc-600">Standardablauf: GS-Liste hochladen → GS-Status synchronisieren.</div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-base font-semibold text-zinc-900">GS-Status synchronisieren</div>
        <div className="text-xs text-zinc-600">
          Übernimmt die gespeicherte GS-Liste und aktualisiert danach die sichtbaren GS-Status bei Mitgliedern.
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              void handleSync()
            }}
            disabled={syncLoading}
            className="rounded-lg bg-[#154c83] px-4 py-2 text-sm font-semibold text-white hover:bg-[#123d69] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncLoading ? "Synchronisiere..." : "GS-Status synchronisieren"}
          </button>
        </div>

        {syncError ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{syncError}</div>
        ) : null}

        {syncInfo ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{syncInfo}</div>
        ) : null}

        {syncResult?.counts ? (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-700">
            <div className="font-semibold text-zinc-900">Ergebnis</div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <div>Grün: <span className="font-semibold">{syncResult.counts.green ?? 0}</span></div>
              <div>Gelb: <span className="font-semibold">{syncResult.counts.yellow ?? 0}</span></div>
              <div>Rot: <span className="font-semibold">{syncResult.counts.red ?? 0}</span></div>
              <div>Grau/übersprungen: <span className="font-semibold">{syncResult.counts.gray ?? 0}</span></div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-base font-semibold text-zinc-900">GS-Upload je Gruppe</div>

        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <select
            value={selectedGroup}
            onChange={(event) => {
              setSelectedGroup((event.target.value as NormalOfficeUploadGroup) || "")
              setUploadError("")
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          >
            <option value="">Gruppe wählen...</option>
            {NORMAL_OFFICE_UPLOAD_GROUPS.map((group) => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>

          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              setSelectedFile(event.target.files?.[0] ?? null)
              setUploadError("")
            }}
            className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          />

          <button
            type="button"
            onClick={() => {
              void handleUpload()
            }}
            disabled={uploadLoading}
            className="rounded-lg bg-[#154c83] px-4 py-2 text-sm font-semibold text-white hover:bg-[#123d69] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploadLoading ? "Lade..." : "Datei hochladen"}
          </button>
        </div>

        <div className="mt-2 text-xs text-zinc-500">
          Erlaubte GS-Upload-Gruppen: Basic 10 - 14 Jahre, Basic 15 - 18 Jahre, Basic Ü18. L-Gruppe ist nicht uploadbar.
        </div>
        <div className="mt-1 text-xs text-zinc-500">Boxzwerge werden separat abgeglichen.</div>
        <div className="mt-1 text-xs text-zinc-500">L-Gruppe: GS-Status über Stammgruppe</div>

        {uploadError ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{uploadError}</div>
        ) : null}

        {uploadInfo ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Hochgeladene Gruppe: <span className="font-semibold">{uploadInfo.group}</span> · Anzahl Datensätze: <span className="font-semibold">{uploadInfo.rowCount}</span> · Zeitpunkt: <span className="font-semibold">{toCheckedAtText(uploadInfo.checkedAt)}</span>
            <div className="mt-1 text-xs text-emerald-700">Liste gespeichert. Bitte danach GS-Status synchronisieren.</div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-base font-semibold text-zinc-900">Boxzwerge-Abgleich</div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              setBoxzwergeFile(event.target.files?.[0] ?? null)
              setBoxzwergeError("")
            }}
            className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          />

          <button
            type="button"
            onClick={() => {
              void handleBoxzwergeUpload()
            }}
            disabled={boxzwergeLoading}
            className="rounded-lg bg-[#154c83] px-4 py-2 text-sm font-semibold text-white hover:bg-[#123d69] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {boxzwergeLoading ? "Lade..." : "Boxzwerge hochladen"}
          </button>
        </div>

        <div className="mt-2 text-xs text-zinc-500">Dieser Upload verarbeitet ausschließlich die Gruppe Boxzwerge.</div>

        {boxzwergeError ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{boxzwergeError}</div>
        ) : null}

        {boxzwergeInfo ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Hochgeladene Gruppe: <span className="font-semibold">{boxzwergeInfo.group}</span> · Anzahl Datensätze: <span className="font-semibold">{boxzwergeInfo.rowCount}</span> · Zeitpunkt: <span className="font-semibold">{toCheckedAtText(boxzwergeInfo.checkedAt)}</span>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-base font-semibold text-zinc-900">Uploads im aktiven Run</div>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-700">
              <tr>
                <th className="px-3 py-2 font-semibold">Gruppe</th>
                <th className="px-3 py-2 font-semibold">Datei/Upload</th>
                <th className="px-3 py-2 font-semibold">Datensätze</th>
                <th className="px-3 py-2 font-semibold">Zeitpunkt</th>
              </tr>
            </thead>
            <tbody>
              {storedFiles.length > 0 ? (
                storedFiles.map((file, index) => (
                  <tr key={`${file.group}-${file.fileName}-${index}`} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-zinc-900">{file.group}</td>
                    <td className="px-3 py-2 text-zinc-700">{file.fileName}</td>
                    <td className="px-3 py-2 text-zinc-700">{file.rowCount}</td>
                    <td className="px-3 py-2 text-zinc-700">{checkedAtText}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-zinc-500">Keine GS-Uploads gespeichert.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-base font-semibold text-zinc-900">Gespeicherte GS-Liste</div>

        {storedRowsInfo ? (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {storedRowsInfo}
          </div>
        ) : null}

        {storedRowsError ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {storedRowsError}
          </div>
        ) : null}

        <div className="mb-3 flex items-center gap-2">
          <label className="text-sm text-zinc-700" htmlFor="gs-group-filter">Gruppe:</label>
          <select
            id="gs-group-filter"
            value={groupFilter}
            onChange={(event) => setGroupFilter((event.target.value as OfficeUploadGroup | "all") ?? "all")}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900"
          >
            <option value="all">Alle</option>
            {ALL_OFFICE_UPLOAD_GROUPS.map((group) => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
          <span className="text-xs text-zinc-500">Angezeigt: {filteredStoredRows.length}</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-700">
              <tr>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Geburtsdatum</th>
                <th className="px-3 py-2 font-semibold">E-Mail</th>
                <th className="px-3 py-2 font-semibold">Telefon</th>
                <th className="px-3 py-2 font-semibold">Gruppe</th>
                <th className="px-3 py-2 font-semibold">Datei/Upload</th>
                <th className="px-3 py-2 font-semibold">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filteredStoredRows.length > 0 ? (
                filteredStoredRows.map((row, index) => {
                  const rowGroup = getStoredRowGroup(row)
                  const deleteId = getStoredRowDeleteId(row)
                  const deleteDisabled = !deleteId || deletingRowId === deleteId

                  return (
                  <tr key={getStoredRowKey(row, index)} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-zinc-900">{safeCellValue(row.firstName) || "-"} {safeCellValue(row.lastName) || "-"}</td>
                    <td className="px-3 py-2 text-zinc-700">{safeCellValue(row.birthdate) || "-"}</td>
                    <td className="px-3 py-2 text-zinc-700">{safeCellValue(row.email) || "-"}</td>
                    <td className="px-3 py-2 text-zinc-700">{safeCellValue(row.phone) || "-"}</td>
                    <td className="px-3 py-2 text-zinc-700">{rowGroup || "ohne Gruppe"}</td>
                    <td className="px-3 py-2 text-zinc-700">{safeCellValue(row.source) || "-"}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={deleteDisabled}
                        title={!deleteId ? "Datensatz ohne ID - bitte Liste neu hochladen" : undefined}
                        onClick={() => {
                          void handleDeleteStoredRow(row)
                        }}
                        className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {!deleteId ? "Datensatz ohne ID" : deletingRowId === deleteId ? "Löschen..." : "Aus Liste löschen"}
                      </button>
                    </td>
                  </tr>
                )})
              ) : (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-zinc-500">
                    {groupFilter === "all" ? "Keine GS-Liste vorhanden." : "Keine Datensätze für diese Gruppe."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {groupedRows.length > 0 ? (
          <div className="mt-3 grid gap-2 text-xs text-zinc-600 md:grid-cols-2">
            {groupedRows.map((entry) => (
              <div key={entry.group} className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                <span className="font-semibold text-zinc-800">{entry.group}:</span> {entry.rows.length} Datensätze
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
