import { cookies } from "next/headers"
import { verifyTrainerSessionToken } from "@/lib/authSession"
import { readMemberSession } from "@/lib/publicAreaSession"

export type ResolvedUserContext = {
  isLoggedIn: boolean
  isMember: boolean
  isTrainer: boolean
  isAdmin: boolean
  memberId: string | null
}

export async function resolveUserContext(): Promise<ResolvedUserContext> {
  const cookieStore = await cookies()

  const memberSession = await readMemberSession(cookieStore)

  let trainerSession: Awaited<ReturnType<typeof verifyTrainerSessionToken>> | null = null
  const trainerToken = cookieStore.get("trainer_session")?.value
  if (trainerToken) {
    trainerSession = await verifyTrainerSessionToken(trainerToken)
  }

  const trainerRole =
    trainerSession?.role === "admin" || trainerSession?.role === "trainer"
      ? trainerSession.role
      : trainerSession?.accountRole === "admin" || trainerSession?.accountRole === "trainer"
        ? trainerSession.accountRole
        : null

  const isMember = !!memberSession || trainerRole === "admin"
  const isTrainer = !!trainerSession
  const isAdmin = trainerRole === "admin"
  const memberId = memberSession?.memberId ?? trainerSession?.memberId ?? trainerSession?.linkedMemberId ?? null

  return {
    isLoggedIn: isMember || isTrainer,
    isMember,
    isTrainer,
    isAdmin,
    memberId,
  }
}
