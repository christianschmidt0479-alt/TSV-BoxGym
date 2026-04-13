import { NextRequest, NextResponse } from 'next/server';
import { validateMemberV2Input } from '@/lib/v2/members/members_v2.validation';
import { getMemberV2ByEmail, createTrialMember } from '@/lib/v2/members/members_v2';
import { hashPassword } from '@/lib/v2/auth/password';

export async function POST(req: NextRequest) {
	const body = await req.json();
	const { valid, errors } = validateMemberV2Input(body);
	if (!valid) {
		return NextResponse.json({ error: 'INVALID_INPUT', details: errors }, { status: 400 });
	}
	const existing = await getMemberV2ByEmail(body.email);
	if (existing) {
		return NextResponse.json({ error: 'ALREADY_REGISTERED' }, { status: 409 });
	}
	const password_hash = await hashPassword(body.password);
	try {
		const user = await createTrialMember({
			email: body.email,
			password_hash,
			first_name: body.first_name,
			last_name: body.last_name,
			base_group: body.base_group,
			member_type: 'trial',
			is_approved: false,
			email_verified: false,
		});
		return NextResponse.json({ user });
	} catch (e) {
		return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 });
	}
}
