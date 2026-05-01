import { NextRequest, NextResponse } from 'next/server';
import { getMemberV2ByEmail } from '@/lib/v2/members/members_v2';
import { getCheckinsV2ForMemberOnDay, insertCheckinV2, countCheckinsV2ForMember } from '@/lib/v2/checkins/checkins_v2';
import { isTrainingGroup } from '@/lib/trainingGroups';
import { verifySession } from '@/lib/v2/auth/session';
import { handleCheckin } from '@/lib/checkinCore';

// Fehlercodes
const ERR = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  MISSING_BASE_GROUP: 'MISSING_BASE_GROUP',
  INVALID_GROUP: 'INVALID_GROUP',
  DUPLICATE_CHECKIN: 'DUPLICATE_CHECKIN',
  TRIAL_LIMIT_REACHED: 'TRIAL_LIMIT_REACHED',
  VERIFICATION_REQUIRED: 'VERIFICATION_REQUIRED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  WEIGHT_REQUIRED: 'WEIGHT_REQUIRED',
  INVALID_WEIGHT: 'INVALID_WEIGHT',
};

import { DateTime } from 'luxon';

function getTodayBerlinISO() {
  // Europe/Berlin als Referenz
  return DateTime.now().setZone('Europe/Berlin').toISODate();
}

function isWeightRequired(base_group: string): boolean {
  // Beispiel: Gewichtspflicht für "L-Gruppe"
  return base_group === 'L-Gruppe';
}

function isValidWeight(weight: any): boolean {
  const w = Number(weight);
  return Number.isFinite(w) && w > 20 && w < 200;
}

export async function POST(req: NextRequest) {
  // Session prüfen
  const token = req.cookies.get('v2_session')?.value;
  if (!token) return NextResponse.json({ error: ERR.UNAUTHORIZED }, { status: 401 });
  const session = verifySession(token);
  if (!session) return NextResponse.json({ error: ERR.UNAUTHORIZED }, { status: 401 });

  // Mitglied laden
  const member = await getMemberV2ByEmail(session.memberId);
  if (!member) return NextResponse.json({ error: ERR.MEMBER_NOT_FOUND }, { status: 404 });
  if (!member.base_group) return NextResponse.json({ error: ERR.MISSING_BASE_GROUP }, { status: 400 });

  const body = await req.json();
  const mode = body.mode === 'holiday' ? 'holiday' : 'normal';
  let effective_group = member.base_group;
  let selected_group = undefined;
  if (mode === 'holiday') {
    if (!body.selected_group || !isTrainingGroup(body.selected_group)) {
      return NextResponse.json({ error: ERR.INVALID_GROUP }, { status: 400 });
    }
    effective_group = body.selected_group;
    selected_group = body.selected_group;
  }

  const coreMode = mode === 'holiday' ? 'ferien' : 'normal';
  const today = getTodayBerlinISO() || '';
  const todaysCheckins = await getCheckinsV2ForMemberOnDay(member.id, today);
  const allCheckinsCount = await countCheckinsV2ForMember(member.id);
  const hasCheckedInToday = todaysCheckins.length > 0;

  const checkinResult = await handleCheckin(
    {
      id: member.id,
      is_trial: member.member_type === 'trial',
      is_approved: Boolean(member.is_approved),
      email_verified: Boolean(member.email_verified),
      base_group: member.base_group,
      member_phase: typeof member.member_phase === 'string' ? member.member_phase : null,
    },
    {
      source: 'form',
      mode: coreMode,
    },
    allCheckinsCount,
    hasCheckedInToday
  );

  if (!checkinResult.ok) {
    if (checkinResult.reason === 'DUPLICATE') {
      return NextResponse.json({ ok: false, code: ERR.DUPLICATE_CHECKIN, message: checkinResult.error || 'Check-in für heute bereits vorhanden.' }, { status: 400 });
    }
    if (checkinResult.reason === 'LIMIT_TRIAL') {
      return NextResponse.json({ ok: false, code: ERR.TRIAL_LIMIT_REACHED, message: checkinResult.error || 'Trial-Limit erreicht.' }, { status: 400 });
    }
    if (checkinResult.reason === 'EMAIL_NOT_VERIFIED') {
      return NextResponse.json({ ok: false, code: ERR.VERIFICATION_REQUIRED, message: checkinResult.error || 'E-Mail-Verifizierung erforderlich.' }, { status: 400 });
    }
    if (checkinResult.reason === 'LIMIT_MEMBER') {
      return NextResponse.json({ ok: false, code: ERR.APPROVAL_REQUIRED, message: checkinResult.error || 'Freigabe erforderlich.' }, { status: 400 });
    }
    if (checkinResult.reason === 'NO_GROUP') {
      return NextResponse.json({ ok: false, code: ERR.MISSING_BASE_GROUP, message: checkinResult.error || 'Keine Trainingsgruppe zugewiesen.' }, { status: 400 });
    }
    return NextResponse.json({ ok: false, code: ERR.MEMBER_NOT_FOUND, message: checkinResult.error || 'Mitglied nicht gefunden.' }, { status: 400 });
  }

  if (hasCheckedInToday) {
    return NextResponse.json({ ok: false, error: 'Heute bereits eingecheckt', reason: 'DUPLICATE' }, { status: 400 });
  }

  // Gewichtspflicht
  if (isWeightRequired(member.base_group)) {
    if (body.weight === undefined || body.weight === null) {
      return NextResponse.json({ ok: false, code: ERR.WEIGHT_REQUIRED, message: 'Gewicht erforderlich.' }, { status: 400 });
    }
    if (!isValidWeight(body.weight)) {
      return NextResponse.json({ ok: false, code: ERR.INVALID_WEIGHT, message: 'Ungültiges Gewicht.' }, { status: 400 });
    }
  }

  // Check-in speichern
  try {
    const checkin = await insertCheckinV2({
      member_id: member.id,
      checkin_time: DateTime.now().setZone('Europe/Berlin').toISO() || '',
      checkin_mode: mode,
      effective_group,
      selected_group,
    });
    return NextResponse.json({ ok: true, code: 'SUCCESS', message: 'Check-in erfolgreich.', checkin });
  } catch (e: any) {
    return NextResponse.json({ ok: false, code: 'DB_INSERT_FAILED', message: e?.message || 'Fehler beim Speichern.' }, { status: 500 });
  }
}
