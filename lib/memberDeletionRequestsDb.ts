import { createServerSupabaseServiceClient } from "./serverSupabase"

export async function getOpenMemberDeletionRequest(memberId: string) {
  const supabase = createServerSupabaseServiceClient()
  const { data, error } = await supabase
    .from("member_deletion_requests")
    .select("id, status, requested_at")
    .eq("member_id", memberId)
    .eq("status", "pending")
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getAllOpenMemberDeletionRequests() {
  const supabase = createServerSupabaseServiceClient()
  const { data, error } = await supabase
    .from("member_deletion_requests")
    .select("id, member_id, requested_at, status")
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
  if (error) throw error
  return data
}
