import { GsMembershipConfirmationClient } from "../../confirmation-client"

type PageProps = {
  params: Promise<{
    decision: string
    token: string
  }>
}

export default async function MitgliedschaftBestaetigenDecisionPage({ params }: PageProps) {
  const resolvedParams = await params

  return <GsMembershipConfirmationClient decision={resolvedParams.decision} token={resolvedParams.token} />
}