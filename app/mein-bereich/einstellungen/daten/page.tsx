"use client"

import { useEffect, useState } from "react"

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

  if (!member) {
    return <p>Lade Daten...</p>
  }

  const fullName = member?.name || ""
  const nameParts = fullName.split(" ")
  const viewFirstName = nameParts[0] || ""
  const viewLastName = nameParts.slice(1).join(" ")

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center px-4 pt-10">
      <div className="w-full max-w-md space-y-4">

        <div className="bg-[#0f2a44] text-white rounded-xl p-5">
          <p className="text-lg font-semibold">
            {member?.name || "Mitglied"}
          </p>
          <p className="text-sm opacity-80">
            {member?.email}
          </p>
        </div>

        {message ? (
          <p className={`text-sm ${
            message.includes("fehlgeschlagen")
              ? "text-red-600"
              : "text-green-600"
          }`}>
            {message}
          </p>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {!editMode && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4 text-sm">

            <div>
              <p className="text-gray-500">Vorname</p>
              <p className="font-medium">{viewFirstName || "-"}</p>
            </div>

            <div>
              <p className="text-gray-500">Nachname</p>
              <p className="font-medium">{viewLastName || "-"}</p>
            </div>

            <div>
              <p className="text-gray-500">Telefon</p>
              <p className="font-medium">{member?.phone || "-"}</p>
            </div>

            <div>
              <p className="text-gray-500">Geburtsdatum</p>
              <p className="font-medium">
                {formatDate(member?.birthdate)}
              </p>
            </div>

            <div>
              <p className="text-gray-500">Gruppe</p>
              <p className="font-medium">{member?.group}</p>
            </div>

            <div>
              <p className="text-gray-500">Status</p>
              <p className="font-medium text-green-600">
                {member?.is_approved ? "Aktiv" : "Nicht freigegeben"}
              </p>
            </div>

            <button
              onClick={() => setEditMode(true)}
              className="mt-3 w-full bg-[#0f2a44] text-white py-2 rounded-md text-sm"
              type="button"
            >
              Bearbeiten
            </button>

          </div>
        )}

        {editMode && (
          <div className="bg-white border rounded-xl p-4 space-y-4">

            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full border px-3 py-2 rounded-md text-sm"
              placeholder="Vorname"
            />

            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full border px-3 py-2 rounded-md text-sm"
              placeholder="Nachname"
            />

            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border px-3 py-2 rounded-md text-sm"
              placeholder="Telefon"
            />

            <input
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              className="w-full border px-3 py-2 rounded-md text-sm"
            />

            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border px-3 py-2 rounded-md text-sm"
            />

            <p className="text-xs text-gray-500">
              Änderungen der E-Mail erfordern eine erneute Bestätigung.
            </p>

            <button
              className="w-full bg-[#0f2a44] text-white py-2 rounded-md text-sm disabled:opacity-60"
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "Speichert..." : "Speichern"}
            </button>

            <button
              onClick={() => setEditMode(false)}
              className="w-full border py-2 rounded-md text-sm"
              type="button"
            >
              Abbrechen
            </button>

          </div>
        )}

      </div>
    </div>
  )
}
