import { AdminMailboxClient } from "@/components/admin-mailbox-client"

export default function VerwaltungPostfachPage() {
  // Default-Tab: Eingang
  return <AdminMailboxClient basePath="/verwaltung/postfach" backHref="/verwaltung" />
}