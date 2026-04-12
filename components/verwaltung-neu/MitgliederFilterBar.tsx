"use client";
import { useState, useMemo } from "react";

export type Member = {
  id: string | number;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  base_group?: string;
  is_approved?: boolean;
  email_verified?: boolean;
  birthdate?: string | null;
};

export type FilterValues = {
  search: string;
  group: string;
  status: string;
};

type Props = {
  members: Member[];
  onFilter: (values: FilterValues) => void;
};

export function MitgliederFilterBar({ members, onFilter }: Props) {
  const [search, setSearch] = useState<string>("");
  const [group, setGroup] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  // Gruppenliste aus den Daten ableiten
  const groupOptions = useMemo<string[]>(() => {
    const set = new Set<string>();
    members.forEach((m) => {
      if (m.base_group) set.add(m.base_group);
    });
    return Array.from(set).sort();
  }, [members]);

  function handleFilterChange() {
    onFilter({ search, group, status });
  }

  return (
    <form
      className="flex flex-wrap gap-2 items-end mb-4"
      onSubmit={e => { e.preventDefault(); handleFilterChange(); }}
    >
      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">Suche</label>
        <input
          type="text"
          className="rounded border border-zinc-300 px-2 py-1 text-sm min-w-[180px]"
          placeholder="Name, E-Mail, Gruppe ..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">Gruppe</label>
        <select
          className="rounded border border-zinc-300 px-2 py-1 text-sm min-w-[120px]"
          value={group}
          onChange={e => setGroup(e.target.value)}
        >
          <option value="">Alle</option>
          {groupOptions.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">Status</label>
        <select
          className="rounded border border-zinc-300 px-2 py-1 text-sm min-w-[120px]"
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          <option value="">Alle</option>
          <option value="approved">Freigegeben</option>
          <option value="pending">Offen</option>
          <option value="email_verified">E-Mail bestätigt</option>
          <option value="email_unverified">E-Mail offen</option>
        </select>
      </div>
      <button type="submit" className="ml-2 px-3 py-1 rounded bg-zinc-700 text-white text-sm">Filtern</button>
    </form>
  );
}

// ...doppelten, verschachtelten Funktionsblock entfernt...
