import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase";

export async function POST(req: NextRequest) {
  const { memberId } = await req.json();
  if (!memberId) return NextResponse.json({ error: "Missing memberId" }, { status: 400 });

  const supabase = createServerSupabaseServiceClient();
  // Try to find existing, not expired token
  const { data: existing, error: findError } = await supabase
    .from("members")
    .select("email_verification_token, email_verification_expires_at")
    .eq("id", memberId)
    .maybeSingle();

  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });

  const now = Date.now();
  if (
    existing?.email_verification_token &&
    existing?.email_verification_expires_at &&
    new Date(existing.email_verification_expires_at).getTime() > now
  ) {
    return NextResponse.json({ token: existing.email_verification_token });
  }

  // Create new token
  const token = crypto.randomUUID();
  const expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const { error: updateError } = await supabase
    .from("members")
    .update({
      email_verification_token: token,
      email_verification_expires_at: expiresAt,
    })
    .eq("id", memberId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ token });
}
