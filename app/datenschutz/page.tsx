export default function DatenschutzPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 flex justify-center">
      <div className="w-full max-w-2xl bg-white rounded-xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Datenschutz</h1>

        <div className="text-sm text-gray-700 space-y-2">
          <p>
            <strong>Verantwortlicher:</strong>
            <br />
            TSV Falkensee e.V., Bereich Boxen
            <br />
            E-Mail: info@tsvboxgym.de
          </p>

          <p>
            <strong>Zweck der Datenverarbeitung:</strong>
            <br />
            Wir verarbeiten personenbezogene Daten nur, soweit dies für den Betrieb der Anwendung und die
            Organisation des Trainings erforderlich ist.
          </p>

          <p>
            <strong>Verarbeitete Daten:</strong>
            <br />
            Stammdaten wie Vorname, Nachname, Geburtsdatum, Geschlecht, Stammgruppe und Mitgliedsstatus,
            Kontaktdaten wie E-Mail-Adresse und Telefonnummer sowie Trainings- und Check-in-Daten.
          </p>

          <p>
            <strong>Speicherung:</strong>
            <br />
            Personenbezogene Daten speichern wir nur so lange, wie dies für die jeweiligen Zwecke erforderlich ist
            oder gesetzliche Aufbewahrungspflichten bestehen.
          </p>

          <p>
            <strong>Rechte der Nutzer:</strong>
            <br />
            Betroffene Personen haben nach den gesetzlichen Voraussetzungen insbesondere folgende Rechte:
            Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit, Widerspruch und
            Beschwerde bei einer Datenschutzaufsichtsbehörde.
          </p>
        </div>
      </div>
    </main>
  )
}