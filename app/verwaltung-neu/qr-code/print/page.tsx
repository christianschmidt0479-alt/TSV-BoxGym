"use client"

import QRCode from "react-qr-code"

export default function QRPrintPage() {
  const url = "https://www.tsvboxgym.de/checkin"

  return (
    <div className="relative w-full min-h-screen flex justify-center items-start bg-white p-6 print:p-0">

      {/* PRINT BUTTON */}
      <div className="absolute top-6 right-6 print:hidden">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-[#0f2a44] text-white rounded-md text-sm"
        >
          Drucken
        </button>
      </div>

      <div className="w-full max-w-[794px] h-[1123px] flex flex-col items-center justify-between text-center">

        {/* LOGO + TITEL */}
        <div className="mt-10 flex flex-col items-center">
          <img src="/logo.png" alt="TSV BoxGym" className="h-32 mb-8" />
          <h1 className="text-4xl font-bold tracking-wide mb-4">CHECK-IN</h1>
        </div>

        {/* QR CODE */}
        <div className="flex flex-col items-center">
          <QRCode value={url} size={300} />
          <p className="mt-8 text-xl font-semibold">QR-Code scannen</p>
        </div>

        {/* TRENNUNG */}
        <p className="my-8 text-2xl font-bold text-gray-500">ODER</p>

        {/* NFC */}
        <div className="mb-12 flex flex-col items-center">
          <svg
            width="140"
            height="140"
            viewBox="0 0 24 24"
            fill="none"
            className="mb-4"
          >
            <circle cx="6" cy="12" r="2" fill="#0f2a44" />
            <path d="M10 8C12 10 12 14 10 16" stroke="#0f2a44" strokeWidth="2" strokeLinecap="round"/>
            <path d="M13 6C16 9 16 15 13 18" stroke="#0f2a44" strokeWidth="2" strokeLinecap="round"/>
            <path d="M16 4C20 8 20 16 16 20" stroke="#0f2a44" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p className="text-2xl font-bold">Handy hier halten</p>
          <p className="text-sm text-gray-500 mt-2">(NFC)</p>
        </div>

      </div>

      <style jsx global>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
        }
      `}</style>

    </div>
  )
}
