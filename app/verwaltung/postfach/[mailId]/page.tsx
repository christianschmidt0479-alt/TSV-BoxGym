import { AdminMailboxClient } from "@/components/admin-mailbox-client"

export default async function VerwaltungPostfachDetailPage(context: { params: Promise<{ mailId: string }> }) {
  const { mailId } = await context.params
  return <AdminMailboxClient basePath="/verwaltung/postfach" backHref="/verwaltung" detailId={decodeURIComponent(mailId)} />
}