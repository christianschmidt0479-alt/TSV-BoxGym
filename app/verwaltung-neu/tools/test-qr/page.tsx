import QRCode from "react-qr-code"

const TEST_MEMBERS = Array.from({ length: 10 }, (_, index) => {
  const number = index + 1
  const suffix = String(number).padStart(3, "0")
  const token = `TEST-${suffix}`

  return {
    id: number,
    token,
    qrValue: `TSVBOXGYM:MEMBER:${token}`,
    name: `Test Mitglied ${number}`,
    group: "Basic Ue18",
  }
})

export default function TestQrPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <h1 className="text-2xl font-bold text-zinc-900">Test-QR Generator</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Lokal generierte Testdaten. Keine Datenbank, keine Mitgliederanlage, kein Check-in.
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEST_MEMBERS.map((member) => (
            <article key={member.token} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-2">
                <QRCode value={member.qrValue} size={180} />
              </div>

              <div className="mt-3 space-y-1 text-sm text-zinc-800">
                <div className="font-semibold text-zinc-900">{member.name}</div>
                <div>Gruppe: {member.group}</div>
                <div className="break-all text-xs text-zinc-600">{member.qrValue}</div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
