import { cookies } from "next/headers"
import { verifyTrainerSessionToken } from "@/lib/authSession"
import { readMemberSession } from "@/lib/publicAreaSession"

export type ResolvedUserContext =
  | {
      type: "trainer"
      role: "admin" | "trainer" | null
      memberId: string | null
      source: "trainer_session"
      hasMemberSession: boolean
    }
  | {
      type: "member"
      memberId: string
      source: "member_session"
    }

export async function resolveUserContext(): Promise<ResolvedUserContext | null> {
  const cookieStore = await cookies()

  const trainerToken = cookieStore.get("trainer_session")?.value
  const memberSession = await readMemberSession(cookieStore)

  if (trainerToken) {
    const trainerSession = await verifyTrainerSessionToken(trainerToken)

    if (trainerSession) {
      return {
        type: "trainer",
        role: trainerSession.role,
        memberId: trainerSession.memberId ?? trainerSession.linkedMemberId ?? null,
        source: "trainer_session",
        hasMemberSession: !!memberSession,
      }
    }
  }

  if (memberSession) {
    return {
      type: "member",
      memberId: memberSession.memberId,
      source: "member_session",
    }
  }

  return null
}
