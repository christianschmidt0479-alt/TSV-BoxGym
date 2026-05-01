import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { findMemberById } from "@/lib/boxgymDb"
import { MEMBER_AREA_SESSION_COOKIE, readMemberSession } from "@/lib/publicAreaSession"
import { DatenClient, type MemberView } from "./DatenClient"

export default async function DatenPage() {
  const cookieStore = await cookies()
  const hadMemberSessionCookie = Boolean(cookieStore.get(MEMBER_AREA_SESSION_COOKIE)?.value)
  const memberSession = await readMemberSession(cookieStore)

  if (!memberSession?.memberId) {
    redirect(hadMemberSessionCookie ? "/mein-bereich/login?reason=session_expired" : "/mein-bereich/login")
  }

  const member = await findMemberById(memberSession.memberId)

  if (!member) {
    redirect("/mein-bereich/login")
  }

  const fullName = `${typeof member.first_name === "string" ? member.first_name : ""} ${typeof member.last_name === "string" ? member.last_name : ""}`.trim()

  const initialMember: MemberView = {
    name: (typeof member.name === "string" ? member.name : fullName) || "-",
    email: (typeof member.email === "string" ? member.email : "-") || "-",
    phone: (typeof member.phone === "string" ? member.phone : "-") || "-",
    birthdate: typeof member.birthdate === "string" ? member.birthdate : "",
    group: (typeof member.base_group === "string" ? member.base_group : "-") || "-",
    is_approved: Boolean(member.is_approved),
  }

  return <DatenClient initialMember={initialMember} />
}
