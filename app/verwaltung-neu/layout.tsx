
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

  return (
    <div data-admin-layout className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-5xl">
        {children}
      </div>
    </div>
  )
}
