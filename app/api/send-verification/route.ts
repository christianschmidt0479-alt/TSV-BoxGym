import { NextResponse } from "next/server"
import { sendVerificationEmail } from "@/lib/resendClient"

type SendVerificationBody = {
  email?: string
  name?: string
  link?: string
}

export async function GET() {
  const hasServerKey = Boolean(process.env.RESEND_API_KEY)
  const hasPublicFallback = Boolean(process.env.NEXT_PUBLIC_RESEND_API_KEY)
  const from = process.env.RESEND_FROM_EMAIL || "TSV BoxGym <onboarding@resend.dev>"

  return NextResponse.json({
    configured: hasServerKey || hasPublicFallback,
    using_server_key: hasServerKey,
    using_public_fallback: !hasServerKey && hasPublicFallback,
    from,
  })
}

export async function POST(request: Request) {
  try {
    const { email, name, link } = (await request.json()) as SendVerificationBody

    if (!email || !link) {
      return new NextResponse("Missing email or link", { status: 400 })
    }

    await sendVerificationEmail({ email, name, link })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("send-verification failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
