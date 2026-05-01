import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { MEMBER_AREA_SESSION_COOKIE, readMemberSession } from "@/lib/publicAreaSession"
import { PasswortClient } from "./PasswortClient"

export default async function PasswortPage() {
  const cookieStore = await cookies()
  const hadMemberSessionCookie = Boolean(cookieStore.get(MEMBER_AREA_SESSION_COOKIE)?.value)
  const memberSession = await readMemberSession(cookieStore)

  if (!memberSession?.memberId) {
    redirect(hadMemberSessionCookie ? "/mein-bereich/login?reason=session_expired" : "/mein-bereich/login")
  }

  return <PasswortClient initialEmail={memberSession.email || ""} />
}
