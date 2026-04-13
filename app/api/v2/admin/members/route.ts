import { NextRequest, NextResponse } from 'next/server';
import { getAllMembersV2 } from '@/lib/v2/members/members_v2';

export async function GET() {
  const members = await getAllMembersV2();
  const result = members.map(m => ({
    id: m.id,
    email: m.email,
    member_type: m.member_type,
    email_verified: m.email_verified,
    is_approved: m.is_approved,
    needs_base_group: !m.base_group,
    needs_verification: m.member_type === 'regular' && !m.email_verified,
    needs_approval: m.member_type === 'regular' && !m.is_approved,
    can_upgrade: m.member_type === 'trial' && m.base_group && m.first_name && m.last_name && m.email && m.password_hash,
  }));
  return NextResponse.json({ members: result });
}
