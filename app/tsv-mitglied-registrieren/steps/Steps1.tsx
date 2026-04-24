"use client"

import { useState } from "react"

import { PrimaryButton } from "@/components/ui/PrimaryButton"

import { Card } from "@/components/ui/Card"

export default function RegisterStep1({ onNext }: { onNext: (data: any) => void }) {

  const [firstName, setFirstName] = useState("")

  const [lastName, setLastName] = useState("")

  const [error, setError] = useState("")

  function handleNext() {

    if (!firstName || !lastName) {

      setError("Bitte Vor- und Nachname eingeben")

      return

    }

    setError("")

    onNext({ firstName, lastName })

  }

  return (

    <div className="max-w-md mx-auto px-4 py-4 space-y-6">

      {/* Progress */}

      <div className="space-y-2">

        <div className="text-sm text-gray-500">Schritt 1 von 5</div>

        <div className="w-full h-2 bg-gray-200 rounded-full">

          <div className="h-2 bg-blue-600 rounded-full w-[20%]" />

        </div>

      </div>

      {/* Headline */}

      <div className="space-y-1">

        <h1 className="text-2xl font-semibold">

          Wie heißt du?

        </h1>

        <p className="text-gray-500 text-sm">

          Wir starten mit deinem Namen

        </p>

      </div>

      {/* Input Card */}

      <Card>

        <div className="space-y-4">

          <input

            type="text"

            placeholder="Vorname"

            value={firstName}

            onChange={(e) => setFirstName(e.target.value)}

            className="w-full h-14 px-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"

          />

          <input

            type="text"

            placeholder="Nachname"

            value={lastName}

            onChange={(e) => setLastName(e.target.value)}

            className="w-full h-14 px-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"

          />

        </div>

      </Card>

      {/* Error */}

      {error && (

        <div className="text-red-600 text-sm">

          {error}

        </div>

      )}

      {/* Sticky Button */}

      <div className="fixed bottom-16 left-0 right-0 bg-white border-t p-4">

        <PrimaryButton onClick={handleNext}>

          Weiter

        </PrimaryButton>

      </div>

    </div>

  )

}