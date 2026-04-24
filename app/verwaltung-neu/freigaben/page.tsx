
import { container, pageTitle, card, cardTitle, cardRow, buttonPrimary } from "@/lib/ui";
import { getPendingMembers } from "@/lib/boxgymDb";

export default async function FreigabenPage() {
  const members = await getPendingMembers();

  return (
    <div style={container}>
      <div style={pageTitle}>Freigaben</div>
      {members.length === 0 && (
        <p>Keine offenen Freigaben</p>
      )}
      {members.map((m) => (
        <div key={m.id} style={{ ...card, marginBottom: 16 }}>
          <div style={cardTitle}>{m.name}</div>
          <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>{m.email}</div>
          {/* Beispielbutton, falls vorhanden: */}
          {/* <button style={buttonPrimary}>Freigeben</button> */}
        </div>
      ))}
    </div>
  );
}
