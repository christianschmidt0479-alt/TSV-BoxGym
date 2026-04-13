// Passwort-Logik für v2 (Phase 1)
// validatePassword, hashPassword, verifyPassword
// Keine Altlogik, keine Vermischung

export function validatePassword(password: string): boolean {
	if (typeof password !== 'string') return false;
	if (password.length < 8) return false;
	if (/^\d+$/.test(password)) return false; // nicht rein numerisch
	return true;
}

import bcrypt from 'bcryptjs';

export async function hashPassword(password: string): Promise<string> {
	return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return await bcrypt.compare(password, hash);
}
