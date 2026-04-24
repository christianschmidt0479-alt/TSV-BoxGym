
import { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getUserContext } from "@/lib/getUserContext"

type LayoutProps = {
  children: ReactNode
}

export default async function Layout({ children }: LayoutProps) {
  const userContext = await getUserContext()
  if (!userContext) {
    redirect("/trainer-zugang")
  }

  if (userContext.role !== "admin") {
    redirect("/trainer")
  }

  const fullName = `${userContext.trainer.firstName} ${userContext.trainer.lastName}`.trim()
  const displayName = fullName || userContext.trainer.email
  const roleLabel = userContext.isMember ? "Admin + Trainer + Mitglied" : "Admin + Trainer"

  return (
    <div className="space-y-3 px-4 py-3 md:px-6 md:py-4">
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm">
        Eingeloggt als: {displayName} ({roleLabel})
      </div>
      {children}
    </div>
  )
}
