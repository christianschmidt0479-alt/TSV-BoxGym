"use server"

import { revalidatePath } from "next/cache"

export async function approveOrRejectMemberDeletionRequest(formData: FormData) {
  const requestId = formData.get("requestId")?.toString()
  const action = formData.get("action")?.toString()
  if (!requestId || !action) return
  await fetch("/api/admin/member-deletion-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, action }),
  })
  revalidatePath("/verwaltung-neu/loeschantraege")
}
