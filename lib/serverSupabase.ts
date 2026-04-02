import { createClient } from "@supabase/supabase-js"

function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!value) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")
  }
  return value
}

function getSupabaseAnonKey() {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!value) {
    throw new Error("Missing public Supabase key")
  }

  return value
}

function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ""
}

export function createServerSupabaseAnonClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey())
}

export function createServerSupabaseServiceClient() {
  const serviceRoleKey = getSupabaseServiceRoleKey()
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY")
  }

  return createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export function hasSupabaseServiceRoleKey() {
  return Boolean(getSupabaseServiceRoleKey())
}
