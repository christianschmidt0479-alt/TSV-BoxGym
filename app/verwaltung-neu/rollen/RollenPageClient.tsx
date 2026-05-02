"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { PersonEntry } from "./page"

type ActionState = {
  loading: boolean
  error: string
  success: string
}

type Props = {
  entries: PersonEntry[]
}

function RoleBadges({ entry }: { entry: PersonEntry }) {
  return (
    <span className="flex flex-wrap gap-1">
      {entry.isMember && !entry.isTrial && (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
          Sportler
        </span>
      )}
      {entry.isTrial && (
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
          Probe
        </span>
      )}
      {entry.isAdmin && (
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
          Admin
        </span>
      )}
      {entry.isActiveTrainer && !entry.isAdmin && (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
          Trainer
        </span>
      )}
      {entry.hasTrainerAccount && !entry.trainerApproved && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          Trainer (inaktiv)
        </span>
      )}
      {entry.isLinked && (
        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
          verknüpft
        </span>
      )}
      {entry.hasTrainerAccount && entry.memberId && !entry.isLinked && (
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
          nicht verknüpft
        </span>
      )}
      {!entry.memberId && entry.hasTrainerAccount && (
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
          Trainer-only
        </span>
      )}
    </span>
  )
}

export default function RollenPageClient({ entries }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({})

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) =>
        e.displayName.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q),
    )
  }, [entries, query])

  function getKey(entry: PersonEntry) {
    return entry.memberId ?? entry.trainerId ?? entry.email
  }

  function getState(key: string): ActionState {
    return actionStates[key] ?? { loading: false, error: "", success: "" }
  }

  function setState(key: string, patch: Partial<ActionState>) {
    setActionStates((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { loading: false, error: "", success: "" }), ...patch },
    }))
  }

  async function runAction(
    key: string,
    payload: Record<string, unknown>,
    successMsg: string,
  ) {
    setState(key, { loading: true, error: "", success: "" })
    try {
      const res = await fetch("/api/admin/person-roles", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }

      if (!res.ok || !data.ok) {
        setState(key, { loading: false, error: data.error ?? "Aktion fehlgeschlagen." })
      } else {
        setState(key, { loading: false, success: successMsg })
        router.refresh()
      }
    } catch {
      setState(key, { loading: false, error: "Netzwerkfehler." })
    }
  }

  const memberCount = entries.filter((e) => e.isMember).length
  const trainerCount = entries.filter((e) => e.isActiveTrainer).length
  const adminCount = entries.filter((e) => e.isAdmin).length

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
          <span className="font-semibold text-blue-900">{memberCount}</span>
          <span className="ml-1 text-blue-700">Sportler</span>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <span className="font-semibold text-emerald-900">{trainerCount}</span>
          <span className="ml-1 text-emerald-700">Trainer</span>
        </div>
        <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm">
          <span className="font-semibold text-purple-900">{adminCount}</span>
          <span className="ml-1 text-purple-700">Admin</span>
        </div>
      </div>

      {/* Search */}
      <div>
        <input
          type="search"
          placeholder="Mitglied oder Trainer suchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none"
        />
        {query.trim() && (
          <div className="mt-1 text-xs text-zinc-500">
            {filtered.length} Ergebnis{filtered.length !== 1 ? "se" : ""}
          </div>
        )}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">
            Keine Einträge gefunden.
          </div>
        ) : (
          filtered.map((entry) => {
            const key = getKey(entry)
            const state = getState(key)

            return (
              <div
                key={key}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {/* Left: name + email + badges */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.memberId ? (
                        <Link
                          href={`/verwaltung-neu/mitglieder/${entry.memberId}`}
                          className="font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                        >
                          {entry.displayName}
                        </Link>
                      ) : (
                        <span className="font-semibold text-zinc-900">{entry.displayName}</span>
                      )}
                      <RoleBadges entry={entry} />
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">{entry.email || "–"}</div>
                    {!entry.memberId && entry.hasTrainerAccount && (
                      <div className="mt-1 text-xs text-orange-700">Kein Mitglied verknüpft</div>
                    )}
                    {!entry.trainerApproved && (
                      <div className="mt-1 space-y-0.5 text-xs text-zinc-600">
                        <div>
                          Geburtsdatum: {entry.trainerBirthdate || "–"}
                        </div>
                        <div>
                          DOSB-Lizenz: {entry.dosbLicense || "Keine / noch nicht vorhanden"}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: action buttons (members and trainer-only, never for admins) */}
                  {entry.memberId && !entry.isAdmin && (
                    <div className="flex flex-wrap gap-1.5">
                      {!entry.isActiveTrainer && (
                        <button
                          type="button"
                          disabled={state.loading}
                          onClick={() =>
                            void runAction(
                              key,
                              {
                                action: "grant_trainer",
                                memberId: entry.memberId,
                                memberEmail: entry.email,
                                sendWelcomeMail: false,
                              },
                              "Trainer berechtigt.",
                            )
                          }
                          className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Als Trainer berechtigen
                        </button>
                      )}
                      {entry.isActiveTrainer && (
                        <button
                          type="button"
                          disabled={state.loading}
                          onClick={() =>
                            void runAction(
                              key,
                              { action: "revoke_trainer", memberId: entry.memberId },
                              "Trainerrolle entfernt.",
                            )
                          }
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                        >
                          Trainerrolle entfernen
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={state.loading}
                        onClick={() =>
                          void runAction(
                            key,
                            { action: "ensure_sportler", memberId: entry.memberId },
                            "Sportlerstatus bestätigt.",
                          )
                        }
                        className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 transition hover:bg-blue-100 disabled:opacity-50"
                      >
                        Als Sportler führen
                      </button>
                    </div>
                  )}

                  {!entry.memberId && entry.hasTrainerAccount && !entry.isAdmin && (
                    <div className="flex flex-wrap gap-1.5">
                      {entry.trainerId && (
                        <button
                          type="button"
                          disabled={state.loading}
                          onClick={() =>
                            void runAction(
                              key,
                              { action: "revoke_trainer", trainerId: entry.trainerId },
                              "Trainerrolle entfernt.",
                            )
                          }
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                        >
                          Trainerrolle entfernen
                        </button>
                      )}

                      <Link
                        href={
                          entry.email
                            ? `/verwaltung-neu/mitglieder?q=${encodeURIComponent(entry.email)}`
                            : "/verwaltung-neu/mitglieder"
                        }
                        className="rounded-lg border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 transition hover:bg-teal-100"
                      >
                        Mit Mitglied verknüpfen
                      </Link>

                      <Link
                        href={
                          entry.email
                            ? `/registrieren/mitglied?email=${encodeURIComponent(entry.email)}`
                            : "/registrieren/mitglied"
                        }
                        className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 transition hover:bg-blue-100"
                      >
                        Als Mitglied anlegen
                      </Link>
                    </div>
                  )}

                  {/* Admin: read-only notice */}
                  {entry.isAdmin && (
                    <span className="rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs text-purple-700">
                      Admin — keine Änderung hier
                    </span>
                  )}
                </div>

                {/* Feedback */}
                {state.loading && (
                  <div className="mt-2 text-xs text-zinc-500">Wird verarbeitet…</div>
                )}
                {state.error && (
                  <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                    {state.error}
                  </div>
                )}
                {state.success && (
                  <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                    {state.success}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
