import { redirect } from "next/navigation"
import { getUserContext } from "@/lib/getUserContext"
import { resolveUserContext } from "@/lib/resolveUserContext"
import TrainerCompetitionClient from "./trainer-competition-client"

export const dynamic = "force-dynamic"

export default async function TrainerCompetitionPage() {
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

  return <TrainerCompetitionClient />
}
