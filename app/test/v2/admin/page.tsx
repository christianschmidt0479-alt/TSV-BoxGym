"use client";
import useSWR from 'swr';
const fetcher = (url: string) => fetch(url).then(r => r.json());
export default function AdminV2Test() {
  const { data, error } = useSWR('/api/v2/admin/members', fetcher);
  if (error) return <div>Fehler beim Laden</div>;
  if (!data) return <div>Lädt...</div>;
  return (
    <div>
      <h2>v2 Admin-Mitgliederstatus</h2>
      <pre>{JSON.stringify(data.members, null, 2)}</pre>
    </div>
  );
}
