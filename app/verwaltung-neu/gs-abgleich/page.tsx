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
  id: string
  firstName: string
  lastName: string
  birthdate: string
  email?: string
  phone?: string
  groupExcel: string
  source: string
  excel: "Ja" | "Nein"
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

  const storedExcelRows = useMemo(
    () => storedRows.filter((row) => row.excel === "Ja"),
    [storedRows],
  )

  const filteredStoredRows = useMemo(
    () => storedExcelRows.filter((row) => (groupFilter === "all" ? true : row.groupExcel === groupFilter)),
    [groupFilter, storedExcelRows],
  )

  const groupedRows = useMemo(
    () =>
      ALL_OFFICE_UPLOAD_GROUPS
        .map((group) => ({
          group,
          rows: filteredStoredRows.filter((row) => row.groupExcel === group),
        }))
        .filter((entry) => entry.rows.length > 0),
    [filteredStoredRows],
  )

  async function handleDeleteStoredRow(row: StoredRunRow) {
    const confirmDelete = confirm("Datensatz wirklich nur aus GS-Liste entfernen? Das Mitglied in der App bleibt erhalten.")
    if (!confirmDelete) return

    setDeletingRowId(row.id)
    setStoredRowsInfo("")
    setStoredRowsError("")

    try {
      const response = await fetch("/api/admin/excel-abgleich", {
        method: "DELETE",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ rowId: row.id }),
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

  const checkedAtText = toCheckedAtText(lastFullReconcileAt)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 shadow-sm">
        <span className="font-semibold text-zinc-900">Letzter GS-Abgleich:</span> {checkedAtText === "-" ? "noch kein vollständiger GS-Abgleich" : checkedAtText}
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
                filteredStoredRows.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-zinc-900">{row.firstName} {row.lastName}</td>
                    <td className="px-3 py-2 text-zinc-700">{row.birthdate || "-"}</td>
                    <td className="px-3 py-2 text-zinc-700">{row.email || "-"}</td>
                    <td className="px-3 py-2 text-zinc-700">{row.phone || "-"}</td>
                    <td className="px-3 py-2 text-zinc-700">{row.groupExcel || "-"}</td>
                    <td className="px-3 py-2 text-zinc-700">{row.source || "-"}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={deletingRowId === row.id}
                        onClick={() => {
                          void handleDeleteStoredRow(row)
                        }}
                        className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingRowId === row.id ? "Löschen..." : "Aus Liste löschen"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-zinc-500">
                    Keine GS-Liste vorhanden.
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
