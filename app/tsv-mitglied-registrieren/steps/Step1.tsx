"use client"

type Props = {
  data: any
  updateField: (field: string, value: string) => void
  onNext: () => void
}

import { useState } from "react"

export default function Step1({ formData, setFormData, onNext }) {
  const [showLastName, setShowLastName] = useState(false)

  const handleFirstName = () => {
    if (formData.firstName) setShowLastName(true)
  }

  const handleLastName = () => {
    if (formData.lastName) onNext()
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-8">
      <h1 className="text-3xl font-bold text-center">Wie heißt du?</h1>
      {!showLastName ? (
        <>
          <input
            autoFocus
            placeholder="Vorname"
            value={formData.firstName}
            onChange={e => setFormData(f => ({ ...f, firstName: e.target.value }))}
            className="h-16 w-full text-xl text-center rounded-2xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleFirstName}
            disabled={!formData.firstName}
            className={`w-full h-16 bg-blue-600 text-white rounded-2xl mt-4 shadow-lg text-lg font-semibold transition ${!formData.firstName ? "bg-gray-300 opacity-50 cursor-not-allowed" : "active:scale-95"}`}
          >
            Weiter
          </button>
        </>
      ) : (
        <>
          <input
            autoFocus
            placeholder="Nachname"
            value={formData.lastName}
            onChange={e => setFormData(f => ({ ...f, lastName: e.target.value }))}
            className="h-16 w-full text-xl text-center rounded-2xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleLastName}
            disabled={!formData.lastName}
            className={`w-full h-16 bg-blue-600 text-white rounded-2xl mt-4 shadow-lg text-lg font-semibold transition ${!formData.lastName ? "bg-gray-300 opacity-50 cursor-not-allowed" : "active:scale-95"}`}
          >
            Weiter
          </button>
        </>
      )}
    </div>
  )
}
