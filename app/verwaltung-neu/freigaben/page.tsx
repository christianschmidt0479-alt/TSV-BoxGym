


import { getPendingMembers } from "@/lib/boxgymDb";
import { handleApproveServer } from "./actions";
import Link from "next/link";




import FreigabenActions from "@/components/verwaltung-neu/FreigabenActions";

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default async function FreigabenPage() {
  let members: any[] = [];
  let error = null;
  try {
    members = await getPendingMembers();
  } catch (e) {
    error = e;
    members = [];
  }

  // Sortiere nach created_at DESC (neueste zuerst)
  const sortedMembers = [...members].sort((a, b) => {
    if (!a.created_at || !b.created_at) return 0;
    return b.created_at.localeCompare(a.created_at);
  });

  // Dynamischer Import, um Client-Komponente nur auf Client zu laden
  const FreigabenFilterClientWrapper = (await import("@/components/verwaltung-neu/FreigabenFilterClientWrapper")).default;

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-2">Freigaben</h1>
      <p className="text-zinc-600 mb-6">Mitgliedsanträge, die noch nicht freigegeben wurden.</p>

      {typeof error === "string" && error && (
        <div className="bg-red-100 text-red-700 px-4 py-2 rounded mb-4">Fehler beim Laden der Daten.</div>
      )}

      <FreigabenFilterClientWrapper members={sortedMembers} handleApproveServer={handleApproveServer} />
    </div>
  );
}
// Entfernt: Doppelte Default-Export-Komponente (Platzhalter)
