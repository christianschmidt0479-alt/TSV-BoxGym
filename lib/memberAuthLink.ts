import { randomUUID } from "crypto"
import { createServerSupabaseServiceClient } from "./serverSupabase"

const AUTH_USER_PAGE_SIZE = 200
const AUTH_USER_MAX_PAGES = 10

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function buildFallbackPassword() {
  return `${randomUUID()}Aa9!`
}

function isMissingAuthUserIdColumnError(error: { message?: string; details?: string | null } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  return (
    (message.includes("column") && message.includes("auth_user_id") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("auth_user_id") && message.includes("column")) ||
    message.includes("schema cache")
  )
}

function isDuplicateAuthUserError(error: { message?: string; code?: string; status?: number } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return (
    error?.status === 422 ||
    error?.code === "email_exists" ||
    message.includes("already been registered") ||
    message.includes("already registered") ||
    message.includes("email exists")
  )
}

async function findAuthUserByEmail(email: string) {
  const supabase = createServerSupabaseServiceClient()

  for (let page = 1; page <= AUTH_USER_MAX_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: AUTH_USER_PAGE_SIZE,
    })

    if (error) throw error

    const user = data.users.find((candidate) => normalizeEmail(candidate.email ?? "") === email)
    if (user) {
      return user
    }

    if (data.users.length < AUTH_USER_PAGE_SIZE) {
      break
    }
  }

  return null
}

async function persistMemberAuthUserId(memberId: string, authUserId: string) {
  const supabase = createServerSupabaseServiceClient()
  const { error } = await supabase.from("members").update({ auth_user_id: authUserId }).eq("id", memberId)

  if (error) {
    if (isMissingAuthUserIdColumnError(error)) {
      return false
    }
    throw error
  }

  return true
}

type EnsureMemberAuthUserLinkInput = {
  memberId: string
  email?: string | null
  password?: string | null
  emailVerified?: boolean | null
}

export async function ensureMemberAuthUserLink(input: EnsureMemberAuthUserLinkInput) {
  const normalizedEmail = normalizeEmail(input.email ?? "")
  if (!normalizedEmail) {
    return null
  }

  const supabase = createServerSupabaseServiceClient()
  let user = await findAuthUserByEmail(normalizedEmail)

  if (user) {
    const updatePayload: { email?: string; password?: string; email_confirm?: boolean } = {
      email: normalizedEmail,
    }

    if (input.password?.trim()) {
      updatePayload.password = input.password.trim()
    }

    if (input.emailVerified === true) {
      updatePayload.email_confirm = true
    }

    const { data, error } = await supabase.auth.admin.updateUserById(user.id, updatePayload)
    if (error) throw error
    user = data.user ?? user
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: input.password?.trim() || buildFallbackPassword(),
      email_confirm: input.emailVerified === true,
    })

    if (error) {
      if (!isDuplicateAuthUserError(error)) {
        throw error
      }

      user = await findAuthUserByEmail(normalizedEmail)
      if (!user) {
        throw error
      }
    } else {
      user = data.user ?? null
    }
  }

  if (!user) {
    return null
  }

  await persistMemberAuthUserId(input.memberId, user.id)
  return user.id
}