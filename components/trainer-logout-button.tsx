"use client"

import type { ComponentProps } from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { clearTrainerAccessSession } from "@/lib/trainerAccess"

type TrainerLogoutButtonProps = Omit<ComponentProps<typeof Button>, "children" | "onClick"> & {
  redirectTo?: string
  label?: string
  pendingLabel?: string
  iconOnly?: boolean
  onLoggedOut?: () => void
}

export function TrainerLogoutButton({
  redirectTo = "/",
  label = "Ausloggen",
  pendingLabel = "Loggt aus...",
  iconOnly,
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

  if (iconOnly) {
    return (
      <Button
        className={className}
        variant={variant}
        disabled={pending || props.disabled}
        onClick={() => void handleClick()}
        aria-label={pending ? "Wird abgemeldet…" : "Ausloggen"}
        {...props}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      </Button>
    )
  }

  return (
    <Button className={className} variant={variant} disabled={pending || props.disabled} onClick={() => void handleClick()} {...props}>
      <LogOut className="h-4 w-4" />
      {pending ? pendingLabel : label}
    </Button>
  )
}