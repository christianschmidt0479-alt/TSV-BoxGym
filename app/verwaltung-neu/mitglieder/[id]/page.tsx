import { notFound } from "next/navigation";
import { findMemberById } from "@/lib/boxgymDb";

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default async function MitgliedDetailPage({ params }: { params: { id: string } }) {
  const member = await findMemberById(params.id);
  if (!member) return notFound();

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold mb-6">Mitglied</h1>
      <div className="bg-white rounded shadow-sm border border-zinc-100 p-6 space-y-4">
        <div>
          <div className="text-xs text-zinc-500 mb-1">Name</div>
          <div className="text-lg font-semibold text-zinc-900">{member.name || `${member.first_name || ""} ${member.last_name || ""}`}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500 mb-1">E-Mail</div>
          <div className="text-base text-zinc-800">{member.email || <span className="text-zinc-400">–</span>}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500 mb-1">Gruppe</div>
          <div className="text-base text-zinc-800">{member.base_group || <span className="text-zinc-400">–</span>}</div>
        </div>
        <div className="flex gap-4">
          <div>
            <div className="text-xs text-zinc-500 mb-1">Freigabe</div>
            <div className={member.is_approved ? "text-green-700 font-medium" : "text-orange-700 font-medium"}>
              {member.is_approved ? "Freigegeben" : "Offen"}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1">E-Mail</div>
            <div className={member.email_verified ? "text-green-700 font-medium" : "text-orange-700 font-medium"}>
              {member.email_verified ? "Bestätigt" : "Offen"}
            </div>
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500 mb-1">Registriert am</div>
          <div className="text-base text-zinc-800">{formatDate(member.created_at)}</div>
        </div>
      </div>
    </div>
  );
}
