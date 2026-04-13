"use client";
// Minimale Testoberfläche für v2 Login
// Nur für Entwickler/Test, getrennt von produktiver UI
import { useState } from 'react';

export default function LoginTest() {
	const [form, setForm] = useState({ email: '', password: '' });
	const [result, setResult] = useState<any>(null);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setResult(null);
		const res = await fetch('/api/v2/auth/login', {
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
			<button type="submit">Login</button>
			{error && <div style={{ color: 'red' }}>{error}</div>}
			{result && <pre>{JSON.stringify(result, null, 2)}</pre>}
		</form>
	);
}
