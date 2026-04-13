"use client";
import { useState, useMemo } from "react";
import FreigabenFilterBar, { FreigabenFilterValues } from "./FreigabenFilterBar";
import FreigabenActions from "./FreigabenActions";
import { StatusBadge } from "./StatusBadge";

type Member = {
  id: string | number;
  name?: string;
  email?: string;
  base_group?: string;
  created_at?: string;
  email_verified?: boolean;
};

type Props = {
  members: Member[];
  handleApproveServer: (memberId: string) => Promise<{ ok?: boolean; error?: string }>;
};

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function FreigabenFilterClientWrapper({ members, handleApproveServer }: Props) {
  const [filtered, setFiltered] = useState<Member[]>(members);

  const handleFilter = (filter: FreigabenFilterValues) => {
    let result = members;
    const s = filter.search.trim().toLowerCase();
    if (s) {
      result = result.filter((m) =>
        (m.name && m.name.toLowerCase().includes(s)) ||
        (m.email && m.email.toLowerCase().includes(s))
      );
    }
    if (filter.group) {
      result = result.filter((m) => m.base_group === filter.group);
    }
    setFiltered(result);
  };

  return (
    <>
      <FreigabenFilterBar members={members} onFilter={handleFilter} />
      {filtered.length === 0 ? (
        <div className="text-zinc-500 py-12 text-center">Keine offenen Freigaben</div>
      ) : (
        <div className="space-y-4">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="bg-white rounded shadow-sm px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 border border-zinc-100"
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-zinc-900 truncate">{m.name || <span className="text-zinc-400">(Kein Name)</span>}</div>
                <div className="text-sm text-zinc-600 truncate">{m.email || <span className="text-zinc-400">(Keine E-Mail)</span>}</div>
                <div className="text-xs text-zinc-500 mt-1">
                  Registriert am: {formatDate(m.created_at)}
                  {m.base_group && (
                    <span className="ml-2">Gruppe: <span className="font-medium">{m.base_group}</span></span>
                  )}
                </div>
                <div className="text-xs mt-1 flex gap-2">
                  {m.email_verified ? (
                    <StatusBadge color="green">E-Mail bestätigt</StatusBadge>
                  ) : (
                    <StatusBadge color="yellow">E-Mail offen</StatusBadge>
                  )}
                  <StatusBadge color="yellow">Freigabe offen</StatusBadge>
                </div>
              </div>
              <FreigabenActions member={m} handleApproveServer={handleApproveServer} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
