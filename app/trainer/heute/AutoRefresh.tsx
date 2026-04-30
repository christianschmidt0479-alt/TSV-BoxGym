"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function AutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    const timer = window.setInterval(() => {
      router.refresh()
    }, 8000)

    return () => {
      window.clearInterval(timer)
    }
  }, [router])

  return null
}
