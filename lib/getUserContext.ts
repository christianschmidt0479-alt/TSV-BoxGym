import { cookies } from "next/headers"
import { cache } from "react"
import { TRAINER_SESSION_COOKIE, verifyTrainerSessionToken, type ServerTrainerRole } from "@/lib/authSession"
import { findMemberById } from "@/lib/boxgymDb"

export type UserContextMember = {
  id: string
  first_name?: string | null
  last_name?: string | null
  name?: string | null
  email?: string | null
  base_group?: string | null
  is_trial?: boolean | null
  is_approved?: boolean | null
  email_verified?: boolean | null
  member_phase?: string | null
}

export type UserContext = {
  role: ServerTrainerRole
  trainer: {
    role: ServerTrainerRole
    email: string
    firstName: string
    lastName: string
    linkedMemberId: string | null
    memberId: string | null
  }
  member: UserContextMember | null
  isMember: boolean
}

export const getUserContext = cache(async (): Promise<UserContext | null> => {
  const cookieStore = await cookies()
  const token = cookieStore.get(TRAINER_SESSION_COOKIE)?.value

  if (!token) return null

  const session = await verifyTrainerSessionToken(token)

  if (!session) {
    // Automatically clear invalid sessions
    try {
      const store = await cookies()
      store.delete(TRAINER_SESSION_COOKIE)
    } catch (err) {
      // Cookie deletion failed - ignore, session is invalid anyway
    }
    return null
  }

  const memberId = session.memberId ?? session.linkedMemberId ?? null
  const member = memberId ? ((await findMemberById(memberId)) as UserContextMember | null) : null
  const isMember = Boolean(member?.id)

  return {
    role: session.role,
    trainer: {
      role: session.role,
      email: session.accountEmail,
      firstName: session.accountFirstName,
      lastName: session.accountLastName,
      linkedMemberId: session.linkedMemberId,
      memberId,
    },
    member,
    isMember,
  }
})
