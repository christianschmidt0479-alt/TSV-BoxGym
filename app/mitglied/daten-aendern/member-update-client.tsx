"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"

type EditableMemberProfile = {
  id: string
  firstName: string
  lastName: string
  birthdate: string
  email: string
  phone: string
  baseGroup: string
  guardianName: string
}

export function MemberUpdateClient({ token }: { token: string }) {
  const [checking, setChecking] = useState(true)
  const [unlocking, setUnlocking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [invalidMessage, setInvalidMessage] = useState("")
  const [password, setPassword] = useState("")
  const [member, setMember] = useState<EditableMemberProfile | null>(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [birthdate, setBirthdate] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [baseGroup, setBaseGroup] = useState("")
  const [guardianName, setGuardianName] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    async function checkToken() {
      try {
        setChecking(true)
        setInvalidMessage("")
        setError("")

        if (!token) {
          throw new Error("Link ungültig oder abgelaufen")
        }

        const response = await fetch(`/api/member/update-link?token=${encodeURIComponent(token)}`)
        const payload = (await response.json()) as { valid?: boolean; message?: string }

        if (cancelled) return

        if (!response.ok || !payload.valid) {
          setInvalidMessage(payload.message || "Link ungültig oder abgelaufen")
          return
        }
      } catch (nextError) {
        if (cancelled) return
        setInvalidMessage(nextError instanceof Error ? nextError.message : "Link ungültig oder abgelaufen")
      } finally {
        if (!cancelled) {
          setChecking(false)
        }
      }
    }

    void checkToken()

    return () => {
      cancelled = true
    }
  }, [token])

  async function unlockForm() {
    try {
      setUnlocking(true)
      setError("")
      setMessage("")

      const response = await fetch("/api/member/update-link", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })

      const payload = (await response.json()) as { ok?: boolean; error?: string; member?: EditableMemberProfile }
      if (!response.ok || !payload.ok || !payload.member) {
        throw new Error(payload.error || "Passwortprüfung fehlgeschlagen.")
      }

      setMember(payload.member)
      setFirstName(payload.member.firstName)
      setLastName(payload.member.lastName)
      setBirthdate(payload.member.birthdate)
      setEmail(payload.member.email)
      setPhone(payload.member.phone)
      setBaseGroup(payload.member.baseGroup)
      setGuardianName(payload.member.guardianName)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Passwortprüfung fehlgeschlagen.")
    } finally {
      setUnlocking(false)
    }
  }

  async function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setSaving(true)
      setError("")
      setMessage("")

      const response = await fetch("/api/member/update-link", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
          firstName,
          lastName,
          birthdate,
          phone,
          baseGroup,
          guardianName,
        }),
      })

      const payload = (await response.json()) as { ok?: boolean; error?: string; member?: EditableMemberProfile }
      if (!response.ok || !payload.ok || !payload.member) {
        throw new Error(payload.error || "Speichern fehlgeschlagen.")
      }

      setMember(payload.member)
      setFirstName(payload.member.firstName)
      setLastName(payload.member.lastName)
      setBirthdate(payload.member.birthdate)
      setEmail(payload.member.email)
      setPhone(payload.member.phone)
      setBaseGroup(payload.member.baseGroup)
      setGuardianName(payload.member.guardianName)
      setMessage("Daten gespeichert. Der Link wurde damit verbraucht.")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Speichern fehlgeschlagen.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-3xl items-start px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Mitgliedsdaten ändern</h1>
          <p className="text-sm text-zinc-600">Der Link ist nur einmal gültig. Vor dem Bearbeiten ist eine Passwortbestätigung erforderlich.</p>
        </div>

        {checking ? (
          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardContent className="py-6 text-sm text-zinc-500">Link wird geprüft...</CardContent>
          </Card>
        ) : invalidMessage ? (
          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardContent className="py-6 text-sm text-red-700">{invalidMessage}</CardContent>
          </Card>
        ) : member ? (
          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Daten prüfen und korrigieren</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
              {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}

              <form className="space-y-4" onSubmit={(event) => void saveForm(event)}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Vorname</Label>
                    <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} className="rounded-2xl" disabled={saving || Boolean(message)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Nachname</Label>
                    <Input value={lastName} onChange={(event) => setLastName(event.target.value)} className="rounded-2xl" disabled={saving || Boolean(message)} />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Geburtsdatum</Label>
                    <Input type="date" value={birthdate} onChange={(event) => setBirthdate(event.target.value)} className="rounded-2xl" disabled={saving || Boolean(message)} />
                  </div>
                  <div className="space-y-2">
                    <Label>E-Mail</Label>
                    <Input type="email" value={email} readOnly className="rounded-2xl bg-zinc-50 text-zinc-500" />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Telefon</Label>
                    <Input value={phone} onChange={(event) => setPhone(event.target.value)} className="rounded-2xl" disabled={saving || Boolean(message)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Stammgruppe</Label>
                    <Input value={baseGroup} onChange={(event) => setBaseGroup(event.target.value)} className="rounded-2xl" disabled={saving || Boolean(message)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Weitere Angaben / Kontakt</Label>
                  <Input value={guardianName} onChange={(event) => setGuardianName(event.target.value)} className="rounded-2xl" disabled={saving || Boolean(message)} />
                </div>

                <Button type="submit" className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]" disabled={saving || Boolean(message)}>
                  {saving ? "Speichert..." : "Daten speichern"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Passwort bestätigen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
              <div className="space-y-2">
                <Label>Passwort</Label>
                <PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Passwort eingeben" className="rounded-2xl" />
              </div>
              <Button type="button" className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]" disabled={unlocking || !password.trim()} onClick={() => void unlockForm()}>
                {unlocking ? "Prüft..." : "Formular freischalten"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}