"use client";
// Minimale Testoberfläche für v2 Check-in
// Nur für Entwickler/Test, getrennt von produktiver UI
import { useState } from 'react';

export default function CheckinTest() {
  const [form, setForm] = useState({ mode: 'normal', selected_group: '', weight: '' });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const res = await fetch('/api/v2/checkin/member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: form.mode,
        selected_group: form.selected_group || undefined,
        weight: form.weight ? Number(form.weight) : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Fehler');
    else setResult(data);
  }

  return (
    <form onSubmit={handleSubmit}>
      <select value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
        <option value="normal">Normalmodus</option>
        <option value="holiday">Ferienmodus</option>
      </select>
      <input placeholder="Stammgruppe (Ferienmodus)" value={form.selected_group} onChange={e => setForm(f => ({ ...f, selected_group: e.target.value }))} />
      <input placeholder="Gewicht (optional)" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} />
      <button type="submit">Check-in</button>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </form>
  );
}
