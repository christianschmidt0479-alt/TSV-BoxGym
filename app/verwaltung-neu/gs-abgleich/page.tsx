"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
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
  memberId?: string
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
  groupDb?: string
  statusLabel?: string
  officeListManualConfirmed?: boolean
  excel?: "Ja" | "Nein" | string
  db?: "Ja" | "Nein" | string
  status?: "green" | "yellow" | "red" | "gray" | string
  note?: string
}

type UnifiedGsStatus = "green" | "red" | "gray"

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

type MatchCandidate = {
  rowId: string
  firstName: string
  lastName: string
  birthdate: string
  email: string
  phone: string
  groupExcel: string | null
  source: string
  confidence: "exact" | "strong" | "possible" | "uncertain"
  score: number
  reasons: string[]
}

type MatchAnalyzeResponse = {
  ok?: boolean
  error?: string
  member?: {
    id: string
    firstName: string
    lastName: string
    birthdate: string
    email: string
    phone: string
    baseGroup: string
    officeGroup: string
    isLGroup: boolean
  }
  candidates?: MatchCandidate[]
  debugSummary?: {
    rowsChecked?: number
    emailMatches?: number
    nameMatches?: number
    birthdateMatches?: number
    reasonNoCandidate?: string
  }
}

type MatchPanelState = {
  rowKey: string
  memberId: string
  memberName: string
  isLGroup: boolean
  candidates: MatchCandidate[]
  debugSummary?: MatchAnalyzeResponse["debugSummary"]
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

function getUnifiedGsStatus(row: StoredRunRow): UnifiedGsStatus {
  const rawStatus = safeCellValue(row.status).toLowerCase()
  if (rawStatus === "green") return "green"
  if (rawStatus === "red" || rawStatus === "yellow") return "red"
  return "gray"
}

function getUnifiedStatusText(status: UnifiedGsStatus) {
  if (status === "green") return "Verknüpft (OK)"
  if (status === "red") return "Problem"
  return "Nicht gefunden"
}

function getUnifiedStatusIcon(status: UnifiedGsStatus) {
  if (status === "green") return "🟢"
  if (status === "red") return "🔴"
  return "⚪"
}

function getProblemReasonText(row: StoredRunRow) {
  const note = safeCellValue(row.note).toLowerCase()
  if (!note) return "Unbekanntes Problem"
  if (note.includes("mehrere")) return "Mehrfach gefunden"
  if (note.includes("abweich")) return "Datenabweichung"
  return "Konflikt"
}

function getMatchSourceText(row: StoredRunRow) {
  const note = safeCellValue(row.note)
  if (note.includes("Treffer über GS-Abgleich E-Mail")) return "Treffer über GS-Abgleich E-Mail"
  if (note.includes("Treffer über E-Mail")) return "Treffer über Haupt-E-Mail"
  return ""
}

function isManualConfirmed(row: StoredRunRow) {
  return row.officeListManualConfirmed === true
}

export default function GsAbgleichPage() {
  const searchParams = useSearchParams()
  const focusMemberId = useMemo(() => {
    const explicit = (searchParams.get("focusMemberId") ?? "").trim()
    if (explicit) return explicit
    return (searchParams.get("memberId") ?? "").trim()
  }, [searchParams])
  const focusMode = (searchParams.get("mode") ?? "").trim().toLowerCase()
  const isFocusedLinkFlow = focusMode === "link" && focusMemberId.length > 0

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
  const [storedRowsSearch, setStoredRowsSearch] = useState("")
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncError, setSyncError] = useState("")
  const [syncInfo, setSyncInfo] = useState("")
  const [syncResult, setSyncResult] = useState<SyncResponse | null>(null)
  const [inviteLoadingKey, setInviteLoadingKey] = useState<string | null>(null)
  const [inviteResults, setInviteResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [matchLoadingKey, setMatchLoadingKey] = useState<string | null>(null)
  const [matchPanel, setMatchPanel] = useState<MatchPanelState | null>(null)
  const [matchError, setMatchError] = useState("")
  const [matchInfo, setMatchInfo] = useState("")
  const [confirmUncertain, setConfirmUncertain] = useState(false)
  const [linkLoadingRowId, setLinkLoadingRowId] = useState<string | null>(null)
  const [focusAnalyzeDone, setFocusAnalyzeDone] = useState(false)
  const [analyzeStatus, setAnalyzeStatus] = useState<{
    running: boolean
    executed: boolean
    memberId: string
    candidatesCount: number
    reasonNoCandidate: string
    debugSummary?: MatchAnalyzeResponse["debugSummary"]
  }>({
    running: false,
    executed: false,
    memberId: "",
    candidatesCount: 0,
    reasonNoCandidate: "",
  })

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

  const groupFilteredStoredRows = useMemo(() => {
    return storedRows
      .filter((row) => isStoredExcelRow(row))
      .filter((row) => {
        if (groupFilter === "all") return true
        return getStoredRowGroup(row) === groupFilter
      })
  }, [groupFilter, storedRows])

  const filteredStoredRows = useMemo(() => {
    const query = storedRowsSearch.trim().toLowerCase()
    if (!query) return groupFilteredStoredRows

    return groupFilteredStoredRows.filter((row) => {
      const firstName = safeCellValue(row.firstName)
      const lastName = safeCellValue(row.lastName)
      const fullName = `${firstName} ${lastName}`.trim()
      const email = safeCellValue(row.email)
      const birthdate = safeCellValue(row.birthdate)
      const group = String(getStoredRowGroup(row) ?? "").trim()
      const status = safeCellValue(row.status)

      const searchHaystack = [firstName, lastName, fullName, email, birthdate, group, status]
        .join(" ")
        .toLowerCase()

      return searchHaystack.includes(query)
    })
  }, [groupFilteredStoredRows, storedRowsSearch])

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

  function isRecheckCandidateRow(row: StoredRunRow) {
    return safeCellValue(row.memberId).length > 0 && row.db === "Ja" && (row.status === "gray" || row.status === "red")
  }

  function confidenceLabel(confidence: MatchCandidate["confidence"]) {
    switch (confidence) {
      case "exact":
        return "Exakt"
      case "strong":
        return "Stark"
      case "possible":
        return "Möglich"
      default:
        return "Unsicher"
    }
  }

  function confidenceClass(confidence: MatchCandidate["confidence"]) {
    switch (confidence) {
      case "exact":
        return "border-emerald-200 bg-emerald-50 text-emerald-800"
      case "strong":
        return "border-blue-200 bg-blue-50 text-blue-800"
      case "possible":
        return "border-amber-200 bg-amber-50 text-amber-800"
      default:
        return "border-red-200 bg-red-50 text-red-800"
    }
  }

  async function analyzeMemberById(memberId: string, rowKey: string) {
    const normalizedMemberId = memberId.trim()
    if (!normalizedMemberId) {
      setMatchError("Für diesen Eintrag ist keine Member-ID vorhanden.")
      return
    }

    setMatchLoadingKey(rowKey)
    setMatchError("")
    setMatchInfo("")
    setConfirmUncertain(false)
    setAnalyzeStatus({
      running: true,
      executed: false,
      memberId: normalizedMemberId,
      candidatesCount: 0,
      reasonNoCandidate: "",
    })

    try {
      const response = await fetch("/api/admin/gs-match-member", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId: normalizedMemberId, action: "analyze" }),
      })

      const payload = (await response.json().catch(() => ({}))) as MatchAnalyzeResponse

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Erneute Prüfung fehlgeschlagen.")
      }

      const memberName = `${payload.member?.firstName ?? ""} ${payload.member?.lastName ?? ""}`.trim() || "Mitglied"
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
      const reasonNoCandidate =
        candidates.length === 0
          ? payload.debugSummary?.reasonNoCandidate || "Kein GS-Kandidat gefunden. Bitte GS-Daten prüfen oder Suchkriterien erweitern."
          : ""

      setAnalyzeStatus({
        running: false,
        executed: true,
        memberId: normalizedMemberId,
        candidatesCount: candidates.length,
        reasonNoCandidate,
        debugSummary: payload.debugSummary,
      })

      setMatchPanel({
        rowKey,
        memberId: normalizedMemberId,
        memberName,
        isLGroup: Boolean(payload.member?.isLGroup),
        candidates,
        debugSummary: payload.debugSummary,
      })
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : "Erneute Prüfung fehlgeschlagen.")
      setMatchPanel(null)
      setAnalyzeStatus({
        running: false,
        executed: true,
        memberId: normalizedMemberId,
        candidatesCount: 0,
        reasonNoCandidate: "Analyse fehlgeschlagen.",
      })
    } finally {
      setMatchLoadingKey(null)
    }
  }

  async function handleAnalyzeMatch(row: StoredRunRow, rowKey: string) {
    if (!isFocusedLinkFlow) return
    await analyzeMemberById(safeCellValue(row.memberId), rowKey)
  }

  useEffect(() => {
    setFocusAnalyzeDone(false)
  }, [focusMemberId])

  useEffect(() => {
    if (isFocusedLinkFlow) return
    setMatchPanel(null)
    setConfirmUncertain(false)
    setAnalyzeStatus({
      running: false,
      executed: false,
      memberId: "",
      candidatesCount: 0,
      reasonNoCandidate: "",
    })
  }, [isFocusedLinkFlow])

  useEffect(() => {
    if (!isFocusedLinkFlow || !focusMemberId || focusAnalyzeDone) return
    if (storedRows.length === 0) return

    const rowKey = `focus-member-${focusMemberId}`
    void analyzeMemberById(focusMemberId, rowKey).finally(() => {
      setFocusAnalyzeDone(true)
    })
  }, [focusAnalyzeDone, focusMemberId, isFocusedLinkFlow, storedRows.length])

  async function handleLinkCandidate(candidate: MatchCandidate) {
    if (!matchPanel) return
    if (!isFocusedLinkFlow || !focusMemberId || matchPanel.memberId !== focusMemberId) {
      setMatchError("Manuelle Verknüpfung ist nur im fokussierten Mitgliedsprofil-Linkflow erlaubt.")
      return
    }

    setLinkLoadingRowId(candidate.rowId)
    setMatchError("")
    setMatchInfo("")

    try {
      const response = await fetch("/api/admin/gs-match-member", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberId: matchPanel.memberId,
          action: "link",
          candidateRowId: candidate.rowId,
          confirmUncertain,
          linkFlowMode: "focused-member",
          focusedMemberId: focusMemberId,
          adminConfirmed: true,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string }

      if (!response.ok || !payload.ok) {
        if (payload.code === "confirm_required") {
          setMatchError("Unsicherer Treffer: Bitte explizit bestätigen und erneut klicken.")
          return
        }
        throw new Error(payload.error || "Verknüpfung fehlgeschlagen.")
      }

      const refreshResponse = await fetch("/api/admin/excel-abgleich", {
        method: "GET",
        credentials: "include",
      })
      if (refreshResponse.ok && refreshResponse.status !== 204) {
        const refreshPayload = (await refreshResponse.json().catch(() => ({}))) as LastFullRunResponse
        applyRunPayload(refreshPayload)
      }

      setMatchInfo("Mit GS-Datensatz verknüpft. GS-Status am Mitglied wurde aktualisiert.")
      setMatchPanel(null)
      setConfirmUncertain(false)
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : "Verknüpfung fehlgeschlagen.")
    } finally {
      setLinkLoadingRowId(null)
    }
  }

    async function handleInviteMember(row: StoredRunRow, rowKey: string) {
      const email = safeCellValue(row.email)
      if (!email) {
        setInviteResults((prev) => ({ ...prev, [rowKey]: { ok: false, message: "Keine E-Mail-Adresse für diesen Datensatz." } }))
        return
      }

      setInviteLoadingKey(rowKey)
      setInviteResults((prev) => {
        const next = { ...prev }
        delete next[rowKey]
        return next
      })

      try {
        const response = await fetch("/api/admin/excel-abgleich/create-member", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            firstName: safeCellValue(row.firstName),
            lastName: safeCellValue(row.lastName),
            email,
            birthdate: safeCellValue(row.birthdate),
            phone: safeCellValue(row.phone),
            baseGroup: getStoredRowGroup(row) ?? safeCellValue(row.groupExcel),
          }),
        })
        const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; mailSent?: boolean; created?: boolean }
        if (!response.ok || !payload.ok) {
          setInviteResults((prev) => ({ ...prev, [rowKey]: { ok: false, message: payload.error || "Einladung fehlgeschlagen." } }))
        } else {
          const mailNote = payload.mailSent ? "" : " (Mail konnte nicht gesendet werden – bitte manuell erneut versuchen)"
          const action = payload.created ? "Mitglied angelegt" : "Mitglied aktualisiert"
          setInviteResults((prev) => ({ ...prev, [rowKey]: { ok: true, message: `${action} & Einladungs-Mail gesendet.${mailNote}` } }))
        }
      } catch {
        setInviteResults((prev) => ({ ...prev, [rowKey]: { ok: false, message: "Netzwerkfehler bei der Einladung." } }))
      } finally {
        setInviteLoadingKey(null)
      }
    }

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
        {focusMemberId ? (
          <div className="mt-2 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-800">
            Fokus-Mitglied aktiv: {focusMemberId}{focusMode === "link" ? " (Link-Modus)" : ""}
          </div>
        ) : null}
        {isFocusedLinkFlow ? (
          <div className="mt-2 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-2 text-xs text-indigo-900">
            Du verknüpfst diesen GS-Datensatz mit dem ausgewählten Mitglied aus dem Mitgliedsprofil. Es werden nur GS-Statusfelder gesetzt. Mitgliedsdaten bleiben unverändert.
          </div>
        ) : null}
        {(isFocusedLinkFlow || analyzeStatus.running || analyzeStatus.executed) ? (
          <div className="mt-2 rounded-md border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-700">
            <div className="font-semibold text-zinc-900">
              {analyzeStatus.running ? "Analyse läuft..." : analyzeStatus.executed ? "Analyse ausgeführt" : "Analyse noch nicht gestartet"}
            </div>
            {analyzeStatus.memberId ? (
              <div className="mt-1">Mitglied: {analyzeStatus.memberId}</div>
            ) : null}
            {analyzeStatus.executed ? (
              <div className="mt-1">Kandidaten gefunden: <span className="font-semibold">{analyzeStatus.candidatesCount}</span></div>
            ) : null}
            {analyzeStatus.executed && analyzeStatus.candidatesCount === 0 ? (
              <div className="mt-1 text-amber-800">Kein GS-Kandidat gefunden. Bitte GS-Daten prüfen oder Suchkriterien erweitern.</div>
            ) : null}
            {analyzeStatus.reasonNoCandidate ? (
              <div className="mt-1">Grund: {analyzeStatus.reasonNoCandidate}</div>
            ) : null}
            {analyzeStatus.debugSummary ? (
              <div className="mt-1 text-zinc-600">
                Debug: geprüft {analyzeStatus.debugSummary.rowsChecked ?? 0} · E-Mail-Matches {analyzeStatus.debugSummary.emailMatches ?? 0} · Name-Matches {analyzeStatus.debugSummary.nameMatches ?? 0} · Geburtsdatum-Matches {analyzeStatus.debugSummary.birthdateMatches ?? 0}
              </div>
            ) : null}
          </div>
        ) : null}
        {isFocusedLinkFlow && matchPanel && matchPanel.candidates.length > 0 ? (
          <div className="mt-2 rounded-md border border-zinc-200 bg-white px-2 py-2">
            <div className="text-xs font-semibold text-zinc-900">Kandidaten für {matchPanel.memberName}</div>
            <div className="mt-2 space-y-2">
              {matchPanel.candidates.map((candidate) => (
                <div key={candidate.rowId} className="rounded border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs text-zinc-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${confidenceClass(candidate.confidence)}`}>
                      {confidenceLabel(candidate.confidence)}
                    </span>
                    <span>Score: {candidate.score}</span>
                    <span>GS-Gruppe: {candidate.groupExcel || "-"}</span>
                  </div>
                  <div className="mt-1 text-zinc-900">{candidate.firstName} {candidate.lastName}</div>
                  <div>Geburtsdatum: {candidate.birthdate || "-"}</div>
                  <div>E-Mail: {candidate.email || "-"}</div>
                  <div>Treffergrund: {candidate.reasons.join(" · ") || "Keine Begründung"}</div>
                  {candidate.confidence === "uncertain" ? (
                    <label className="mt-1 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={confirmUncertain}
                        onChange={(event) => setConfirmUncertain(event.target.checked)}
                      />
                      Unsicheren Treffer bewusst bestätigen
                    </label>
                  ) : null}
                  <div className="mt-1">
                    <button
                      type="button"
                      disabled={linkLoadingRowId !== null || (candidate.confidence === "uncertain" && !confirmUncertain)}
                      onClick={() => {
                        void handleLinkCandidate(candidate)
                      }}
                      className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {linkLoadingRowId === candidate.rowId ? "Verknüpfe..." : "Diesen GS-Datensatz mit diesem Mitglied verknüpfen"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
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

        {matchError ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {matchError}
          </div>
        ) : null}

        {matchInfo ? (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {matchInfo}
          </div>
        ) : null}

        {isFocusedLinkFlow && matchPanel ? (
          <div className="mb-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Erneute Prüfung für {matchPanel.memberName}</div>
                {matchPanel.isLGroup ? (
                  <div className="text-xs text-zinc-600">L-Gruppe erkannt: Suche läuft gruppenübergreifend.</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setMatchPanel(null)
                  setConfirmUncertain(false)
                }}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:border-zinc-400"
              >
                Schließen
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {matchPanel.candidates.length === 0 ? (
                <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
                  Keine Treffer gefunden.
                </div>
              ) : (
                matchPanel.candidates.map((candidate) => (
                  <div key={candidate.rowId} className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${confidenceClass(candidate.confidence)}`}>
                        {confidenceLabel(candidate.confidence)}
                      </span>
                      <span className="text-xs text-zinc-600">Score: {candidate.score}</span>
                      <span className="text-xs text-zinc-600">Gruppe: {candidate.groupExcel || "-"}</span>
                    </div>
                    <div className="mt-2 text-sm text-zinc-900">
                      {candidate.firstName} {candidate.lastName} · {candidate.birthdate || "-"}
                    </div>
                    <div className="text-xs text-zinc-600">E-Mail: {candidate.email || "-"} · Telefon: {candidate.phone || "-"}</div>
                    <div className="text-xs text-zinc-600">Quelle: {candidate.source || "-"}</div>
                    <div className="mt-1 text-xs text-zinc-700">{candidate.reasons.join(" · ") || "Keine Begründung"}</div>

                    {candidate.confidence === "uncertain" ? (
                      <label className="mt-2 flex items-center gap-2 text-xs text-zinc-700">
                        <input
                          type="checkbox"
                          checked={confirmUncertain}
                          onChange={(event) => setConfirmUncertain(event.target.checked)}
                        />
                        Unsicheren Treffer bewusst bestätigen
                      </label>
                    ) : null}

                    <div className="mt-2">
                      <button
                        type="button"
                        disabled={linkLoadingRowId !== null || (candidate.confidence === "uncertain" && !confirmUncertain)}
                        onClick={() => {
                          void handleLinkCandidate(candidate)
                        }}
                        className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {linkLoadingRowId === candidate.rowId ? "Verknüpfe..." : "Diesen GS-Datensatz mit diesem Mitglied verknüpfen"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

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
          <span className="text-xs text-zinc-500">{filteredStoredRows.length} von {groupFilteredStoredRows.length} GS-Datensätzen angezeigt</span>
        </div>

        <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
          <span className="font-semibold text-zinc-900">Status:</span>{" "}
          <span className="mr-3">🟢 Verknüpft (OK)</span>
          <span className="mr-3">🔴 Problem</span>
          <span>⚪ Nicht gefunden</span>
        </div>

        <div className="mb-3 space-y-1">
          <label className="text-sm text-zinc-700" htmlFor="gs-list-search">GS-Liste durchsuchen</label>
          <input
            id="gs-list-search"
            type="text"
            value={storedRowsSearch}
            onChange={(event) => setStoredRowsSearch(event.target.value)}
            placeholder="Name, E-Mail, Gruppe oder Geburtsdatum suchen ..."
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-700">
              <tr>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Geburtsdatum</th>
                <th className="px-3 py-2 font-semibold">E-Mail</th>
                <th className="px-3 py-2 font-semibold">Gruppe</th>
                <th className="px-3 py-2 font-semibold">Verknüpftes Mitglied</th>
                <th className="px-3 py-2 font-semibold">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filteredStoredRows.length > 0 ? (
                filteredStoredRows.map((row, index) => {
                  const rowGroup = getStoredRowGroup(row)
                  const rowKey = getStoredRowKey(row, index)
                  const recheckCandidate = isRecheckCandidateRow(row)
                  const isFocusedMemberRow = isFocusedLinkFlow && safeCellValue(row.memberId) === focusMemberId
                  const matchLoading = matchLoadingKey === rowKey
                  const unifiedStatus = getUnifiedGsStatus(row)
                  const matchSourceText = getMatchSourceText(row)
                  const manualConfirmed = isManualConfirmed(row)
                  const actionDisabled = matchLoading || matchLoadingKey !== null || !recheckCandidate || !isFocusedMemberRow
                  const actionHint = !isFocusedLinkFlow
                    ? "Aktion im Mitgliedsprofil-Linkflow ausführen."
                    : !recheckCandidate || !isFocusedMemberRow
                      ? "Nur beim fokussierten Mitglied mit prüfbarem Datensatz verfügbar."
                      : ""

                  return (
                  <tr
                    key={getStoredRowKey(row, index)}
                    className={`border-t border-zinc-100 ${focusMemberId && safeCellValue(row.memberId) === focusMemberId ? "bg-indigo-50" : ""}`}
                  >
                    <td className="px-3 py-2 text-zinc-700">
                      <div className="font-medium text-zinc-900">{getUnifiedStatusIcon(unifiedStatus)} {getUnifiedStatusText(unifiedStatus)}</div>
                      {unifiedStatus === "green" ? (
                        <div className="text-xs text-emerald-700">✔ alles korrekt</div>
                      ) : unifiedStatus === "red" ? (
                        <div className="text-xs text-red-700">{getProblemReasonText(row)}</div>
                      ) : (
                        <div className="text-xs text-zinc-600">Nicht gefunden</div>
                      )}
                      {manualConfirmed ? (
                        <div className="mt-1 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          Manuell bestätigt
                        </div>
                      ) : null}
                      {matchSourceText ? (
                        <div className="mt-1 text-xs text-zinc-600">{matchSourceText}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-zinc-900">{safeCellValue(row.firstName) || "-"} {safeCellValue(row.lastName) || "-"}</td>
                    <td className="px-3 py-2 text-zinc-700">{safeCellValue(row.birthdate) || "-"}</td>
                    <td className="px-3 py-2 text-zinc-700">{safeCellValue(row.email) || "-"}</td>
                    <td className="px-3 py-2 text-zinc-700">{rowGroup || "ohne Gruppe"}</td>
                    <td className="px-3 py-2 text-zinc-700">{safeCellValue(row.memberId) || "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                      {unifiedStatus === "green" ? (
                        <span className="text-xs font-semibold text-emerald-700">OK</span>
                      ) : (
                        <button
                          type="button"
                          disabled={actionDisabled}
                          title={actionHint || undefined}
                          onClick={() => {
                            void handleAnalyzeMatch(row, rowKey)
                          }}
                          className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {matchLoading ? "Prüfe..." : unifiedStatus === "red" ? "Problem prüfen" : "Mitglied suchen / verknüpfen"}
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                )})
              ) : (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-zinc-500">
                    {storedRowsSearch.trim()
                      ? "Keine GS-Datensätze zur Suche gefunden."
                      : groupFilter === "all"
                        ? "Keine GS-Liste vorhanden."
                        : "Keine Datensätze für diese Gruppe."}
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
