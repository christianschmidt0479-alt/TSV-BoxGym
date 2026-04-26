import { NextRequest, NextResponse } from 'next/server';
import { getMemberV2ByEmail } from '@/lib/v2/members/members_v2';
import { verifyPassword } from '@/lib/v2/auth/password';
import { createSession } from '@/lib/v2/auth/session';
import { ratelimit } from '@/lib/ratelimit';

const DUMMY_BCRYPT_HASH = '$2a$10$7EqJtq98hPqEX7fNZaFWoO5rA3nY5xpoE2mR7BfrpsbR9f7DmqD6';

export async function POST(req: NextRequest) {
	let body: unknown = {};
	try {
		body = await req.json();
	} catch {
		body = {};
	}

	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
	}

	const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
	const { success } = await ratelimit.limit(`v2-login:${ip}`);
	if (!success) {
		return NextResponse.json({ error: 'Zu viele Anfragen' }, { status: 429 });
	}

	const payload = body as { email?: unknown; password?: unknown };
	const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
	const password = typeof payload.password === 'string' ? payload.password : '';

	if (!email || !password) {
		return NextResponse.json({ error: 'MISSING_REQUIRED' }, { status: 400 });
	}
	const user = await getMemberV2ByEmail(email);
	const hash = user?.password_hash ?? DUMMY_BCRYPT_HASH;
	const ok = await verifyPassword(password, hash);

	if (!user || !ok) {
		return new Response(JSON.stringify({ error: true, message: 'E-Mail oder Passwort falsch' }), { status: 401 });
	}
	const token = createSession(user.id);
	const res = NextResponse.json({ user: {
		id: user.id,
		email: user.email,
		first_name: user.first_name,
		last_name: user.last_name,
		base_group: user.base_group,
		member_type: user.member_type,
	}});
	res.cookies.set('v2_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 7 });
	return res;
}
