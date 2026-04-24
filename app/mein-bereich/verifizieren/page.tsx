import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { createHash } from "crypto"

type VerifyPageProps = {
  searchParams: Promise<{ token?: string }>
}

type VerifyResult = {
  ok: boolean
  message: string
}

function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

async function wasTokenAlreadyConsumed(tokenHash: string): Promise<boolean> {
  const supabase = createServerSupabaseServiceClient()

  const { data, error } = await supabase
    .from("members")
    .select("id")
    .eq("email_verified", true)
    .is("email_verification_token", null)
    .not("email_verification_consumed_at", "is", null)
    .eq("email_verification_consumed_token_hash", tokenHash)
    .limit(1)
    .maybeSingle()

  return !error && Boolean(data)
}

async function verifyEmailToken(rawToken: string): Promise<VerifyResult> {
  const token = rawToken.trim()
  const tokenHash = hashVerificationToken(token)
  if (!token) {
    return { ok: false, message: "Link ungültig oder abgelaufen" }
  }

  const supabase = createServerSupabaseServiceClient()

  const { data: member, error: findError } = await supabase
    .from("members")
    .select("id, email_verification_expires_at")
    .eq("email_verification_token", token)
    .maybeSingle()

  if (findError) {
    return { ok: false, message: "Link ungültig oder abgelaufen" }
  }

  if (!member) {
    const tokenAlreadyConsumed = await wasTokenAlreadyConsumed(tokenHash)
    if (tokenAlreadyConsumed) {
      return { ok: true, message: "Deine E-Mail wurde bereits bestätigt" }
    }

    return { ok: false, message: "Link ungültig oder abgelaufen" }
  }

  const expiresAt = member.email_verification_expires_at
  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : Number.NaN
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return { ok: false, message: "Link ungültig oder abgelaufen" }
  }

  const { data: updated, error: updateError } = await supabase
    .from("members")
    .update({
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      email_verification_token: null,
      email_verification_expires_at: null,
      email_verification_consumed_at: new Date().toISOString(),
      email_verification_consumed_token_hash: tokenHash,
    })
    .eq("id", member.id)
    .eq("email_verification_token", token)
    .select("id")
    .maybeSingle()

  if (updateError) {
    return { ok: false, message: "Link ungültig oder abgelaufen" }
  }

  if (!updated) {
    const tokenAlreadyConsumed = await wasTokenAlreadyConsumed(tokenHash)
    if (tokenAlreadyConsumed) {
      return { ok: true, message: "Deine E-Mail wurde bereits bestätigt" }
    }

    return { ok: false, message: "Link ungültig oder abgelaufen" }
  }

  return { ok: true, message: "Deine E-Mail wurde erfolgreich bestätigt" }
}

export default async function MemberVerifyPage({ searchParams }: VerifyPageProps) {
  const params = await searchParams
  const token = params.token ?? ""
  const result = await verifyEmailToken(token)

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900">E-Mail-Verifikation</h1>
        <p className={`mt-4 text-sm ${result.ok ? "text-green-700" : "text-red-700"}`}>
          {result.message}
        </p>
      </div>
    </div>
  )
}
