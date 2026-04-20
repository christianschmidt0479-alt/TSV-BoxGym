import { getAllOpenMemberDeletionRequests } from "@/lib/memberDeletionRequestsDb"
import { findMemberById } from "@/lib/boxgymDb"

export async function getOpenDeletionRequestsWithMemberData() {
  const requests = await getAllOpenMemberDeletionRequests()
  const results = []
  for (const req of requests) {
    const member = await findMemberById(req.member_id)
    if (member) {
      results.push({
        ...req,
        member,
      })
    }
  }
  return results
}
