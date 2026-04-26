"use client"

import Link from "next/link"
import QRCode from "react-qr-code"

export default function QRCodePage() {
  const checkinUrl = "https://www.tsvboxgym.de/checkin"
  const registrationUrl = "https://www.tsvboxgym.de/checkin/beitritt"
  const trialUrl = "https://www.tsvboxgym.de/checkin/beitritt?type=trial"

  return (
    <>
      <div className="min-h-screen flex justify-center items-start bg-white p-6">
        <div className="w-full max-w-xl mx-auto">
          {/* CHECK-IN */}
          <div className="bg-white p-8 border border-gray-200 rounded-xl text-center">
            <h1 className="text-xl font-semibold mb-6">TSV BoxGym Check-in</h1>

            <div className="flex justify-center mb-6">
              <QRCode value={checkinUrl} size={220} />
            </div>

            <div className="text-sm text-gray-700 space-y-2">
              <p>Bitte QR-Code scannen, um sich einzuchecken.</p>
              <p>Alternativ kann auch der NFC-Punkt verwendet werden.</p>
            </div>

            <div className="mt-4 text-xs text-gray-500">
              <p>NFC-Punkt befindet sich am Eingang.</p>
            </div>

            <div className="mt-6">
              <Link href="/verwaltung-neu/qr-code/print" target="_blank">
                <button className="mt-4 px-4 py-2 bg-[#0f2a44] text-white rounded-md">
                  Druckversion öffnen
                </button>
              </Link>
            </div>
          </div>

          {/* REGISTRIERUNG + PROBEMITGLIED */}
          <div className="mt-10 space-y-8">

            {/* REGISTRIERUNG */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
              <h2 className="text-lg font-semibold mb-4">Registrierung</h2>
              <QRCode value={registrationUrl} size={180} />
              <p className="mt-3 text-sm text-gray-600">Neues Mitglied registrieren</p>
            </div>

            {/* PROBEMITGLIED */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
              <h2 className="text-lg font-semibold mb-4">Probemitglied</h2>
              <QRCode value={trialUrl} size={180} />
              <p className="mt-3 text-sm text-gray-600">Probetraining starten</p>
            </div>

          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body {
            margin: 0;
          }
        }
      `}</style>
    </>
  )
}
