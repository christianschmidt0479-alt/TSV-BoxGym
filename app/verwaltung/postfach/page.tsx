import { AdminMailboxClient } from "@/components/admin-mailbox-client"

export default function VerwaltungPostfachPage() {
  return <AdminMailboxClient basePath="/verwaltung/postfach" backHref="/verwaltung" />
}