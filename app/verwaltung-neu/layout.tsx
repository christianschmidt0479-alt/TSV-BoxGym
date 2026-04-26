
import { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getUserContext } from "@/lib/getUserContext"

type LayoutProps = {
  children: ReactNode
}

export default async function Layout({ children }: LayoutProps) {
  const context = await getUserContext()
  if (!context) {
    redirect("/trainer-zugang")
  }

  if (context.role !== "admin") {
    redirect("/trainer")
  }

  const fullName = `${context.trainer.firstName} ${context.trainer.lastName}`.trim()
  const displayName = fullName || context.trainer.email
  const roleLabel = context.isMember ? "Admin + Trainer + Mitglied" : "Admin + Trainer"

  return (
    <div className="font-sans space-y-3 px-4 py-3 md:px-6 md:py-4">
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm">
        Eingeloggt als: {displayName} ({roleLabel})
      </div>
      {children}
    </div>
  )
}
