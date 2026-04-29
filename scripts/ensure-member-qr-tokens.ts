import fs from "fs/promises"
import path from "path"
import { createClient } from "@supabase/supabase-js"
// @ts-ignore Node strip-types runtime resolves the explicit .ts extension.
import { generateMemberQrToken } from "../lib/memberQrToken.ts"

type MemberRow = {
  id: string
  member_qr_token: string | null
  member_qr_active: boolean | null
}

type QrStats = {
  totalMembers: number
  missingTokenCount: number
  emptyTokenCount: number
  missingOrEmptyTokenCount: number
  duplicateTokenCount: number
  duplicateTokenValues: string[]
  inactiveTokenCount: number
  nullActiveCount: number
}

const PAGE_SIZE = 1000

function normalizeToken(value: string | null | undefined): string {
  return (value ?? "").trim()
}

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) {
    return null
  }

  const equalsIndex = trimmed.indexOf("=")
  if (equalsIndex <= 0) {
    return null
  }

  const key = trimmed.slice(0, equalsIndex).trim()
  if (!key) {
    return null
  }

  let value = trimmed.slice(equalsIndex + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return [key, value]
}

async function loadLocalEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env.local")

  try {
    const content = await fs.readFile(envPath, "utf8")
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line)
      if (!parsed) {
        continue
      }

      const [key, value] = parsed
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // .env.local is optional in CI; required vars may already be provided by shell env.
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required env variable: ${name}`)
  }

  return value
}

function computeStats(rows: MemberRow[]): QrStats {
  let missingTokenCount = 0
  let emptyTokenCount = 0
  let inactiveTokenCount = 0
  let nullActiveCount = 0

  const tokenMap = new Map<string, number>()

  for (const row of rows) {
    const raw = row.member_qr_token
    if (raw == null) {
      missingTokenCount += 1
    }

    const token = normalizeToken(raw)
    if (raw != null && token.length === 0) {
      emptyTokenCount += 1
    }

    if (token) {
      tokenMap.set(token, (tokenMap.get(token) ?? 0) + 1)
    }

    if (row.member_qr_active === false) {
      inactiveTokenCount += 1
    }

    if (row.member_qr_active == null) {
      nullActiveCount += 1
    }
  }

  const duplicateTokenValues = Array.from(tokenMap.entries())
    .filter(([, count]) => count > 1)
    .map(([token]) => token)

  return {
    totalMembers: rows.length,
    missingTokenCount,
    emptyTokenCount,
    missingOrEmptyTokenCount: missingTokenCount + emptyTokenCount,
    duplicateTokenCount: duplicateTokenValues.length,
    duplicateTokenValues,
    inactiveTokenCount,
    nullActiveCount,
  }
}

async function fetchAllMembers(): Promise<MemberRow[]> {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const members: MemberRow[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from("members")
      .select("id, member_qr_token, member_qr_active")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      throw error
    }

    const batch = (data ?? []) as MemberRow[]
    members.push(...batch)

    if (batch.length < PAGE_SIZE) {
      break
    }

    offset += PAGE_SIZE
  }

  return members
}

function printStats(title: string, stats: QrStats) {
  console.log(`\n=== ${title} ===`)
  console.log(`Mitglieder gesamt: ${stats.totalMembers}`)
  console.log(`Ohne member_qr_token (NULL): ${stats.missingTokenCount}`)
  console.log(`Mit leerem member_qr_token: ${stats.emptyTokenCount}`)
  console.log(`Fehlende Tokens gesamt (NULL + leer): ${stats.missingOrEmptyTokenCount}`)
  console.log(`Doppelte member_qr_token: ${stats.duplicateTokenCount}`)
  console.log(`member_qr_active = false: ${stats.inactiveTokenCount}`)
  console.log(`member_qr_active IS NULL: ${stats.nullActiveCount}`)
}

async function ensureMemberQrTokens(apply: boolean) {
  await loadLocalEnvFile()

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const membersBefore = await fetchAllMembers()
  const before = computeStats(membersBefore)
  printStats("Analyse vorher", before)

  const missingMembers = membersBefore.filter((row) => normalizeToken(row.member_qr_token).length === 0)
  const knownTokens = new Set(
    membersBefore
      .map((row) => normalizeToken(row.member_qr_token))
      .filter((token) => token.length > 0)
  )

  if (!apply) {
    console.log("\nDry-run: keine Änderungen durchgeführt (nutze --apply für Reparatur).")
    return {
      before,
      generatedCount: 0,
      updatedRows: 0,
      after: before,
    }
  }

  let generatedCount = 0
  let updatedRows = 0

  for (const member of missingMembers) {
    let nextToken = ""

    do {
      nextToken = generateMemberQrToken()
    } while (knownTokens.has(nextToken))

    knownTokens.add(nextToken)

    const updatePayload: { member_qr_token: string; member_qr_active?: boolean } = {
      member_qr_token: nextToken,
    }

    if (member.member_qr_active == null) {
      updatePayload.member_qr_active = true
    }

    let lastError: unknown = null
    let updated = false

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { error } = await supabase
        .from("members")
        .update(updatePayload)
        .eq("id", member.id)

      if (!error) {
        updated = true
        break
      }

      const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase()
      const isUniqueViolation = error.code === "23505" || message.includes("unique")
      if (!isUniqueViolation) {
        lastError = error
        break
      }

      do {
        nextToken = generateMemberQrToken()
      } while (knownTokens.has(nextToken))

      knownTokens.add(nextToken)
      updatePayload.member_qr_token = nextToken
      lastError = error
    }

    if (!updated) {
      throw new Error(`Update fehlgeschlagen für member ${member.id}: ${JSON.stringify(lastError)}`)
    }

    generatedCount += 1
    updatedRows += 1
  }

  const membersAfter = await fetchAllMembers()
  const after = computeStats(membersAfter)
  printStats("Analyse nach Reparatur", after)

  console.log("\n=== Reparatur ===")
  console.log(`Neu generierte Tokens: ${generatedCount}`)
  console.log(`Aktualisierte Mitglieder-Zeilen: ${updatedRows}`)

  return {
    before,
    generatedCount,
    updatedRows,
    after,
  }
}

async function main() {
  const apply = process.argv.includes("--apply")
  const result = await ensureMemberQrTokens(apply)

  console.log("\n=== Zusammenfassung ===")
  console.log(`Mitglieder gesamt: ${result.after.totalMembers}`)
  console.log(`Fehlende Tokens vorher: ${result.before.missingOrEmptyTokenCount}`)
  console.log(`Neu generierte Tokens: ${result.generatedCount}`)
  console.log(`Fehlende Tokens nachher: ${result.after.missingOrEmptyTokenCount}`)
  console.log(`Doppelte Tokens nachher: ${result.after.duplicateTokenCount}`)
  console.log(`member_qr_active = false: ${result.after.inactiveTokenCount}`)
}

void main().catch((error) => {
  console.error("ensure-member-qr-tokens failed", error)
  process.exit(1)
})
