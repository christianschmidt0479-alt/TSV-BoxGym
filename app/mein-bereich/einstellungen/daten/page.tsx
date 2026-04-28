"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { FormContainer } from "@/components/ui/form-container"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type MemberView = {
  name: string
  email: string
  phone: string
  birthdate: string
  group: string
  is_approved: boolean
}

export default function DatenPage() {
  const [member, setMember] = useState<MemberView | null>(null)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [birthdate, setBirthdate] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "-"
    const d = new Date(date)
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  useEffect(() => {
    let active = true

    async function loadMember() {
      try {
        setError(null)

        const response = await fetch("/api/public/member-area", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "member_session" }),
        })

        const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
        console.log("API RESPONSE FULL:", JSON.stringify(data, null, 2))

        if (response.status === 401) {
          window.location.href = "/mein-bereich/login?reason=session_expired"
          return
        }

        const topLevelMember = data?.member as Record<string, unknown> | undefined
        const resolvedMember =
          (topLevelMember?.member as Record<string, unknown> | undefined) ||
          topLevelMember ||
          (data?.user as Record<string, unknown> | undefined) ||
          (data?.data as Record<string, unknown> | undefined) ||
          data

        if (!resolvedMember || typeof resolvedMember !== "object") {
          throw new Error("Mitgliedsdaten konnten nicht geladen werden.")
        }

        const raw = resolvedMember
        const fullName = `${typeof raw.first_name === "string" ? raw.first_name : ""} ${typeof raw.last_name === "string" ? raw.last_name : ""}`.trim()

        const nextMember: MemberView = {
          name: (typeof raw.name === "string" ? raw.name : fullName) || "-",
          email: (typeof raw.email === "string" ? raw.email : "-") || "-",
          phone: (typeof raw.phone === "string" ? raw.phone : "-") || "-",
          birthdate:
            (typeof raw.birthdate === "string"
              ? raw.birthdate
              : typeof raw.date_of_birth === "string"
                ? raw.date_of_birth
                : typeof raw.dob === "string"
                  ? raw.dob
                  : "") || "",
          group: (typeof raw.group === "string" ? raw.group : typeof raw.base_group === "string" ? raw.base_group : "-") || "-",
          is_approved: Boolean(raw.is_approved),
        }

        if (!active) return

        setMember(nextMember)
        setPhone(nextMember.phone === "-" ? "" : nextMember.phone)
        setBirthdate(nextMember.birthdate || "")
        setEmail(nextMember.email === "-" ? "" : nextMember.email)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : "Mitgliedsdaten konnten nicht geladen werden.")
      }
    }

    void loadMember()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    console.log("MEMBER:", member)
  }, [member])

  useEffect(() => {
    if (member?.name) {
      const parts = member.name.split(" ")
      setFirstName(parts[0] || "")
      setLastName(parts.slice(1).join(" ") || "")
      return
    }

    setFirstName("")
    setLastName("")
  }, [member])

  async function handleSave() {
    if (!member) return

    try {
      setSaving(true)
      setMessage(null)
      setError(null)

      const name = `${firstName} ${lastName}`.trim()
      const trimmedPhone = phone.trim()
      const trimmedEmail = email.trim().toLowerCase()
      const currentEmail = member.email.trim().toLowerCase()

      if (trimmedEmail && trimmedEmail !== currentEmail) {
        const emailResponse = await fetch("/api/member/request-email-change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail }),
        })

        if (!emailResponse.ok) {
          throw new Error("E-Mail-Änderung konnte nicht angefragt werden.")
        }
      }

      const res = await fetch("/api/member/update-profile", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone: trimmedPhone,
          birthdate,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        console.error("SAVE ERROR:", result)
        setMessage("Speichern fehlgeschlagen")
        return
      }

      setMember({
        ...member,
        name: name || "-",
        phone: trimmedPhone || "-",
        birthdate: birthdate || "",
        email: trimmedEmail || member.email,
      })
      setEditMode(false)
      setMessage(
        trimmedEmail && trimmedEmail !== currentEmail
          ? "Gespeichert. Bitte bestätige deine neue E-Mail-Adresse."
          : "Gespeichert."
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.")
    } finally {
      setSaving(false)
    }
  }

  const fullName = member?.name || ""
  const nameParts = fullName.split(" ")
  const viewFirstName = nameParts[0] || ""
  const viewLastName = nameParts.slice(1).join(" ")

  if (!member) {
    return (
      <FormContainer title="Meine Daten" description="Lade Daten...">
        <div className="py-4 text-sm text-zinc-500">Bitte warten...</div>
      </FormContainer>
    )
  }

  return (
    <FormContainer
      title="Meine Daten"
      description={`${member.name || "Mitglied"} · ${member.email}`}
      headerSlot={
        <div className="flex items-center justify-end">
          <Link
            href="/mein-bereich/einstellungen"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:border-zinc-400"
          >
            Zurück
          </Link>
        </div>
      }
    >
      <div className="space-y-4">
        {message ? (
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              message.includes("fehlgeschlagen")
                ? "border border-red-200 bg-red-50 text-red-700"
                : "border border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {!editMode ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 space-y-3 text-sm">
              <div>
                <p className="text-zinc-500">Vorname</p>
                <p className="font-medium text-zinc-900">{viewFirstName || "-"}</p>
              </div>
              <div>
                <p className="text-zinc-500">Nachname</p>
                <p className="font-medium text-zinc-900">{viewLastName || "-"}</p>
              </div>
              <div>
                <p className="text-zinc-500">Telefon</p>
                <p className="font-medium text-zinc-900">{member.phone || "-"}</p>
              </div>
              <div>
                <p className="text-zinc-500">Geburtsdatum</p>
                <p className="font-medium text-zinc-900">{formatDate(member.birthdate)}</p>
              </div>
              <div>
                <p className="text-zinc-500">Gruppe</p>
                <p className="font-medium text-zinc-900">{member.group}</p>
              </div>
              <div>
                <p className="text-zinc-500">Status</p>
                <p className={`font-medium ${member.is_approved ? "text-emerald-700" : "text-amber-700"}`}>
                  {member.is_approved ? "Aktiv" : "Nicht freigegeben"}
                </p>
              </div>
            </div>
            <Button type="button" className="w-full" onClick={() => setEditMode(true)}>
              Bearbeiten
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Vorname</label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Vorname" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Nachname</label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nachname" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Telefon</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Geburtsdatum</label>
              <Input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">E-Mail</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              <p className="text-xs text-zinc-500">Änderungen der E-Mail erfordern eine erneute Bestätigung.</p>
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "Speichert..." : "Speichern"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setEditMode(false)}
            >
              Abbrechen
            </Button>
          </div>
        )}
      </div>
    </FormContainer>
  )
}
