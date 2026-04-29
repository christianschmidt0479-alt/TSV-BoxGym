"use client"

import { useState } from "react"
import QRCode from "react-qr-code"

type MemberQrRevealClientProps = {
  qrToken: string
  isQrActive: boolean
}

export function MemberQrRevealClient({ qrToken, isQrActive }: MemberQrRevealClientProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-5">
      {!isQrActive ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          QR-Code aktuell deaktiviert.
        </div>
      ) : null}

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
        Bitte nicht weitergeben. Dieser QR-Code ist deinem Mitgliedskonto zugeordnet.
        Screenshots oder Weitergabe können zu Missbrauch führen.
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!visible ? (
          <button
            type="button"
            onClick={() => setVisible(true)}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Persönlichen QR anzeigen
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
          >
            QR wieder ausblenden
          </button>
        )}
      </div>

      {visible ? (
        <div className="mt-4 space-y-4">
          <div className="mx-auto w-fit rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <QRCode value={qrToken} size={210} />
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Bitte nicht weitergeben. Dieser QR-Code ist deinem Mitgliedskonto zugeordnet.
            Screenshots oder Weitergabe können zu Missbrauch führen.
          </div>

          <div className="rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600 break-all">
            Token: {qrToken}
          </div>
        </div>
      ) : null}
    </div>
  )
}
