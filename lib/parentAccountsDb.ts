import { supabase } from "./supabaseClient"
import { hashAuthSecret, isBcryptHash, verifyAuthSecret } from "./authSecret"

export const PARENT_SETUP_PENDING_HASH = "__parent_setup_pending__"

function isMissingTableError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find") ||
    message.includes("relation")
  )
}

export type ParentAccountRow = {
  id: string
  parent_name: string
  email: string
  phone?: string | null
  access_code_hash: string
  created_at?: string
  updated_at?: string
}

export type ParentChildLinkWithAccount = {
  member_id: string
  parent_account_id: string
  parent_accounts?: {
    id: string
    parent_name: string
    email: string
    phone?: string | null
  } | Array<{
    id: string
    parent_name: string
    email: string
    phone?: string | null
  }> | null
}

export async function getParentAccountByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase()

  const { data, error } = await supabase
    .from("parent_accounts")
    .select("id, parent_name, email, phone, access_code_hash, created_at, updated_at")
    .eq("email", normalizedEmail)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error("Die Elternkonten sind in der Datenbank noch nicht eingerichtet. Bitte zuerst supabase/parent_accounts.sql ausführen.")
    }

    throw error
  }

  return (data as ParentAccountRow | null) ?? null
}

export async function upsertParentAccount(input: {
  parent_name: string
  email: string
  phone?: string | null
  access_code_hash?: string
}) {
  const normalizedEmail = input.email.trim().toLowerCase()
  const existing = await getParentAccountByEmail(normalizedEmail)

  if (existing) {
    const nextAccessCodeHash =
      input.access_code_hash && !isBcryptHash(input.access_code_hash)
        ? await hashParentAccessCode(input.access_code_hash)
        : input.access_code_hash

    const { data, error } = await supabase
      .from("parent_accounts")
      .update({
        parent_name: input.parent_name.trim(),
        email: normalizedEmail,
        phone: input.phone?.trim() || null,
        ...(nextAccessCodeHash ? { access_code_hash: nextAccessCodeHash } : {}),
      })
      .eq("id", existing.id)
      .select("id, parent_name, email, phone, access_code_hash, created_at, updated_at")
      .single()

    if (error) throw error
    return data as ParentAccountRow
  }

  if (!input.access_code_hash) {
    throw new Error("Für neue Elternkonten wird ein Zugangscode benötigt.")
  }

  const { data, error } = await supabase
    .from("parent_accounts")
    .insert([
      {
        parent_name: input.parent_name.trim(),
        email: normalizedEmail,
        phone: input.phone?.trim() || null,
        access_code_hash: await hashParentAccessCode(input.access_code_hash),
      },
    ])
    .select("id, parent_name, email, phone, access_code_hash, created_at, updated_at")
    .single()

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error("Die Elternkonten sind in der Datenbank noch nicht eingerichtet. Bitte zuerst supabase/parent_accounts.sql ausführen.")
    }

    throw error
  }

  return data as ParentAccountRow
}

export async function linkParentAccountToMember(parentAccountId: string, memberId: string) {
  const { error: removeError } = await supabase
    .from("parent_child_links")
    .delete()
    .eq("member_id", memberId)

  if (removeError && !isMissingTableError(removeError)) throw removeError
  if (removeError && isMissingTableError(removeError)) {
    throw new Error("Die Eltern-Kind-Verknüpfung ist in der Datenbank noch nicht eingerichtet. Bitte zuerst supabase/parent_accounts.sql ausführen.")
  }

  const { data, error } = await supabase
    .from("parent_child_links")
    .insert([
      {
        parent_account_id: parentAccountId,
        member_id: memberId,
      },
    ])
    .select("*")
    .single()

  if (error) throw error
  return data
}

export async function unlinkParentAccountFromMember(memberId: string) {
  const { error } = await supabase
    .from("parent_child_links")
    .delete()
    .eq("member_id", memberId)

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error("Die Eltern-Kind-Verknüpfung ist in der Datenbank noch nicht eingerichtet. Bitte zuerst supabase/parent_accounts.sql ausführen.")
    }

    throw error
  }

  return true
}

export async function getParentLinksWithAccounts() {
  const { data, error } = await supabase
    .from("parent_child_links")
    .select(`
      member_id,
      parent_account_id,
      parent_accounts (
        id,
        parent_name,
        email,
        phone
      )
    `)

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error("Die Elternkonten sind in der Datenbank noch nicht eingerichtet. Bitte zuerst supabase/parent_accounts.sql ausführen.")
    }

    throw error
  }

  return ((data as unknown as ParentChildLinkWithAccount[] | null) ?? []).map((row) => ({
    ...row,
    parent_accounts: Array.isArray(row.parent_accounts) ? row.parent_accounts[0] ?? null : row.parent_accounts ?? null,
  }))
}

export async function getParentAccountByLogin(email: string, accessCodeHash: string) {
  const normalizedEmail = email.trim().toLowerCase()

  const { data, error } = await supabase
    .from("parent_accounts")
    .select("id, parent_name, email, phone, access_code_hash, created_at, updated_at")
    .eq("email", normalizedEmail)
    .order("updated_at", { ascending: false })
    .limit(5)

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error("Die Elternkonten sind in der Datenbank noch nicht eingerichtet. Bitte zuerst supabase/parent_accounts.sql ausführen.")
    }

    throw error
  }

  const rows = (data as ParentAccountRow[] | null) ?? []
  for (const row of rows) {
    if (await verifyParentAccessCode(accessCodeHash, row.access_code_hash)) {
      if (!isBcryptHash(row.access_code_hash)) {
        const nextHash = await hashParentAccessCode(accessCodeHash)
        await supabase.from("parent_accounts").update({ access_code_hash: nextHash }).eq("id", row.id)
        return {
          ...row,
          access_code_hash: nextHash,
        }
      }

      return row
    }
  }

  return null
}

export function isParentAccountSetupPending(parent: Pick<ParentAccountRow, "access_code_hash"> | null | undefined) {
  return parent?.access_code_hash === PARENT_SETUP_PENDING_HASH
}

export async function hashParentAccessCode(value: string) {
  return hashAuthSecret(value)
}

export async function verifyParentAccessCode(candidate: string, storedSecret: string) {
  return verifyAuthSecret(candidate, storedSecret)
}

export async function getChildrenForParent(parentAccountId: string) {
  const { data, error } = await supabase
    .from("parent_child_links")
    .select(`
      member_id,
      members (
        id,
        name,
        first_name,
        last_name,
        birthdate,
        email,
        phone,
        guardian_name,
        email_verified,
        email_verified_at,
        is_approved,
        base_group
      )
    `)
    .eq("parent_account_id", parentAccountId)

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error("Die Eltern-Kind-Verknüpfung ist in der Datenbank noch nicht eingerichtet. Bitte zuerst supabase/parent_accounts.sql ausführen.")
    }

    throw error
  }

  return data ?? []
}
