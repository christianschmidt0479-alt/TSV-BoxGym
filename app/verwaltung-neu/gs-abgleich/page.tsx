"use client"

import { useState } from "react"

import { saveGsStatusMapForGroup, type GsStatus } from "./gsStatusStore"
import { TRAINING_GROUPS, type TrainingGroup } from "@/lib/trainingGroups"

type ResultStatus = GsStatus

type GsResultRow = {
  memberId: string | null
  firstName: string
  lastName: string
  birthdate: string | null
  group: string | null
  status: ResultStatus
}

type GsCompareResponse = {
  groupName?: string
  results?: GsResultRow[]
  memberStatuses?: Record<string, GsStatus>
  error?: string
}

type GroupUploadState = {
  file: File | null
  loading: boolean
  error: string
  results: GsResultRow[]
}

function statusLabel(status: ResultStatus) {
  if (status === "match") return "vorhanden"
  if (status === "mismatch") return "Name stimmt, DOB abweichend"
  return "kein Treffer"
}

function statusClassName(status: ResultStatus) {
  if (status === "match") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "mismatch") return "bg-amber-50 text-amber-700 border-amber-200"
  return "bg-red-50 text-red-700 border-red-200"
}

function createInitialGroupStates() {
  const initial = {} as Record<TrainingGroup, GroupUploadState>

  for (const group of TRAINING_GROUPS) {
    initial[group] = {
      file: null,
      loading: false,
      error: "",
      results: [],
    }
  }

  return initial
}

export default function GsAbgleichPage() {
  const [groupStates, setGroupStates] = useState<Record<TrainingGroup, GroupUploadState>>(() => createInitialGroupStates())

  function setGroupState(group: TrainingGroup, patch: Partial<GroupUploadState>) {
    setGroupStates((prev) => ({
      ...prev,
      [group]: {
        ...prev[group],
        ...patch,
      },
    }))
  }

  async function handleGroupUpload(group: TrainingGroup) {
    const { file } = groupStates[group]
    if (!file) {
      setGroupState(group, { error: "Bitte zuerst eine Datei auswählen." })
      return
    }

    setGroupState(group, { loading: true, error: "" })

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("groupName", group)

      const response = await fetch("/api/admin/gs-abgleich", {
        method: "POST",
        body: formData,
        credentials: "include",
      })

      const responseText = await response.text()
      let payload: GsCompareResponse = {}

      if (responseText) {
        try {
          payload = JSON.parse(responseText) as GsCompareResponse
        } catch {
          payload = {}
        }
      }

      if (!response.ok) {
        const message = payload.error || responseText || "Upload fehlgeschlagen"
        throw new Error(message)
      }

      const results = payload.results ?? []
      const memberStatuses = payload.memberStatuses ?? {}

      saveGsStatusMapForGroup(group, memberStatuses)
      setGroupState(group, { loading: false, error: "", results })
    } catch (error) {
      setGroupState(group, {
        loading: false,
        results: [],
        error: error instanceof Error ? error.message : "Abgleich fehlgeschlagen.",
      })
    }
  }

  return (
    <div className="space-y-4">
      {TRAINING_GROUPS.map((group) => {
        const state = groupStates[group]
        const matches = state.results.filter((entry) => entry.status === "match").length
        const mismatches = state.results.filter((entry) => entry.status === "mismatch").length
        const notFound = state.results.filter((entry) => entry.status === "not_found").length

        return (
          <div key={group} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-base font-semibold text-zinc-900">{group}</div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => {
                  setGroupState(group, {
                    file: event.target.files?.[0] ?? null,
                    error: "",
                  })
                }}
                className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
              <button
                type="button"
                onClick={() => {
                  void handleGroupUpload(group)
                }}
                disabled={state.loading}
                className="rounded-lg bg-[#154c83] px-4 py-2 text-sm font-semibold text-white hover:bg-[#123d69] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {state.loading ? "Lade..." : "Datei hochladen"}
              </button>
            </div>

            <div className="mt-2 text-xs text-zinc-500">Erlaubte Formate: xlsx, xls, csv</div>

            {state.error ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>
            ) : null}

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm shadow-sm">
                <span className="font-semibold">Match:</span> {matches} · <span className="font-semibold">Mismatch:</span> {mismatches} · <span className="font-semibold">Not found:</span> {notFound}
              </div>

              <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 text-left text-zinc-700">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Geburtsdatum</th>
                      <th className="px-3 py-2 font-semibold">Gruppe</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.results.length > 0 ? (
                      state.results.map((row, index) => (
                        <tr key={`${group}-${row.memberId ?? `${row.firstName}-${row.lastName}`}-${index}`} className="border-t border-zinc-100">
                          <td className="px-3 py-2 text-zinc-900">{row.firstName} {row.lastName}</td>
                          <td className="px-3 py-2 text-zinc-700">{row.birthdate || "-"}</td>
                          <td className="px-3 py-2 text-zinc-700">{row.group || group}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusClassName(row.status)}`}>
                              {statusLabel(row.status)}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-zinc-500">
                          Noch kein Abgleich für diese Gruppe.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
