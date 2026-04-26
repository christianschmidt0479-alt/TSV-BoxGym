export default function ImpressumPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 flex justify-center">
      <div className="w-full max-w-2xl bg-white rounded-xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Impressum</h1>

        <div className="text-sm text-gray-700 space-y-2">
          <p>
            <strong>Verein:</strong>
            <br />
            TSV Falkensee e.V., Bereich Boxen
          </p>

          <p>
            <strong>Adresse:</strong>
            <br />
            Vereinsangaben und Postanschrift: offizielles Vereinsimpressum unter
            {" "}
            <a className="underline hover:no-underline" href="https://tsv-falkensee.de/impressum" target="_blank" rel="noopener noreferrer">
              https://tsv-falkensee.de/impressum
            </a>
          </p>

          <p>
            <strong>Vertretungsberechtigter:</strong>
            <br />
            Siehe offizielles Vereinsimpressum des TSV Falkensee e.V.
          </p>

          <p>
            <strong>Kontakt:</strong>
            <br />
            E-Mail: info@tsvboxgym.de
          </p>

          <p>
            <strong>Register:</strong>
            <br />
            Angaben zum Vereinsregister siehe offizielles Vereinsimpressum.
          </p>
        </div>
      </div>
    </main>
  )
}