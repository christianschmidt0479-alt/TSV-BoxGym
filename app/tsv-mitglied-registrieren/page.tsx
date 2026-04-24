"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { ErrorBox } from "@/components/ErrorBox"

export default function MitgliedRegistrierenPage() {
      const groupMap: Record<string, string> = {
        "10-14": "Basic 10 - 14 Jahre",
        "15-18": "Basic 15 - 18 Jahre",
        "Ü18": "Basic Ü18",
        "L-Gruppe": "L-Gruppe"
      }
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()

      // Pflichtfeld-Checks
      if (!form.phone) {
        setError("Telefonnummer ist Pflichtfeld")
        return
      }
      if (!form.group) {
        setError("Trainingsgruppe fehlt")
        return
      }
      if (!form.birthDate) {
        setError("Geburtsdatum fehlt")
        return
      }

      const formattedBirthDate = (() => {
        const parts = form.birthDate.split(".")
        if (parts.length !== 3) return form.birthDate
        return `${parts[2]}-${parts[1]}-${parts[0]}`
      })()

      try {
        const body = {
          firstName: form.firstName,
          lastName: form.lastName,
          birthDate: form.birthDate,
          gender: form.gender,
          email: form.email,
          password: form.password,
          phone: form.phone,
          baseGroup: groupMap[form.group],
          consent: true,
        }

        const res = await fetch("/api/public/member-register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        })

        const data = await res.json()

        if (!res.ok || !data.ok) {
          setError(data?.error || "Registrierung fehlgeschlagen")
          return
        }

        if (data?.mailSent === false) {
          setError("Registrierung gespeichert, aber die E-Mail konnte nicht gesendet werden.")
          return
        }

        alert("Registrierung erfolgreich! Bitte E-Mail bestätigen.")

      } catch (err) {
        const error = err as Error
        if (process.env.NODE_ENV !== "production") {
          console.error(error)
        }
        setError(error.message || "Fehler bei Registrierung")
      }
    }
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    birthDate: "",
    gender: "",
    email: "",
    password: "",
    group: "",
    phone: ""
  })
  const [error, setError] = useState("")

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center pt-16 px-4">
      <div className="w-full max-w-3xl">
        <Card className="rounded-[24px] border border-[#d8e3ee] bg-white shadow-sm p-8 space-y-6">
          <h2 className="text-lg font-semibold">Mitglied werden</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <ErrorBox message={error} />
            {/* Vorname + Nachname */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-medium text-zinc-900">Vorname</label>
                <input
                  required
                  type="text"
                  className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.firstName}
                  onChange={e => setForm({ ...form, firstName: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-900">Nachname</label>
                <input
                  required
                  type="text"
                  className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.lastName}
                  onChange={e => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
            </div>
            {/* restliche Felder unverändert */}
            <div>
              <label className="text-sm font-medium text-zinc-900">Geburtsdatum</label>
              <input
                required
                type="date"
                className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.birthDate}
                onChange={e => setForm({ ...form, birthDate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-900">Geschlecht</label>
              <select
                required
                className="mt-1 w-full h-12 rounded-xl border border-zinc-300 bg-white px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.gender}
                onChange={e => setForm({ ...form, gender: e.target.value })}
              >
                <option value="">Geschlecht wählen</option>
                <option value="männlich">Männlich</option>
                <option value="weiblich">Weiblich</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-900">E-Mail</label>
              <input
                required
                type="email"
                className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-900">
                Telefonnummer *
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Telefonnummer"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-900">Passwort</label>
              <input
                required
                type="password"
                className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-900">Trainingsgruppe</label>
              <select
                required
                className="mt-1 w-full h-12 rounded-xl border border-zinc-300 bg-white px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.group}
                onChange={e => setForm({ ...form, group: e.target.value })}
              >
                <option value="">Gruppe wählen</option>
                <option value="10-14">10–14</option>
                <option value="15-18">15–18</option>
                <option value="Ü18">Ü18</option>
                <option value="L-Gruppe">L-Gruppe</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full h-12 rounded-xl bg-[#154c83] hover:bg-[#123d69] transition text-white font-medium"
            >
              Mitglied werden
            </button>
          </form>
        </Card>
      </div>
    </div>
  )
}
