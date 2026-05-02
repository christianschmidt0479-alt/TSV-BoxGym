import { resolveUserContext } from "@/lib/resolveUserContext"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { needsWeight } from "@/lib/memberUtils"
import { HeaderClient } from "./HeaderClient"

export default async function Header() {
  const user = await resolveUserContext()
  let canAccessMemberDownloads = false

  if (user.isMember && !user.isAdmin && user.memberId) {
    const supabase = createServerSupabaseServiceClient()
    const { data: member } = await supabase
      .from("members")
      .select("base_group, is_competition_member, is_wettkaempfer")
      .eq("id", user.memberId)
      .maybeSingle()

    canAccessMemberDownloads = Boolean(member && (member.is_competition_member === true || needsWeight(member)))
  }

  return (
    <header data-app-header>
      <HeaderClient user={user} canAccessMemberDownloads={canAccessMemberDownloads} />
    </header>
  )
}
