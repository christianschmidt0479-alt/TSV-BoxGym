
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
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-2xl bg-[#154c83] px-4 py-4 text-base font-semibold text-white">
          Admin-Verwaltung
          <div className="mt-1 text-sm font-medium text-blue-100">{displayName} · {roleLabel}</div>
        </div>
        {children}
      </div>
    </div>
  )
}
