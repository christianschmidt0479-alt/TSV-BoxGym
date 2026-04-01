"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import React from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { trainerLicenseOptions } from "@/lib/trainerLicense"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

function normalizeRenewalsText(text: string) {
  return text
    .split(/\n|,/) // allow newline or comma separated
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export default function TrainerBearbeitenPage() {
  const params = useParams()
  const trainerId = (params?.trainerId as string) || ""
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()

  const [loading, setLoading] = useState(true)
  const [saveLoading, setSaveLoading] = useState(false)
  const [error, setError] = useState("")
  const [trainer, setTrainer] = useState<any | null>(null)
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

  async function loadTrainer() {
    setLoading(true)
    try {
      setError("")
      const response = await fetch("/api/admin/person-roles", { cache: "no-store" })
      if (!response.ok) throw new Error("Trainerdaten konnten nicht geladen werden.")
      const payload = await response.json()
      const trainers: any[] = Array.isArray(payload.trainers) ? payload.trainers : []
      const found = trainers.find((t) => t.id === trainerId) || null
      if (!found) throw new Error("Trainer nicht gefunden")
      setTrainer(found)
      setFirstName(found.first_name ?? "")
      setLastName(found.last_name ?? "")
      setEmail(found.email ?? "")
      setPhone(found.phone ?? "")
      setLicense(found.trainer_license ?? trainerLicenseOptions[0])
      setRenewalsText(Array.isArray(found.trainer_license_renewals) ? (found.trainer_license_renewals || []).join("\n") : "")
      setRole(found.role === "admin" ? "admin" : "trainer")
      setLizenzArt(found.lizenzart ?? "")
      setLizenzNummer(found.lizenznummer ?? "")
      setLizenzGueltigBis(found.lizenz_gueltig_bis ?? "")
      setLizenzVerband(found.lizenz_verband ?? "")
      setBemerkung(found.bemerkung ?? "")
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : "Fehler beim Laden")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }
    if (trainerId) void loadTrainer()
  }, [authResolved, trainerRole, trainerId])

  async function save() {
    setSaveLoading(true)
    try {
      setError("")
      const response = await fetch(`/api/admin/trainer-account/${trainerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          trainerLicense: license,
          trainerLicenseRenewals: normalizeRenewalsText(renewalsText),
          lizenzart: lizenzArt || null,
          lizenznummer: lizenzNummer || null,
          lizenz_gueltig_bis: lizenzGueltigBis || null,
          lizenz_verband: lizenzVerband || null,
          bemerkung: bemerkung || null,
        }),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || "Speichern fehlgeschlagen")
      }

      // update role if changed
      if ((trainer?.role || "trainer") !== role) {
        const roleResp = await fetch(`/api/admin/person-roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set_trainer_role", trainerId, role }),
        })
        if (!roleResp.ok) {
          const text = await roleResp.text()
          throw new Error(text || "Rollenänderung fehlgeschlagen")
        }
      }

      alert("Trainerdaten gespeichert.")
      await loadTrainer()
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : "Fehler beim Speichern")
    } finally {
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
        <h1 className="text-2xl font-bold">Trainerdaten bearbeiten</h1>
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
              <div>
                <Label>Vorname</Label>
                <input className="rounded-2xl border-zinc-300 bg-white text-zinc-900 w-full p-2" value={firstName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstName(e.target.value)} />
              </div>
              <div>
                <Label>Nachname</Label>
                <input className="rounded-2xl border-zinc-300 bg-white text-zinc-900 w-full p-2" value={lastName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLastName(e.target.value)} />
              </div>
              <div>
                <Label>E-Mail</Label>
                <input className="rounded-2xl border-zinc-300 bg-white text-zinc-900 w-full p-2" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label>Telefon</Label>
                <input className="rounded-2xl border-zinc-300 bg-white text-zinc-900 w-full p-2" value={phone || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)} />
              </div>

              <div>
                <Label>Stammgruppe (Anzeige)</Label>
                <div className="text-sm text-zinc-600">{trainer?.base_group || "—"}</div>
              </div>
              <div>
                <Label>Rolle</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "trainer" | "admin")}> 
                  <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trainer">trainer</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label>Lizenz</Label>
                <Select value={license} onValueChange={(v) => setLicense(v)}>
                  <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
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
                <Label>Lizenzart (frei)</Label>
                <input className="rounded-2xl border-zinc-300 bg-white text-zinc-900 w-full p-2" value={lizenzArt} onChange={(e) => setLizenzArt(e.target.value)} />
              </div>
              <div>
                <Label>Lizenznummer</Label>
                <input className="rounded-2xl border-zinc-300 bg-white text-zinc-900 w-full p-2" value={lizenzNummer} onChange={(e) => setLizenzNummer(e.target.value)} />
              </div>
              <div>
                <Label>Gültig bis (JJJJ-MM-TT)</Label>
                <input className="rounded-2xl border-zinc-300 bg-white text-zinc-900 w-full p-2" value={lizenzGueltigBis} onChange={(e) => setLizenzGueltigBis(e.target.value)} />
              </div>
              <div>
                <Label>Lizenzverband</Label>
                <input className="rounded-2xl border-zinc-300 bg-white text-zinc-900 w-full p-2" value={lizenzVerband} onChange={(e) => setLizenzVerband(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Bemerkung</Label>
                <textarea rows={3} className="w-full rounded-2xl border-zinc-300 p-3" value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} />
              </div>

              <div className="md:col-span-2">
                <Label>Lizenzverlängerungen (eine pro Zeile, JJJJ-MM-TT)</Label>
                <textarea rows={4} className="w-full rounded-2xl border-zinc-300 p-3" value={renewalsText} onChange={(e) => setRenewalsText(e.target.value)} />
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
