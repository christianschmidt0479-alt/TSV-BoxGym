"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { needsWeight } from "@/lib/memberUtils"

type WeightMember = {
  id: string
  base_group: string | null
  is_wettkaempfer?: boolean
  weight?: string | null
}

export default function GewichtPage() {
  const [weight, setWeight] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [member, setMember] = useState<WeightMember | null>(null)
  const router = useRouter()

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("checkin-weight-member")
      if (!raw) return
      setMember(JSON.parse(raw) as WeightMember)
    } catch {
      setMember(null)
    }
  }, [])

  useEffect(() => {
    if (!member) return

    if (!needsWeight(member)) {
      router.push("/checkin/mitglied")
    }
  }, [member, router])

  const handleSave = async () => {
    if (!weight || !member?.id) return

    setLoading(true)
    setErrorMessage("")

    try {
      const response = await fetch("/api/member/update-weight", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memberId: member.id,
          weight: Number(weight),
        }),
      })

      if (!response.ok) {
        setErrorMessage("Gewicht konnte nicht gespeichert werden. Bitte erneut versuchen.")
        return
      }

      sessionStorage.removeItem("checkin-weight-member")
      router.push("/checkin/mitglied")
    } catch (e) {
      console.error("weight save error", e)
      setErrorMessage("Gewicht konnte nicht gespeichert werden. Bitte erneut versuchen.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-md">
        <Card className="rounded-[24px] border border-zinc-700 bg-zinc-900 text-white shadow-2xl">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-3xl font-black tracking-tight">Check-in erfolgreich</CardTitle>
            <p className="text-xl font-semibold text-zinc-100">Gewicht erfassen</p>
            <p className="text-sm text-zinc-300">Nur fuer Wettkaempfer und Leistungsgruppe erforderlich.</p>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2 text-left">
              <Label className="text-zinc-100">Aktuelles Gewicht in kg</Label>
              <Input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="z. B. 80"
                className="h-14 rounded-2xl border-zinc-700 bg-zinc-950 text-lg text-white"
              />
            </div>

            {errorMessage ? (
              <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-700">{errorMessage}</p>
            ) : null}

            <Button
              onClick={handleSave}
              disabled={loading}
              className="h-16 w-full rounded-2xl bg-[#154c83] text-xl font-semibold text-white hover:bg-[#123d69]"
            >
              {loading ? "Speichern..." : "Speichern & weiter"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
