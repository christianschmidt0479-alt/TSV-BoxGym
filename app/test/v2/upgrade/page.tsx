"use client";
import { useState } from 'react';
export default function UpgradeTest() {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  async function handleUpgrade() {
    setError(null);
    setResult(null);
    const res = await fetch('/api/v2/upgrade/trial-to-regular', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Fehler');
    else setResult(data);
  }
  return (
    <div>
      <button onClick={handleUpgrade}>Upgrade trial → regular</button>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
