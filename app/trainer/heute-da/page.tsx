import { redirect } from "next/navigation"
import { getUserContext } from "@/lib/getUserContext"
import { resolveUserContext } from "@/lib/resolveUserContext"
import TrainerHeuteDaClient from "./trainer-heute-da-client"

export const dynamic = "force-dynamic"

export default async function TrainerHeuteDaPage() {
  const resolvedContext = await resolveUserContext()
  if (!resolvedContext.isTrainer && !resolvedContext.isAdmin) {
    redirect("/trainer-zugang")
  }

  const context = await getUserContext()
  if (!context) {
    redirect("/trainer-zugang")
  }

  if (context.role !== "trainer" && context.role !== "admin") {
    redirect("/mein-bereich")
  }

  return <TrainerHeuteDaClient />
}
