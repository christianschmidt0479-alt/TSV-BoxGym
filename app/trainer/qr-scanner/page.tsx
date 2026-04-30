import { redirect } from "next/navigation"
import TrainerQrScannerV1 from "@/components/qr/TrainerQrScannerV1"
import { getUserContext } from "@/lib/getUserContext"
import { resolveUserContext } from "@/lib/resolveUserContext"

export const dynamic = "force-dynamic"

export default async function TrainerQrScannerPage() {
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

  return <TrainerQrScannerV1 />
}