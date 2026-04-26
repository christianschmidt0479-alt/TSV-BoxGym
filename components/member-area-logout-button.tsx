"use client"

import type { ComponentProps } from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"

type MemberAreaLogoutButtonProps = Omit<ComponentProps<typeof Button>, "children" | "onClick"> & {
  sessionType: "member" | "parent"
  redirectTo?: string
  label?: string
  pendingLabel?: string
  clearStorageKeys?: string[]
  onLoggedOut?: () => void
}

export function MemberAreaLogoutButton({
  sessionType,
  redirectTo = "/",
  label = "Ausloggen",
  pendingLabel = "Loggt aus...",
  clearStorageKeys = [],
  onLoggedOut,
  className,
  variant = "outline",
  ...props
}: MemberAreaLogoutButtonProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleClick() {
    try {
      setPending(true)
      void sessionType
      const res = await fetch("/api/auth/logout", {
        method: "POST",
      })
      if (!res.ok) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Logout failed")
        }
      }
    } finally {
      if (typeof window !== "undefined") {
        for (const key of clearStorageKeys) {
          window.localStorage.removeItem(key)
        }
      }

      onLoggedOut?.()

      if (redirectTo) {
        router.replace(redirectTo)
      }
      router.refresh()

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