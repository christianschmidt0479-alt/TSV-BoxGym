"use client";
import { useState } from "react";
import ScanResultList from "./ScanResultList";
import StatusIndicator from "./StatusIndicator";
export default function ScannerView() {
  // Platzhalter für Scanner-Logik
  // TODO: Kamera/Barcode-Scanner integrieren
  const [results, setResults] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("bereit");
  return (
    <div className="max-w-xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">Mitglieder-QR-Scanner</h1>
      <StatusIndicator status={status} />
      {/* Scanner-UI und Kamera-Integration folgt */}
      <ScanResultList results={results} />
    </div>
  );
}
