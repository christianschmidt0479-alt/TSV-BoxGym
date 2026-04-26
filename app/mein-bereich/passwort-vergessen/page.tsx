import { Suspense } from "react"
import { ForgotPasswordClient } from "./forgot-password-client"

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50" />}>
      <ForgotPasswordClient />
    </Suspense>
  )
}
