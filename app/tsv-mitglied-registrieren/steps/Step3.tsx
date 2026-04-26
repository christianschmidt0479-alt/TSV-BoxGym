"use client"

type Props = {
  data: any
  updateField: (field: string, value: any) => void
  onSubmit: () => void
  onBack: () => void
}

export default function Step3({ formData, setFormData, onSubmit, onBack }: { formData: any; setFormData: (value: any | ((prev: any) => any)) => void; onSubmit: () => void; onBack: () => void }) {
  const isValid = !!(formData.password && formData.email && formData.privacy);

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-8">
      <h1 className="text-3xl font-bold text-center">Zugang erstellen</h1>
      <input
        type="email"
        placeholder="E-Mail"
        value={formData.email}
        onChange={e => setFormData((f: any) => ({ ...f, email: e.target.value }))}
        className="h-16 w-full text-xl text-center rounded-2xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
      />
      <input
        type="password"
        placeholder="Passwort wählen"
        value={formData.password}
        onChange={e => setFormData((f: any) => ({ ...f, password: e.target.value }))}
        className="h-16 w-full text-xl text-center rounded-2xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div
        className={`p-4 rounded-2xl flex items-center gap-3 cursor-pointer select-none ${formData.privacy ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-700"}`}
        onClick={() => setFormData((f: any) => ({ ...f, privacy: !f.privacy }))}
      >
        <span className="text-2xl">{formData.privacy ? "☑" : "☐"}</span>
        Datenschutz akzeptieren
      </div>
      <div className="fixed left-0 right-0 bottom-4 px-4">
        <button
          onClick={isValid ? onSubmit : undefined}
          disabled={!isValid}
          className={`w-full h-16 rounded-2xl bg-blue-600 text-white text-lg font-semibold shadow-lg transition ${!isValid ? "bg-gray-300 opacity-50 cursor-not-allowed" : "active:scale-95"}`}
        >
          Jetzt starten
        </button>
      </div>
    </div>
  )
}
