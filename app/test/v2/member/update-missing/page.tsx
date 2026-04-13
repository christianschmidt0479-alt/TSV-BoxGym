"use client";
import { useState } from 'react';
export default function UpdateMissingTest() {
  const [baseGroup, setBaseGroup] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const res = await fetch('/api/v2/member/update-missing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_group: baseGroup }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Fehler');
    else setResult(data);
  }
  return (
    <form onSubmit={handleSubmit}>
      <input placeholder="base_group" value={baseGroup} onChange={e => setBaseGroup(e.target.value)} />
      <button type="submit">Update base_group</button>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </form>
  );
}
