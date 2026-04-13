import { NextRequest, NextResponse } from 'next/server';
import { getMemberV2ByEmail } from '@/lib/v2/members/members_v2';
import { verifyPassword } from '@/lib/v2/auth/password';
import { createSession } from '@/lib/v2/auth/session';

export async function POST(req: NextRequest) {
	const body = await req.json();
	if (!body.email || !body.password) {
		return NextResponse.json({ error: 'MISSING_REQUIRED' }, { status: 400 });
	}
	const user = await getMemberV2ByEmail(body.email);
	if (!user) {
		return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
	}
	const ok = await verifyPassword(body.password, user.password_hash);
	if (!ok) {
		return NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
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
	res.cookies.set('v2_session', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
	return res;
}
