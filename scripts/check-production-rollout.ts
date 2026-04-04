import { createClient } from "@supabase/supabase-js"

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing ${name}`)
  }

  return value
}

const supabase = createClient(getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function checkColumns(table: string, columns: string[]) {
  const results: string[] = []

  for (const column of columns) {
    const { error } = await supabase.from(table).select(column).limit(1)
    results.push(`${column}=${error ? "no" : "yes"}`)
  }

  console.log(`${table} columns: ${results.join(", ")}`)
}

async function checkTable(table: string) {
  const { error } = await supabase.from(table).select("id").limit(1)
  console.log(`${table} table: ${error ? "no" : "yes"}`)
}

async function main() {
  await checkColumns("members", ["member_qr_token", "member_qr_active", "office_list_status", "office_list_group", "office_list_checked_at"])
  await checkColumns("checkins", ["checkin_mode"])
  await checkTable("admin_mailbox")
  await checkTable("trainer_accounts")
  await checkColumns("trainer_accounts", ["role", "linked_member_id"])
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})