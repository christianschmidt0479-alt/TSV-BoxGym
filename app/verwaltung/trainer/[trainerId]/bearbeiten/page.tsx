"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import React from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatIsoDateForDisplay } from "@/lib/dateFormat"
import { type TrainerAccountRecord } from "@/lib/trainerDb"
import { normalizeTrainerLicense, trainerLicenseOptions } from "@/lib/trainerLicense"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type LinkedMemberSummary = {
  id: string
  birthdate?: string | null
  first_name?: string | null
  last_name?: string | null
  name?: string | null
  email?: string | null
  base_group?: string | null
  is_competition_member?: boolean | null
  has_competition_pass?: boolean | null
  competition_license_number?: string | null
  last_medical_exam_date?: string | null
  competition_fights?: number | null
  competition_wins?: number | null
  competition_losses?: number | null
  competition_draws?: number | null
}

function parseDateInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const germanMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)

  const parts = isoMatch
    ? { year: isoMatch[1], month: isoMatch[2], day: isoMatch[3] }
    : germanMatch
      ? { year: germanMatch[3], month: germanMatch[2], day: germanMatch[1] }
      : null

  if (!parts) return null

  const isoDate = `${parts.year}-${parts.month}-${parts.day}`
  const parsedDate = new Date(`${isoDate}T12:00:00`)

  if (Number.isNaN(parsedDate.getTime())) return null

  if (
    parsedDate.getFullYear() !== Number(parts.year) ||
    parsedDate.getMonth() + 1 !== Number(parts.month) ||
    parsedDate.getDate() !== Number(parts.day)
  ) {
    return null
  }

  return isoDate
}

function formatDateForDisplay(value: string | null | undefined) {
  const isoDate = typeof value === "string" ? parseDateInput(value) : null
  if (!isoDate) return value ?? ""

  return formatIsoDateForDisplay(isoDate) ?? (value ?? "")
}

function normalizeRenewalsText(text: string) {
  return text
    .split(/\n|,/) // allow newline or comma separated
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function normalizeRenewalsForSave(text: string) {
  return normalizeRenewalsText(text).map((entry) => {
    const isoDate = parseDateInput(entry)
    if (!isoDate) {
      throw new Error("Lizenzverlängerungen müssen als Datum im Format TT.MM.JJJJ eingegeben werden.")
    }
    return isoDate
  })
}

async function getErrorMessage(response: Response, fallback: string) {
  const text = await response.text()
  if (!text) return fallback

  try {
    const payload = JSON.parse(text) as { error?: string; details?: string }
    if (payload.details) return `${payload.error || fallback}: ${payload.details}`
    if (payload.error) return payload.error
  } catch {
    // ignore JSON parse errors and fall back to the raw text
  }

  return text
}

const inputClassName =
  "w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm outline-none transition focus:border-[#154c83] focus:ring-4 focus:ring-[#154c83]/10"
const emphasizedFieldClassName =
  "w-full rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-zinc-900 shadow-sm outline-none transition focus:border-[#154c83] focus:ring-4 focus:ring-[#154c83]/10"
const sectionClassName = "rounded-3xl border border-zinc-200 bg-zinc-50/70 p-4"

type TrainerEditResponse = TrainerAccountRecord & {
  base_group?: string | null
}

export default function TrainerBearbeitenPage() {
  const params = useParams()
  const trainerId = (params?.trainerId as string) || ""
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()

  const [loading, setLoading] = useState(true)
  const [saveLoading, setSaveLoading] = useState(false)
  const [error, setError] = useState("")
  const [trainer, setTrainer] = useState<TrainerEditResponse | null>(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [license, setLicense] = useState<string>(trainerLicenseOptions[0])
  const [renewalsText, setRenewalsText] = useState("")
  const [lizenzArt, setLizenzArt] = useState("")
  const [lizenzNummer, setLizenzNummer] = useState("")
  const [lizenzGueltigBis, setLizenzGueltigBis] = useState("")
  const [lizenzVerband, setLizenzVerband] = useState("")
  const [bemerkung, setBemerkung] = useState("")
  const [role, setRole] = useState<"trainer" | "admin">("trainer")
  const [linkedMember, setLinkedMember] = useState<LinkedMemberSummary | null>(null)
  const [isSportler, setIsSportler] = useState(false)
  const [isWettkaempfer, setIsWettkaempfer] = useState(false)
  const [memberBirthdate, setMemberBirthdate] = useState("")
  const [memberActionLoading, setMemberActionLoading] = useState(false)
  const [memberHint, setMemberHint] = useState("")

  const loadTrainer = useCallback(async () => {
    setLoading(true)
    try {
      setError("")
      const response = await fetch("/api/admin/person-roles", { cache: "no-store" })
      if (!response.ok) throw new Error("Trainerdaten konnten nicht geladen werden.")
      const payload = (await response.json()) as { trainers?: TrainerEditResponse[] }
      const trainers = Array.isArray(payload.trainers) ? payload.trainers : []
      const found = trainers.find((t) => t.id === trainerId) || null
      if (!found) throw new Error("Trainer nicht gefunden")
      const membersResponse = await fetch("/api/admin/person-roles", { cache: "no-store" })
      if (!membersResponse.ok) throw new Error("Mitgliedsdaten konnten nicht geladen werden.")
      const membersPayload = (await membersResponse.json()) as { members?: LinkedMemberSummary[] }
      const members = Array.isArray(membersPayload.members) ? membersPayload.members : []
      const normalizedEmail = (found.email ?? "").trim().toLowerCase()
      const matchedMember =
        members.find((member) => member.id === found.linked_member_id) ??
        members.find((member) => (member.email ?? "").trim().toLowerCase() === normalizedEmail) ??
        null

      setTrainer(found)
      setFirstName(found.first_name ?? "")
      setLastName(found.last_name ?? "")
      setEmail(found.email ?? "")
      setPhone(found.phone ?? "")
      setLicense(normalizeTrainerLicense(found.trainer_license ?? found.lizenzart) ?? trainerLicenseOptions[0])
      setRenewalsText(Array.isArray(found.trainer_license_renewals) ? (found.trainer_license_renewals || []).map((entry: string) => formatDateForDisplay(entry)).join("\n") : "")
      setRole(found.role === "admin" ? "admin" : "trainer")
      setLizenzArt(normalizeTrainerLicense(found.lizenzart) ? "" : (found.lizenzart ?? ""))
      setLizenzNummer(found.lizenznummer ?? "")
      setLizenzGueltigBis(formatDateForDisplay(found.lizenz_gueltig_bis))
      setLizenzVerband(found.lizenz_verband ?? "")
      setBemerkung(found.bemerkung ?? "")
      setLinkedMember(matchedMember)
      setIsSportler(Boolean(matchedMember))
      setIsWettkaempfer(Boolean(matchedMember?.is_competition_member))
      setMemberBirthdate(formatDateForDisplay(matchedMember?.birthdate))
      setMemberHint(
        matchedMember
          ? "Trainerkonto ist mit einem Sportlerkonto verknüpft."
          : normalizedEmail
            ? "Kein passendes Sportlerkonto mit gleicher E-Mail gefunden."
            : "Ohne E-Mail kann kein Sportlerkonto automatisch erkannt werden."
      )
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : "Fehler beim Laden")
    } finally {
      setLoading(false)
    }
  }, [trainerId])

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }
    if (trainerId) void loadTrainer()
  }, [authResolved, trainerRole, trainerId, loadTrainer])

  async function save() {
    setSaveLoading(true)
    try {
      setError("")
      const normalizedLizenzGueltigBis = lizenzGueltigBis.trim()
        ? parseDateInput(lizenzGueltigBis)
        : null

      if (lizenzGueltigBis.trim() && !normalizedLizenzGueltigBis) {
        throw new Error("'Gültig bis' muss im Format TT.MM.JJJJ eingegeben werden.")
      }

      const normalizedMemberBirthdate = memberBirthdate.trim() ? parseDateInput(memberBirthdate) : null
      if (memberBirthdate.trim() && !normalizedMemberBirthdate) {
        throw new Error("Geburtsdatum muss im Format TT.MM.JJJJ eingegeben werden.")
      }
      if (isSportler && !linkedMember && !normalizedMemberBirthdate) {
        throw new Error("Bitte ein Geburtsdatum für das neue Sportlerkonto eingeben.")
      }

      const response = await fetch(`/api/admin/trainer-account/${trainerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          isSportler,
          memberBirthdate: normalizedMemberBirthdate,
          linkedMemberId: isSportler ? linkedMember?.id ?? trainer?.linked_member_id ?? null : null,
          trainerLicense: license,
          trainerLicenseRenewals: normalizeRenewalsForSave(renewalsText),
          lizenzart: lizenzArt.trim() || null,
          lizenznummer: lizenzNummer || null,
          lizenz_gueltig_bis: normalizedLizenzGueltigBis,
          lizenz_verband: lizenzVerband || null,
          bemerkung: bemerkung || null,
        }),
      })
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "Speichern fehlgeschlagen"))
      }
      const result = (await response.json()) as {
        linkedMemberId?: string | null
        autoCreatedMemberId?: string | null
      }
      const resolvedLinkedMemberId = isSportler ? result.linkedMemberId ?? linkedMember?.id ?? trainer?.linked_member_id ?? null : null

      // update role if changed
      if ((trainer?.role || "trainer") !== role) {
        const roleResp = await fetch(`/api/admin/person-roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set_trainer_role", trainerId, role }),
        })
        if (!roleResp.ok) {
          throw new Error(await getErrorMessage(roleResp, "Rollenänderung fehlgeschlagen"))
        }
      }

      if (resolvedLinkedMemberId) {
        const currentIsCompetitionMember = Boolean(linkedMember?.is_competition_member)
        if (currentIsCompetitionMember !== isWettkaempfer) {
          setMemberActionLoading(true)
          const competitionResp = await fetch("/api/admin/member-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "set_competition",
              memberId: resolvedLinkedMemberId,
              isCompetitionMember: isWettkaempfer,
              hasCompetitionPass: linkedMember?.has_competition_pass ?? false,
              competitionLicenseNumber: linkedMember?.competition_license_number ?? undefined,
              lastMedicalExamDate: linkedMember?.last_medical_exam_date ?? undefined,
              competitionFights: linkedMember?.competition_fights ?? 0,
              competitionWins: linkedMember?.competition_wins ?? 0,
              competitionLosses: linkedMember?.competition_losses ?? 0,
              competitionDraws: linkedMember?.competition_draws ?? 0,
            }),
          })
          if (!competitionResp.ok) {
            throw new Error(await getErrorMessage(competitionResp, "Wettkämpferstatus konnte nicht gespeichert werden"))
          }
          setMemberHint(
            result.autoCreatedMemberId
              ? "Sportlerkonto wurde automatisch angelegt und verknüpft."
              : "Sportlerstatus wurde gespeichert."
          )
        }
      }

      alert("Trainerdaten gespeichert.")
      await loadTrainer()
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : "Fehler beim Speichern")
    } finally {
      setMemberActionLoading(false)
      setSaveLoading(false)
    }
  }

  if (!authResolved) return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  if (trainerRole !== "admin")
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Trainer bearbeiten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Nur im Admin-Modus.</div>
          <Button asChild className="rounded-2xl">
            <Link href="/verwaltung/trainer">Zur Trainerverwaltung</Link>
          </Button>
        </CardContent>
      </Card>
    )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trainerdaten bearbeiten</h1>
          <p className="mt-1 text-sm text-zinc-500">Pflichtfelder sind farblich hervorgehoben.</p>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/verwaltung/trainer">Zurück</Link>
        </Button>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Lädt...</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      ) : (
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className={sectionClassName}>
                <div className="mb-3 text-sm font-semibold text-zinc-900">Stammdaten</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Vorname *</Label>
                    <input className={emphasizedFieldClassName} value={firstName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Nachname *</Label>
                    <input className={emphasizedFieldClassName} value={lastName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLastName(e.target.value)} />
                  </div>
                  <div>
                    <Label>E-Mail *</Label>
                    <input className={emphasizedFieldClassName} value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label>Telefon</Label>
                    <input className={inputClassName} value={phone || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)} />
                  </div>
                  <div>
                    <Label>Stammgruppe (Anzeige)</Label>
                    <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 shadow-sm">{linkedMember?.base_group || trainer?.base_group || "—"}</div>
                  </div>
                  <div>
                    <Label>Rolle</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as "trainer" | "admin")}> 
                      <SelectTrigger className={inputClassName}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trainer">trainer</SelectItem>
                        <SelectItem value="admin">admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 text-sm font-semibold text-zinc-900">Sportlerstatus</div>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 text-sm text-zinc-800">
                        <input
                          type="checkbox"
                          checked={isSportler}
                          disabled={!email.trim() || memberActionLoading}
                          onChange={(event) => {
                            const checked = event.target.checked
                            setIsSportler(checked)
                            if (!checked) setIsWettkaempfer(false)
                          }}
                        />
                        <span>Ist Sportler</span>
                      </label>
                      <label className="flex items-center gap-3 text-sm text-zinc-800">
                        <input
                          type="checkbox"
                          checked={isWettkaempfer}
                          disabled={(!linkedMember && !email.trim()) || !isSportler || memberActionLoading}
                          onChange={(event) => setIsWettkaempfer(event.target.checked)}
                        />
                        <span>Ist Wettkämpfer</span>
                      </label>
                      <div className="text-xs text-zinc-500">
                        {memberHint}
                        {linkedMember ? ` Verknüpft: ${(linkedMember.first_name ?? "").trim()} ${(linkedMember.last_name ?? "").trim()}`.trim() || linkedMember.name || linkedMember.email || "—" : ""}
                      </div>
                      {isSportler && !linkedMember ? (
                        <div>
                          <Label>Geburtsdatum für neues Mitglied *</Label>
                          <input
                            className={emphasizedFieldClassName}
                            value={memberBirthdate}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMemberBirthdate(e.target.value)}
                            placeholder="31.12.2000"
                          />
                        </div>
                      ) : null}
                      {!linkedMember && email.trim() ? (
                        <div className="text-xs text-amber-700">
                          Beim Speichern wird automatisch ein neues Mitglied mit derselben E-Mail, demselben Passwort und dem hier eingetragenen Geburtsdatum angelegt und verknüpft.
                        </div>
                      ) : null}
                      {!linkedMember && !email.trim() ? (
                        <div className="text-xs text-amber-700">
                          Ohne E-Mail kann kein Sportlerkonto automatisch angelegt werden.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className={sectionClassName}>
                <div className="mb-3 text-sm font-semibold text-zinc-900">Lizenzdaten</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Label>DOSB-Lizenz</Label>
                    <Select value={license} onValueChange={(v) => setLicense(v)}>
                      <SelectTrigger className={inputClassName}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {trainerLicenseOptions.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Sonstige Lizenzart (frei)</Label>
                    <input className={inputClassName} value={lizenzArt} onChange={(e) => setLizenzArt(e.target.value)} />
                  </div>
                  <div>
                    <Label>Lizenznummer</Label>
                    <input className={inputClassName} value={lizenzNummer} onChange={(e) => setLizenzNummer(e.target.value)} />
                  </div>
                  <div>
                    <Label>Gültig bis (TT.MM.JJJJ)</Label>
                    <input className={inputClassName} value={lizenzGueltigBis} onChange={(e) => setLizenzGueltigBis(e.target.value)} placeholder="31.12.2026" />
                  </div>
                  <div>
                    <Label>Lizenzverband</Label>
                    <input className={inputClassName} value={lizenzVerband} onChange={(e) => setLizenzVerband(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Bemerkung</Label>
                    <textarea rows={3} className={inputClassName} value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Lizenzverlängerungen (eine pro Zeile, TT.MM.JJJJ)</Label>
                    <textarea rows={4} className={inputClassName} value={renewalsText} onChange={(e) => setRenewalsText(e.target.value)} placeholder={"31.12.2025\n31.12.2026"} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button className="rounded-2xl" onClick={() => void save()} disabled={saveLoading}>
                {saveLoading ? "Speichert..." : "Speichern"}
              </Button>
              <Button asChild variant="outline" className="rounded-2xl">
                <Link href="/verwaltung/trainer">Abbrechen</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
