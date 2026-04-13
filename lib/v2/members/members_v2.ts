// Zugriffsschicht für members_v2 (Phase 1)
// Nur für v2, keine Altlogik
import { MemberV2 } from './members_v2.types';

import { createServerSupabaseServiceClient } from '@/lib/serverSupabase';
const supabase = createServerSupabaseServiceClient();
const TABLE = 'members_v2';

export async function updateMemberV2BaseGroup(member_id: string, base_group: string): Promise<boolean> {
	const { error } = await supabase
		.from(TABLE)
		.update({ base_group, updated_at: new Date().toISOString() })
		.eq('id', member_id);
	return !error;
}

export async function updateMemberV2Password(member_id: string, password_hash: string): Promise<boolean> {
	const { error } = await supabase
		.from(TABLE)
		.update({ password_hash, updated_at: new Date().toISOString() })
		.eq('id', member_id);
	return !error;
}

export async function upgradeTrialToRegular(member_id: string): Promise<boolean> {
	const { error } = await supabase
		.from(TABLE)
		.update({ member_type: 'regular', updated_at: new Date().toISOString() })
		.eq('id', member_id);
	return !error;
}

export function hasAllUpgradeFields(member: MemberV2): boolean {
	return Boolean(
		member.base_group &&
		member.first_name &&
		member.last_name &&
		member.email &&
		member.password_hash
	);
}

export async function getAllMembersV2(): Promise<MemberV2[]> {
	const { data, error } = await supabase
		.from(TABLE)
		.select('*');
	if (error || !data) return [];
	return data as MemberV2[];
}

export async function getMemberV2ByEmail(email: string): Promise<MemberV2 | null> {
	const { data, error } = await supabase
		.from(TABLE)
		.select('*')
		.eq('email', email)
		.maybeSingle();
	if (error || !data) return null;
	return data as MemberV2;
}

export async function createTrialMember(input: Omit<MemberV2, 'id' | 'created_at' | 'updated_at'>): Promise<MemberV2> {
	const now = new Date().toISOString();
	const insert = {
		...input,
		member_type: 'trial',
		is_approved: false,
		email_verified: false,
		created_at: now,
		updated_at: now,
	};
	const { data, error } = await supabase
		.from(TABLE)
		.insert([insert])
		.select()
		.maybeSingle();
	if (error || !data) throw new Error('DB_INSERT_FAILED');
	return data as MemberV2;
}
