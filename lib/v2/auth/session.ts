// Session-Handling für v2 (Phase 1)
// JWT im HttpOnly Cookie
// Keine Vermischung mit Alt-Sessions

import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES_IN = '7d';

export function createSession(memberId: string): string {
	return jwt.sign({ memberId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifySession(token: string): { memberId: string } | null {
	try {
		return jwt.verify(token, JWT_SECRET) as { memberId: string };
	} catch {
		return null;
	}
}

// Für Phase 1: Session-Invalidierung erfolgt clientseitig durch Löschen des Cookies
export function destroySession(): void {
	// Placeholder: Im API-Handler Cookie löschen
}
