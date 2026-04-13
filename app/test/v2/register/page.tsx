"use client";
// Minimale Testoberfläche für v2 Registrierung
// Nur für Entwickler/Test, getrennt von produktiver UI
import { useState } from 'react';

export default function RegisterTest() {
	const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '', base_group: '' });
	const [result, setResult] = useState<any>(null);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setResult(null);
		const res = await fetch('/api/v2/register/trial', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(form),
		});
		const data = await res.json();
		if (!res.ok) setError(data.error || 'Fehler');
		else setResult(data.user);
	}

	return (
		<form onSubmit={handleSubmit}>
			<input placeholder="E-Mail" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
			<input placeholder="Passwort" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
			<input placeholder="Vorname" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
			<input placeholder="Nachname" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
			<input placeholder="Stammgruppe" value={form.base_group} onChange={e => setForm(f => ({ ...f, base_group: e.target.value }))} />
			<button type="submit">Registrieren</button>
			{error && <div style={{ color: 'red' }}>{error}</div>}
			{result && <pre>{JSON.stringify(result, null, 2)}</pre>}
		</form>
	);
}
