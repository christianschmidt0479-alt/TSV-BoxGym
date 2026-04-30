"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

type MigrationStats = {
  totalMembers: number
  categories: {
    bcrypt_hash: number
    sha256_legacy_hash: number
    possible_plaintext_legacy: number
    missing_secret: number
  }
  hasPossiblePlaintextLegacy: boolean
  affectedMembersTotal: number
  affectedMembers?: Array<{
    id: string
    name: string | null
    email: string | null
    base_group: string | null
    created_at: string | null
    category: "possible_plaintext_legacy" | "missing_secret"
    recommendedAction: string
  }>
  notice: string
}

export default function PasswordMigrationPage() {
  const [stats, setStats] = useState<MigrationStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sendingResetForMemberId, setSendingResetForMemberId] = useState<string | null>(null)
  const [actionMessageByMemberId, setActionMessageByMemberId] = useState<Record<string, string>>({})

  async function sendPasswordReset(memberId: string) {
    if (!memberId) return

    setSendingResetForMemberId(memberId)
    try {
      const response = await fetch("/api/admin/member-secret-migration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "send_password_reset",
          memberId,
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok) {
        setActionMessageByMemberId((prev) => ({
          ...prev,
          [memberId]: result?.error || "Fehler beim Senden des Passwort-Resets.",
        }))
        return
      }

      setActionMessageByMemberId((prev) => ({
        ...prev,
        [memberId]: result?.message || "Wenn ein passendes Mitglied mit bestaetigter E-Mail existiert, wurde ein Reset-Link versendet.",
      }))
    } catch {
      setActionMessageByMemberId((prev) => ({
        ...prev,
        [memberId]: "Netzwerkfehler beim Senden des Passwort-Resets.",
      }))
    } finally {
      setSendingResetForMemberId(null)
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    async function loadStats() {
      try {
        const response = await fetch("/api/admin/member-secret-migration?includeAffectedMembers=1", {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        })

        const result = await response.json()

        if (!response.ok) {
          setError(result?.error || "Fehler beim Laden der Migrationsauswertung.")
          setStats(null)
          return
        }

        setStats(result as MigrationStats)
        setError(null)
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return
        console.error(err)
        setError("Netzwerkfehler beim Laden der Migrationsauswertung.")
      } finally {
        setLoading(false)
      }
    }

    loadStats()

    return () => controller.abort()
  }, [])

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <h1 className="text-2xl font-bold text-zinc-900">Passwort-/PIN-Migration</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Aggregierte Admin-Auswertung zum Stand gespeicherter Mitglieds-Secrets.
        </p>
      </section>

      {loading && (
        <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 text-sm text-zinc-600 shadow-sm">
          Lade Auswertung...
        </section>
      )}

      {error && (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-5 text-sm text-red-700 shadow-sm">
          {error}
        </section>
      )}

      {stats && (
        <>
          <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
            <div className="text-sm text-zinc-600">Gesamtzahl Mitglieder</div>
            <div className="mt-1 text-3xl font-bold text-zinc-900">{stats.totalMembers}</div>
            <div className="mt-3 text-sm text-zinc-600">Betroffene Mitglieder (Diagnoseliste): {stats.affectedMembersTotal}</div>
            <p className="mt-3 text-sm text-zinc-700">{stats.notice}</p>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
              <div className="text-sm text-zinc-600">bcrypt_hash</div>
              <div className="mt-1 text-2xl font-semibold text-zinc-900">{stats.categories.bcrypt_hash}</div>
            </article>
            <article className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
              <div className="text-sm text-zinc-600">sha256_legacy_hash</div>
              <div className="mt-1 text-2xl font-semibold text-zinc-900">{stats.categories.sha256_legacy_hash}</div>
            </article>
            <article className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
              <div className="text-sm text-zinc-600">possible_plaintext_legacy</div>
              <div className="mt-1 text-2xl font-semibold text-zinc-900">{stats.categories.possible_plaintext_legacy}</div>
            </article>
            <article className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
              <div className="text-sm text-zinc-600">missing_secret</div>
              <div className="mt-1 text-2xl font-semibold text-zinc-900">{stats.categories.missing_secret}</div>
            </article>
          </section>

          {stats.hasPossiblePlaintextLegacy && (
            <section className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-800 shadow-sm">
              Warnung: Es wurden moegliche Legacy-Klartext-Secrets gefunden (possible_plaintext_legacy &gt; 0).
            </section>
          )}

          <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Betroffene Mitglieder (optional)</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Angezeigt werden nur Diagnosefelder. Keine Passwoerter, keine PINs, keine Hashes, keine Tokens.
            </p>

            {stats.affectedMembers && stats.affectedMembers.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-zinc-600">
                      <th className="px-2 py-2 font-semibold">id</th>
                      <th className="px-2 py-2 font-semibold">name</th>
                      <th className="px-2 py-2 font-semibold">email</th>
                      <th className="px-2 py-2 font-semibold">base_group</th>
                      <th className="px-2 py-2 font-semibold">created_at</th>
                      <th className="px-2 py-2 font-semibold">Kategorie</th>
                      <th className="px-2 py-2 font-semibold">Empfohlene Aktion</th>
                        <th className="px-2 py-2 font-semibold">Admin-Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.affectedMembers.map((member) => (
                      <tr key={member.id} className="border-b border-zinc-100 align-top text-zinc-800">
                        <td className="px-2 py-2 font-mono text-xs">{member.id}</td>
                        <td className="px-2 py-2">{member.name || "-"}</td>
                        <td className="px-2 py-2">{member.email || "-"}</td>
                        <td className="px-2 py-2">{member.base_group || "-"}</td>
                        <td className="px-2 py-2">{member.created_at || "-"}</td>
                        <td className="px-2 py-2">{member.category}</td>
                        <td className="px-2 py-2">{member.recommendedAction}</td>
                          <td className="px-2 py-2">
                            <div className="flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => sendPasswordReset(member.id)}
                                disabled={!member.id || sendingResetForMemberId === member.id}
                                className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {sendingResetForMemberId === member.id ? "Senden..." : "Passwort-Reset senden"}
                              </button>

                              {member.id ? (
                                <Link
                                  href={`/verwaltung-neu/mitglieder/${member.id}`}
                                  className="inline-flex items-center justify-center rounded-md bg-[#154c83] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0f3f70]"
                                >
                                  Mitglied oeffnen
                                </Link>
                              ) : (
                                <span className="text-xs text-zinc-500">Mitglied oeffnen nicht verfuegbar</span>
                              )}

                              {actionMessageByMemberId[member.id] && (
                                <p className="text-xs text-zinc-600">{actionMessageByMemberId[member.id]}</p>
                              )}
                            </div>
                          </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-600">Aktuell keine betroffenen Mitglieder in den Kategorien missing_secret oder possible_plaintext_legacy.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
