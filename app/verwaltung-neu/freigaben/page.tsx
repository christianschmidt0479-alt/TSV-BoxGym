
import { container, pageTitle } from "@/lib/ui"
import { getApprovalWorkflowMembers } from "@/lib/boxgymDb"
import FreigabenClient from "./FreigabenClient"

export default async function FreigabenPage() {
  const members = await getApprovalWorkflowMembers()

  return (
    <div style={container}>
      <div style={pageTitle}>Freigaben</div>
      <FreigabenClient initialMembers={members} />
    </div>
  )
}
