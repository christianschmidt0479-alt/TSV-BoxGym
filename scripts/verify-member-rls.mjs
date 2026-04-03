import { randomUUID } from "crypto"
import { createClient } from "@supabase/supabase-js"

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing ${name}`)
  }
  return value
}

function getAnonKey() {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!value) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  }

  return value
}

function buildTemporaryPassword() {
  return `Rls-${randomUUID()}-Aa9!`
}

async function main() {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = getAnonKey()
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data: candidates, error: candidatesError } = await admin
    .from("members")
    .select("id, email, auth_user_id")
    .not("auth_user_id", "is", null)
    .eq("email_verified", true)
    .order("created_at", { ascending: true })
    .limit(2)

  if (candidatesError) throw candidatesError
  if (!candidates || candidates.length < 2) {
    throw new Error("Need at least two linked members to verify RLS")
  }

  const ownMember = candidates[0]
  const otherMember = candidates[1]
  const temporaryPassword = buildTemporaryPassword()
  const resetPassword = buildTemporaryPassword()

  const { error: setPasswordError } = await admin.auth.admin.updateUserById(ownMember.auth_user_id, {
    password: temporaryPassword,
    email_confirm: true,
  })
  if (setPasswordError) throw setPasswordError

  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  try {
    const { data: authData, error: signInError } = await client.auth.signInWithPassword({
      email: ownMember.email,
      password: temporaryPassword,
    })
    if (signInError) throw signInError

    const accessToken = authData.session?.access_token
    if (!accessToken) {
      throw new Error("Missing access token after sign-in")
    }

    const ownResponse = await fetch(`${supabaseUrl}/rest/v1/members?select=id,email,auth_user_id&id=eq.${ownMember.id}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })
    const ownRows = await ownResponse.json()

    const otherResponse = await fetch(`${supabaseUrl}/rest/v1/members?select=id,email,auth_user_id&id=eq.${otherMember.id}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })
    const otherRows = await otherResponse.json()

    console.log(
      JSON.stringify(
        {
          testedMemberId: ownMember.id,
          testedEmail: ownMember.email,
          ownSelectStatus: ownResponse.status,
          ownSelectCount: Array.isArray(ownRows) ? ownRows.length : -1,
          otherSelectStatus: otherResponse.status,
          otherSelectCount: Array.isArray(otherRows) ? otherRows.length : -1,
          passed: ownResponse.status === 200 && Array.isArray(ownRows) && ownRows.length === 1 && otherResponse.status === 200 && Array.isArray(otherRows) && otherRows.length === 0,
        },
        null,
        2,
      )
    )
  } finally {
    const { error: cleanupError } = await admin.auth.admin.updateUserById(ownMember.auth_user_id, {
      password: resetPassword,
      email_confirm: true,
    })
    if (cleanupError) {
      console.error(cleanupError)
      process.exitCode = 1
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})