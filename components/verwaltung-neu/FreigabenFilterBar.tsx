"use client";
import { useState, useMemo } from "react";

export type FreigabenFilterValues = {
  search: string;
  group: string;
};

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
  onFilter: (values: FreigabenFilterValues) => void;
};

export default function FreigabenFilterBar({ members, onFilter }: Props) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");

  const groupOptions = useMemo(() => {
    const set = new Set<string>();
    members.forEach((m) => {
      if (m.base_group) set.add(m.base_group);
    });
    return Array.from(set).sort();
  }, [members]);

  function handleFilterChange() {
    onFilter({ search, group });
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
          placeholder="Name, E-Mail ..."
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
      <button type="submit" className="ml-2 px-3 py-1 rounded bg-zinc-700 text-white text-sm">Filtern</button>
    </form>
  );
}
