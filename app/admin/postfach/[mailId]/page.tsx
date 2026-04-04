import { redirect } from "next/navigation"

export default async function AdminPostfachDetailAliasPage(context: { params: Promise<{ mailId: string }> }) {
  const { mailId } = await context.params
  redirect(`/verwaltung/postfach/${encodeURIComponent(mailId)}`)
}