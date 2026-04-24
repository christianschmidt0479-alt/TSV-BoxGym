"use client"

type Props = {
  data: any
  updateField: (field: string, value: string) => void
  onNext: () => void
  onBack: () => void
}


export default function Step2({ formData, setFormData, onNext }) {
  const isValid = !!(formData.birthdate && formData.gender);

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-8">
      <h1 className="text-3xl font-bold text-center">Wann bist du geboren?</h1>
      <input
        type="date"
        value={formData.birthdate}
        onChange={e => setFormData(f => ({ ...f, birthdate: e.target.value }))}
        className={`w-full h-16 rounded-2xl bg-gray-50 text-lg text-center focus:ring-2 focus:ring-blue-500 ${!formData.birthdate ? "ring-2 ring-red-300" : ""}`}
      />
      <div className="grid gap-4">
        <div
          className={`h-20 rounded-2xl flex items-center justify-center text-lg font-semibold transition cursor-pointer select-none ${formData.gender === "männlich" ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-700"}`}
          onClick={() => setFormData(f => ({ ...f, gender: "männlich" }))}
        >
          <span className="text-2xl mr-2">👨</span> Männlich
        </div>
        <div
          className={`h-20 rounded-2xl flex items-center justify-center text-lg font-semibold transition cursor-pointer select-none ${formData.gender === "weiblich" ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-700"}`}
          onClick={() => setFormData(f => ({ ...f, gender: "weiblich" }))}
        >
          <span className="text-2xl mr-2">👩</span> Weiblich
        </div>
      </div>
      <div className="fixed left-0 right-0 bottom-4 px-4">
        <button
          onClick={onNext}
          disabled={!isValid}
          className={`w-full h-16 rounded-2xl bg-blue-600 text-white text-lg font-semibold shadow-lg transition ${!isValid ? "bg-gray-300 opacity-50 cursor-not-allowed" : "active:scale-95"}`}
        >
          Weiter
        </button>
      </div>
    </div>
  )
}