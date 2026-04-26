import { redirect } from "next/navigation"
import { findMemberById } from "@/lib/boxgymDb"
import { getUserContext } from "@/lib/getUserContext"
import { resolveUserContext } from "@/lib/resolveUserContext"

export default async function MeinBereichPage() {
  const resolvedContext = await resolveUserContext()

  if (!resolvedContext) {
    redirect("/mein-bereich/login")
  }

  const context = await getUserContext()
  let memberId = resolvedContext.memberId ?? null

  if (!memberId) {
    const member = await findMemberById(resolvedContext.memberId ?? "")
    if (!member?.id) {
      redirect("/mein-bereich/login")
    }

    memberId = member.id
  }

  const trainerName = context?.trainer
    ? `${context.trainer.firstName ?? ""} ${context.trainer.lastName ?? ""}`.trim() || context.trainer.email
    : null

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-4 w-full max-w-md">
        <h1 className="text-xl font-semibold">Mitgliederbereich</h1>
        {trainerName ? (
          <p className="text-sm text-gray-600">Zusatzinfo: Trainer angemeldet als {trainerName}</p>
        ) : null}
        <p className="text-sm text-gray-600">Mein-Bereich-Zugang ist aktiv.</p>
        <a
          href="/mein-bereich/dashboard"
          className="inline-flex items-center justify-center rounded-xl bg-[#154c83] px-4 py-2 text-sm font-semibold text-white hover:bg-[#123d69]"
        >
          Zum Dashboard
        </a>
      </div>
    </div>
  )
}
