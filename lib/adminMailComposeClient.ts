import type { AdminMailDraftRequest } from "@/lib/adminMailComposer"

export type AdminMailComposeRoutePayload = {
  title?: string
  returnTo?: string
  requests: AdminMailDraftRequest[]
}

export function buildAdminMailComposeHref(payload: AdminMailComposeRoutePayload) {
  const params = new URLSearchParams({
    draft: JSON.stringify(payload),
  })

  return `/verwaltung/mail/verfassen?${params.toString()}`
}
