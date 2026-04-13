import { NextRequest, NextResponse } from 'next/server';
import { getMemberV2ByEmail, upgradeTrialToRegular, hasAllUpgradeFields } from '@/lib/v2/members/members_v2';
import { verifySession } from '@/lib/v2/auth/session';

const ERR = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  UPGRADE_NOT_POSSIBLE: 'UPGRADE_NOT_POSSIBLE',
  NO_UPDATE: 'NO_UPDATE',
};

export async function POST(req: NextRequest) {
  const token = req.cookies.get('v2_session')?.value;
  if (!token) return NextResponse.json({ error: ERR.UNAUTHORIZED }, { status: 401 });
  const session = verifySession(token);
  if (!session) return NextResponse.json({ error: ERR.UNAUTHORIZED }, { status: 401 });

  const member = await getMemberV2ByEmail(session.memberId);
  if (!member) return NextResponse.json({ error: ERR.MEMBER_NOT_FOUND }, { status: 404 });

  if (!hasAllUpgradeFields(member)) {
    return NextResponse.json({ error: ERR.UPGRADE_NOT_POSSIBLE }, { status: 400 });
  }
  const updated = await upgradeTrialToRegular(member.id);
  if (!updated) return NextResponse.json({ error: ERR.NO_UPDATE }, { status: 400 });
  return NextResponse.json({ success: true });
}
