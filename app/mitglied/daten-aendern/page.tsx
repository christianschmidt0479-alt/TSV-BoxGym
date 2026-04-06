import { MemberUpdateClient } from "./member-update-client"

export default async function MitgliedDatenAendernPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const params = await searchParams
  const token = params.token?.trim() ?? ""

  return <MemberUpdateClient token={token} />
}