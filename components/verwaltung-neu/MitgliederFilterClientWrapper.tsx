
"use client";

// Defensive lokale Hilfsfunktion für Datumsanzeige
function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}


import { useState } from "react";
import { MitgliederFilterBar, FilterValues, Member } from "./MitgliederFilterBar";
import Link from "next/link";

type Props = {
  members: Member[];
};

export default function MitgliederFilterClientWrapper({ members }: Props) {
  const [filtered, setFiltered] = useState<Member[]>(members);

  const handleFilter = (filter: FilterValues) => {
    let result = members;
    const s = filter.search.trim().toLowerCase();
    if (s) {
      result = result.filter((m: Member) =>
        (m.name && m.name.toLowerCase().includes(s)) ||
        (m.first_name && m.first_name.toLowerCase().includes(s)) ||
        (m.last_name && m.last_name.toLowerCase().includes(s)) ||
        (m.email && m.email.toLowerCase().includes(s)) ||
        (m.base_group && m.base_group.toLowerCase().includes(s))
      );
    }
    if (filter.group) {
      result = result.filter((m: Member) => m.base_group === filter.group);
    }
    if (filter.status) {
      if (filter.status === "approved") result = result.filter((m: Member) => m.is_approved);
      if (filter.status === "pending") result = result.filter((m: Member) => !m.is_approved);
      if (filter.status === "email_verified") result = result.filter((m: Member) => m.email_verified);
      if (filter.status === "email_unverified") result = result.filter((m: Member) => !m.email_verified);
    }
    setFiltered(result);
  };

  return (
    <>
      <MitgliederFilterBar members={members} onFilter={handleFilter} />
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded shadow-sm border border-zinc-200">
          <thead>
            <tr className="bg-zinc-50 text-zinc-700 text-sm">
              <th className="px-3 py-2 text-left font-semibold">Name</th>
              <th className="px-3 py-2 text-left font-semibold">E-Mail</th>
              <th className="px-3 py-2 text-left font-semibold">Gruppe</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-left font-semibold">Registriert am</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-zinc-400 text-center py-8">Keine Mitglieder gefunden</td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="px-3 py-2 whitespace-nowrap font-medium">{m.name || `${m.first_name || ""} ${m.last_name || ""}`}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{m.email || <span className="text-zinc-400">–</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{m.base_group || <span className="text-zinc-400">–</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    return (
                      <>
                        <MitgliederFilterBar members={members} onFilter={handleFilter} />
                        <div className="overflow-x-auto">
                          <table className="min-w-full bg-white rounded shadow-sm border border-zinc-200">
                            <thead>
                              <tr className="bg-zinc-50 text-zinc-700 text-sm">
                                <th className="px-3 py-2 text-left font-semibold">Name</th>
                                <th className="px-3 py-2 text-left font-semibold">E-Mail</th>
                                <th className="px-3 py-2 text-left font-semibold">Gruppe</th>
                                <th className="px-3 py-2 text-left font-semibold">Status</th>
                                <th className="px-3 py-2 text-left font-semibold">Registriert am</th>
                                <th className="px-3 py-2 text-left font-semibold"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {filtered.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="text-zinc-400 text-center py-8">Keine Mitglieder gefunden</td>
                                </tr>
                              ) : (
                                filtered
                                  .filter(Boolean)
                                  .filter((m) => m && typeof m === "object" && m.id)
                                  .map((m) => {
                                    const id = m.id;
                                    const name = m.name || `${m.first_name || ""} ${m.last_name || ""}`.trim() || "–";
                                    const email = m.email || <span className="text-zinc-400">–</span>;
                                    const group = m.base_group || <span className="text-zinc-400">–</span>;
                                    const status = m.is_approved ? (
                                      <span className="text-green-700">Freigegeben</span>
                                    ) : (
                                      <span className="text-orange-700">Offen</span>
                                    );
                                    const emailStatus = m.email_verified ? (
                                      <span className="ml-2 text-green-600 text-xs">E-Mail bestätigt</span>
                                    ) : (
                                      <span className="ml-2 text-orange-600 text-xs">E-Mail offen</span>
                                    );
                                    return (
                                      <tr key={id} className="border-t border-zinc-100 hover:bg-zinc-50">
                                        <td className="px-3 py-2 whitespace-nowrap font-medium">{name}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{email}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{group}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                          {status}
                                          {emailStatus}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.birthdate)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                          {id ? (
                                            <Link href={`/verwaltung-neu/mitglieder/${id}`} className="inline-block px-3 py-1 rounded bg-zinc-700 text-white text-xs font-medium hover:bg-zinc-900">Öffnen</Link>
                                          ) : (
                                            <span className="text-zinc-400">–</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.birthdate)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Link href={`/verwaltung-neu/mitglieder/${m.id}`} className="inline-block px-3 py-1 rounded bg-zinc-700 text-white text-xs font-medium hover:bg-zinc-900">Öffnen</Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          );
}