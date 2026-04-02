"use client"

import type { ComponentProps } from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { clearTrainerAccessSession } from "@/lib/trainerAccess"

type TrainerLogoutButtonProps = Omit<ComponentProps<typeof Button>, "children" | "onClick"> & {
  redirectTo?: string
  label?: string
  pendingLabel?: string
  onLoggedOut?: () => void
}

export function TrainerLogoutButton({
  redirectTo = "/",
  label = "Ausloggen",
  pendingLabel = "Loggt aus...",
  onLoggedOut,
  className,
  variant = "outline",
  ...props
}: TrainerLogoutButtonProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleClick() {
    try {
      setPending(true)
      await clearTrainerAccessSession()
      onLoggedOut?.()
      router.replace(redirectTo)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Button className={className} variant={variant} disabled={pending || props.disabled} onClick={() => void handleClick()} {...props}>
      <LogOut className="h-4 w-4" />
      {pending ? pendingLabel : label}
    </Button>
  )
}