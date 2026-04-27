export async function GET(request: Request) {
  const userAgent = request.headers.get("user-agent") || ""
  if (!userAgent.includes("vercel-cron")) {
    return Response.json({ ok: false }, { status: 403 })
  }

  const base = new URL(request.url).origin

  await Promise.allSettled([
    fetch(`${base}/api/public/checkin-settings`, { method: "GET" }),
    fetch(base, { method: "GET" }),
  ])

  return Response.json({ ok: true, warmed: true })
}
