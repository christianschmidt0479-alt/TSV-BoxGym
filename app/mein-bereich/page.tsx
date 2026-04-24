import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import MemberLoginForm from "./MemberLoginForm"
import { verifyTrainerSessionToken } from "@/lib/authSession"

export default async function MeinBereichPage() {
  const cookieStore = await cookies()
  const trainerSession = cookieStore.get("trainer_session")
  const session = cookieStore.get("tsv_member_area_session")

  if (trainerSession?.value) {
    const parsedTrainerSession = await verifyTrainerSessionToken(trainerSession.value)

    if (parsedTrainerSession?.role === "admin") {
      redirect("/verwaltung-neu")
    }

    if (parsedTrainerSession?.role === "trainer") {
      redirect("/trainer")
    }
  }

  if (session?.value) {
    redirect("/mein-bereich/dashboard")
  }

  return <MemberLoginForm />
}
