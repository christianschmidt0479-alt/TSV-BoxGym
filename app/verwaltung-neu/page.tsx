import { getPendingMembers, getAllMembers } from "@/lib/boxgymDb";
import Link from "next/link";


export default async function DashboardPage() {
  let pending = [];
  let members = [];
  let error: unknown = null;
  try {
    pending = await getPendingMembers();
    members = await getAllMembers();
  } catch (e) {
    error = e;
  }

  let errorMessage: string | null = null;
  if (error instanceof Error) errorMessage = error.message;
  else if (typeof error === "string") errorMessage = error;
  else if (error) errorMessage = "Unbekannter Fehler";

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-2">Verwaltung</h1>
      <p className="text-zinc-600 mb-6">Reduzierte Startseite für den neuen Adminbereich. Fokus auf aktuelle Kernaufgaben.</p>

      {errorMessage && (
        <div className="bg-red-100 text-red-700 px-4 py-2 rounded mb-4">
          Fehler beim Laden der Kennzahlen: {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 flex flex-col items-start">
          <div className="text-xs text-zinc-500 mb-1">Offene Freigaben</div>
          <div className="text-3xl font-bold text-[#154c83] mb-2">{pending.length}</div>
          <Link href="/verwaltung-neu/freigaben" className="text-sm text-[#154c83] hover:underline font-medium">Zu den Freigaben</Link>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 flex flex-col items-start">
          <div className="text-xs text-zinc-500 mb-1">Mitglieder insgesamt</div>
          <div className="text-3xl font-bold text-[#154c83] mb-2">{members.length}</div>
          <Link href="/verwaltung-neu/mitglieder" className="text-sm text-[#154c83] hover:underline font-medium">Zu den Mitgliedern</Link>
        </div>
      </div>

      <div className="mt-8">
        <Link href="/verwaltung-neu/loeschantraege" className="text-sm text-[#154c83] underline font-medium">Offene Mitglieder-Löschanträge anzeigen</Link>
      </div>
    </div>
  );
}
