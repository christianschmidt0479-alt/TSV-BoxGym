import { randomUUID } from "crypto"
import { createClient } from "@supabase/supabase-js"

const APPLY_MODE = process.argv.includes("--apply")
const PAGE_SIZE = 200

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing ${name}`)
  }
  return value
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase()
}

function buildRandomPassword() {
  return `${randomUUID()}Aa9!`
}

async function listAllAuthUsers(supabase) {
  const users = []

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    })

    if (error) throw error
    users.push(...data.users)

    if (data.users.length < PAGE_SIZE) {
      break
    }
  }

  return users
}

async function main() {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY")

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data: members, error: membersError } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, email_verified, auth_user_id, base_group, guardian_name")
    .is("auth_user_id", null)
    .order("created_at", { ascending: true })

  if (membersError) throw membersError

  const emailCounts = new Map()
  for (const member of members ?? []) {
    const email = normalizeEmail(member.email)
    if (!email) continue
    emailCounts.set(email, (emailCounts.get(email) || 0) + 1)
  }

  const duplicateEmails = new Set(
    Array.from(emailCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([email]) => email)
  )

  const eligibleMembers = (members ?? []).filter((member) => {
    const email = normalizeEmail(member.email)
    return email && !duplicateEmails.has(email)
  })

  const skippedMembers = (members ?? []).filter((member) => {
    const email = normalizeEmail(member.email)
    return !email || duplicateEmails.has(email)
  })

  const authUsers = await listAllAuthUsers(supabase)
  const authUsersByEmail = new Map(
    authUsers
      .filter((user) => normalizeEmail(user.email))
      .map((user) => [normalizeEmail(user.email), user])
  )

  const summary = {
    applyMode: APPLY_MODE,
    totalMissingAuthLink: members?.length ?? 0,
    eligibleCount: eligibleMembers.length,
    skippedCount: skippedMembers.length,
    createdUsers: 0,
    reusedUsers: 0,
    linkedMembers: 0,
    skipped: skippedMembers.map((member) => ({
      id: member.id,
      email: member.email,
      reason: !normalizeEmail(member.email)
        ? member.base_group === "Boxzwerge"
          ? "child_without_member_login"
          : "missing_email"
        : "duplicate_email",
    })),
    linked: [],
  }

  for (const member of eligibleMembers) {
    const normalizedEmail = normalizeEmail(member.email)
    let authUser = authUsersByEmail.get(normalizedEmail) ?? null

    if (APPLY_MODE) {
      if (!authUser) {
        const { data, error } = await supabase.auth.admin.createUser({
          email: normalizedEmail,
          password: buildRandomPassword(),
          email_confirm: member.email_verified === true,
          user_metadata: {
            backfilled_member_id: member.id,
            backfill_source: "scripts/backfill-member-auth-users.mjs",
          },
        })

        if (error) throw error
        authUser = data.user ?? null
        if (!authUser) {
          throw new Error(`Failed to create auth user for ${normalizedEmail}`)
        }
        authUsersByEmail.set(normalizedEmail, authUser)
        summary.createdUsers += 1
      } else {
        const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, {
          email: normalizedEmail,
          ...(member.email_verified === true ? { email_confirm: true } : {}),
        })

        if (error) throw error
        authUser = data.user ?? authUser
        authUsersByEmail.set(normalizedEmail, authUser)
        summary.reusedUsers += 1
      }

      const { error: updateError } = await supabase
        .from("members")
        .update({ auth_user_id: authUser.id })
        .eq("id", member.id)

      if (updateError) throw updateError
      summary.linkedMembers += 1
    } else if (authUser) {
      summary.reusedUsers += 1
    }

    summary.linked.push({
      id: member.id,
      email: normalizedEmail,
      authUserId: authUser?.id ?? null,
      action: authUser ? "reuse_or_link" : "create",
    })
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})