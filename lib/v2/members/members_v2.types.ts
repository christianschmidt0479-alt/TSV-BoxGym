// Typdefinitionen für members_v2 (Phase 1)
export interface MemberV2 {
	id: string;
	email: string;
	password_hash: string;
	first_name: string;
	last_name: string;
	base_group: string;
	member_type: 'trial' | 'regular';
	is_approved: boolean;
	email_verified: boolean;
	created_at: string;
	updated_at: string;
	member_phase?: string | null;
}
