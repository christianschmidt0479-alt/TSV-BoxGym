import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPendingMembers, getAllMembers } from "@/lib/boxgymDb";
import Card from "@/components/Card"
import { container, title, card } from "@/components/ui";


export default async function DashboardPage() {
  const cookieStore = await cookies()
  const session = cookieStore.get("trainer_session")

  if (!session) {
    redirect("/trainer-zugang")
  }

  let pending = [];
  let members = [];
  let error: unknown = null;
  try {
    pending = await getPendingMembers();
    members = await getAllMembers();
  } catch (e) {
    error = e;
  }

  if (error) {
    throw new Error(`Fehler beim Laden der Admin-Daten: ${error instanceof Error ? error.message : String(error)}`);
  }

  const cardStyle = {
    background: "#fff",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
    cursor: "pointer",
    transition: "0.15s ease",
    marginBottom: 8,
  }

  const infoTitle = {
    fontSize: 14,
    color: "#666",
  }

  const infoValue = {
    fontSize: 22,
    fontWeight: 600,
    margin: "6px 0",
  }

  return (
    <div style={container}>
      {/* Nur Content, keine eigene Navigation oder Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        <Card
          href="/verwaltung-neu/mitglieder"
          title="Mitglieder"
          subtitle="Verwalten & bearbeiten"
          icon="👥"
        />
        <Card
          href="/verwaltung-neu/freigaben"
          title="Freigaben"
          subtitle="Offene Anfragen prüfen"
          icon="✅"
        />
        <Card
          href="/verwaltung-neu/mail"
          title="Kommunikation"
          subtitle="E-Mails & Nachrichten"
          icon="✉️"
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 14, color: "#666" }}>Offene Freigaben</div>
          <div style={{ fontSize: 22, fontWeight: 600, margin: "6px 0" }}>{pending.length}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 14, color: "#666" }}>Mitglieder gesamt</div>
          <div style={{ fontSize: 22, fontWeight: 600, margin: "6px 0" }}>{members.length}</div>
        </div>
      </div>
    </div>
  );

}
