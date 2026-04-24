/**
 * Central Check-in Core Logic
 * 
 * Isolated, pure decision function for all check-in entry points.
 * No side effects, no database operations, no imports from legacy code.
 * 
 * Used by: QR, NFC, Fast Check-in, Form Check-in, Trainer Check-in
 */

import { MAX_TRAININGS_WITHOUT_APPROVAL } from "@/lib/memberCheckin"

/**
 * Maximum number of trial check-ins allowed
 */
export const MAX_TRIAL_CHECKINS = 3

/**
 * Member data required for check-in decision
 */
export type Member = {
  id: string
  is_trial: boolean
  is_approved: boolean
  email_verified: boolean
  base_group: string | null
}

/**
 * Context of the check-in source and environment
 */
export type Context = {
  source: "qr" | "nfc" | "fast" | "form" | "trainer"
  mode: "normal" | "ferien"
  deviceId?: string
}

/**
 * Result of check-in validation
 */
export type CheckinResult = {
  ok: boolean
  error?: string
  reason?: string
  checkinId?: string
}

/**
 * Central check-in eligibility logic
 * 
 * Step-by-step validation:
 * A) Member exists?
 * B) Email verified?
 * C) Base group assigned?
 * D1) Duplicate check-in today?
 * D2) Trial limit exceeded?
 * D3) Approval limit exceeded?
 * D4) Ferienmodus considerations?
 * 
 * @param member Member data
 * @param context Check-in context (source, mode, optional deviceId)
 * @param memberCheckinCount Current number of check-ins for this member (in current period)
 * @param hasCheckedInToday Whether member has already checked in today
 * @returns CheckinResult with ok/error/reason
 */
export async function handleCheckin(
  member: Member,
  context: Context,
  memberCheckinCount: number,
  hasCheckedInToday: boolean
): Promise<CheckinResult> {
  // ============================================================================
  // A) MEMBER EXISTS CHECK
  // ============================================================================
  if (!member || !member.id) {
    return {
      ok: false,
      error: "Mitglied nicht gefunden",
      reason: "NOT_FOUND",
    }
  }

  // ============================================================================
  // B) EMAIL VERIFIED CHECK
  // ============================================================================
  if (!member.email_verified) {
    return {
      ok: false,
      error: "Deine E-Mail wurde noch nicht bestätigt",
      reason: "EMAIL_NOT_VERIFIED",
    }
  }

  // ============================================================================
  // C) BASE GROUP CHECK
  // ============================================================================
  if (!member.base_group) {
    return {
      ok: false,
      error: "Keine Trainingsgruppe zugewiesen",
      reason: "NO_GROUP",
    }
  }

  // ============================================================================
  // D1) DUPLICATE CHECK - Already checked in today?
  // ============================================================================
  if (hasCheckedInToday) {
    return {
      ok: false,
      error: "Du bist heute bereits eingecheckt.",
      reason: "DUPLICATE",
    }
  }

  // ============================================================================
  // D2) TRIAL MEMBER LIMIT CHECK - Max 3 trainings
  // ============================================================================
  if (member.is_trial) {
    if (memberCheckinCount >= MAX_TRIAL_CHECKINS) {
      return {
        ok: false,
        error: "Du hast die maximale Anzahl an Probetrainings erreicht.",
        reason: "LIMIT_TRIAL",
      }
    }
  }

  // ============================================================================
  // D3) APPROVAL MEMBER LIMIT CHECK - Max 8 trainings without approval
  // ============================================================================
  if (!member.is_trial && !member.is_approved) {
    if (memberCheckinCount >= MAX_TRAININGS_WITHOUT_APPROVAL) {
      return {
        ok: false,
        error: "Du hast die maximale Anzahl an Trainings ohne Mitgliederprüfung erreicht. Bitte wende dich an einen Trainer.",
        reason: "LIMIT_MEMBER",
      }
    }
  }

  // ============================================================================
  // D4) FERIENMODUS CONSIDERATIONS
  // ============================================================================
  if (context.mode === "ferien") {
    // Currently only marking for future logic
    // No blocking implemented yet
    // TODO: Add ferienmodus group exclusion logic when needed
  }

  // ============================================================================
  // SUCCESS: All checks passed - Ready for check-in
  // ============================================================================
  // NOTE: Database insert operation will happen in calling route
  return {
    ok: true,
    // checkinId will be populated after database insert
  }
}
