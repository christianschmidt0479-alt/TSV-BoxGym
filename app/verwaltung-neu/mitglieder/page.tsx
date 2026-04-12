import { getAllMembers } from "@/lib/boxgymDb";
import MitgliederFilterClientWrapper from "@/components/verwaltung-neu/MitgliederFilterClientWrapper";

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default async function MitgliederPage() {
  let members: any[] = [];
  let error = null;
  try {
    members = await getAllMembers();
  } catch (e) {
    error = e;
    members = [];
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Mitglieder</h1>
      <p className="text-zinc-600 mb-6">Alle aktiven Mitglieder im System. Übersicht ohne Bearbeitungsfunktionen.</p>
      {typeof error === "string" && error && (
        <div className="bg-red-100 text-red-700 px-4 py-2 rounded mb-4">Fehler beim Laden der Mitglieder.</div>
      )}
      <MitgliederFilterClientWrapper members={members} />
    </div>
  );
}
