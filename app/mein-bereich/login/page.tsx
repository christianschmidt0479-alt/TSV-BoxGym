import { Suspense } from "react"
import MemberLoginForm from "@/app/mein-bereich/MemberLoginForm"

export default function MeinBereichLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50" />}>
      <MemberLoginForm />
    </Suspense>
  )
}
