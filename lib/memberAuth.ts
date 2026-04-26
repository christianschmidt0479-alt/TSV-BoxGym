import { cookies } from "next/headers"
import { findMemberById } from "@/lib/boxgymDb"
import { readMemberSession } from "@/lib/publicAreaSession"

export type SessionMember = {
  id: string
  email: string | null
}

export async function getMemberFromSession(): Promise<SessionMember | null> {
  const cookieStore = await cookies()
  const session = await readMemberSession(cookieStore)

  if (!session?.memberId) {
    return null
  }

  const member = await findMemberById(session.memberId)
  if (!member?.id) {
    return null
  }

  return {
    id: member.id,
    email: typeof member.email === "string" ? member.email : null,
  }
}
