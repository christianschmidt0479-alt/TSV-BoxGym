import { AdminMailboxClient } from "@/components/admin-mailbox-client"
import { MarkSectionSeen } from "@/components/mark-section-seen"

export default function VerwaltungPostfachPage() {
  return (
    <>
      <MarkSectionSeen section="mailbox" />
      <AdminMailboxClient basePath="/verwaltung/postfach" backHref="/verwaltung" />
    </>
  )
}