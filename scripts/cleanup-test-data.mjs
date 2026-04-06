/**
 * cleanup-test-data.mjs
 *
 * Identifies and removes test data from members, trainer_accounts and
 * member_update_tokens tables.  Real/productive records are never touched.
 *
 * Usage:
 *   node scripts/cleanup-test-data.mjs            # dry-run  (default)
 *   node scripts/cleanup-test-data.mjs --apply    # execute deletions
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const APPLY = process.argv.includes("--apply")

/**
 * E-mail patterns that identify a test account.
 * All comparisons are lower-case.
 */
const TEST_EMAIL_PATTERNS = [
  "@tsvboxgym.de",           // all internal test mails (real prod domain is tsvboxgym.de but sent to @tsvboxgym.de addresses that are never real member inboxes)
  "@tsv-falkensee.de",       // internal placeholder domain used in fixtures
  "e2e.",                    // all e2e runner addresses
  "+test",                   // plus-aliased test addresses
  "+e2e",
  "+reg",
  "+diag",
  "+update",
  "+flow",
  "+public",
  "test@",
  "example@",
  "example.",
  "+member-update",
  "+member-update-public",
  "internal.trainer.test",
  "trainer.test",
  "dummy@",
  "dummy.",
  "tester@",
]

/**
 * First- or last-name fragments that indicate test records.
 * Only applied when the e-mail also matches a test pattern.
 */
const TEST_NAME_PATTERNS = [
  "test",
  "dummy",
  "beispiel",
  "fixture",
  "e2e",
  "provision",
]

/**
 * Real admin accounts that must never be touched, no matter what their
 * e-mail looks like.
 */
const PROTECTED_EMAILS = [
  "christian.schmidt@tsv-falkensee.de",
  "chr.schmidt79@web.de",
]

// ---------------------------------------------------------------------------
// Env helpers (same pattern as other scripts in this repo)
// ---------------------------------------------------------------------------

function readEnvFile(path) {
  if (!fs.existsSync(path)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=")
        if (index === -1) return null
        const key = line.slice(0, index).trim()
        let value = line.slice(index + 1).trim()
        // Strip surrounding quotes added by Vercel CLI or other tools
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        return [key, value]
      })
      .filter(Boolean)
  )
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing env var: ${name}`)
  }
  return value
}

// Merge .env.local into process.env (doesn't overwrite already-set vars)
const dotenv = readEnvFile(".env.local")
for (const [key, value] of Object.entries(dotenv)) {
  process.env[key] ??= value
}

// ---------------------------------------------------------------------------
// Classifier helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the e-mail looks like a test address.
 */
function isTestEmail(email) {
  if (!email) return false
  const lc = email.toLowerCase().trim()
  return TEST_EMAIL_PATTERNS.some((pattern) => lc.includes(pattern))
}

/**
 * Returns true for combined first+last names that clearly belong to a test record.
 */
function isTestName(firstName, lastName, name) {
  const combined = `${firstName ?? ""} ${lastName ?? ""} ${name ?? ""}`.toLowerCase()
  return TEST_NAME_PATTERNS.some((pattern) => combined.includes(pattern))
}

/**
 * Returns true when the record is protected (real admin / important account).
 */
function isProtected(email) {
  if (!email) return false
  const lc = email.toLowerCase().trim()
  return PROTECTED_EMAILS.some((protected_) => lc === protected_.toLowerCase())
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

const log = {
  found: [],
  deleted: [],
  skipped: [],
}

function logFound(table, id, email, reason) {
  log.found.push({ table, id, email, reason })
}

function logDeleted(table, id, email) {
  log.deleted.push({ table, id, email })
}

function logSkipped(table, id, email, reason) {
  log.skipped.push({ table, id, email, reason })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY")

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  console.log(`\nMode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`)

  // ─── 1. MEMBERS ──────────────────────────────────────────────────────────

  const { data: members, error: membersError } = await supabase
    .from("members")
    .select("id, email, first_name, last_name, name, is_approved, auth_user_id")
    .order("created_at", { ascending: true })

  if (membersError) throw membersError

  const testMembers = []

  for (const member of members ?? []) {
    const email = member.email?.toLowerCase().trim() ?? ""

    if (isProtected(email)) {
      logSkipped("members", member.id, email, "protected account")
      continue
    }

    const emailMatches = isTestEmail(email)
    const nameMatches = isTestName(member.first_name, member.last_name, member.name)

    if (emailMatches || nameMatches) {
      const reason = emailMatches ? `test email (${email})` : `test name`
      logFound("members", member.id, email, reason)
      testMembers.push(member)
    } else {
      logSkipped("members", member.id, email, "looks like a real member")
    }
  }

  // Delete member_update_tokens for test members first (FK constraint)
  const testMemberIds = testMembers.map((m) => m.id)

  if (testMemberIds.length > 0) {
    const { data: tokens, error: tokensError } = await supabase
      .from("member_update_tokens")
      .select("id, member_id, token")
      .in("member_id", testMemberIds)

    if (tokensError && !tokensError.message?.includes("does not exist")) {
      throw tokensError
    }

    for (const tokenRow of tokens ?? []) {
      logFound("member_update_tokens", tokenRow.id, `member_id=${tokenRow.member_id}`, "belongs to test member")
      if (APPLY) {
        const { error } = await supabase
          .from("member_update_tokens")
          .delete()
          .eq("id", tokenRow.id)
        if (error) throw error
        logDeleted("member_update_tokens", tokenRow.id, `member_id=${tokenRow.member_id}`)
      }
    }

    // Delete test members
    for (const member of testMembers) {
      const email = member.email?.toLowerCase().trim() ?? ""
      if (APPLY) {
        const { error } = await supabase
          .from("members")
          .delete()
          .eq("id", member.id)
        if (error) {
          logSkipped("members", member.id, email, `delete error: ${error.message}`)
          continue
        }
        logDeleted("members", member.id, email)
      }
    }
  }

  // ─── 2. TRAINER ACCOUNTS ──────────────────────────────────────────────────

  const { data: trainers, error: trainersError } = await supabase
    .from("trainer_accounts")
    .select("id, email, first_name, last_name, is_approved, role")
    .order("created_at", { ascending: true })

  if (trainersError) throw trainersError

  for (const trainer of trainers ?? []) {
    const email = trainer.email?.toLowerCase().trim() ?? ""

    if (isProtected(email)) {
      logSkipped("trainer_accounts", trainer.id, email, "protected account")
      continue
    }

    const emailMatches = isTestEmail(email)
    const nameMatches = isTestName(trainer.first_name, trainer.last_name, null)

    if (emailMatches || nameMatches) {
      const reason = emailMatches ? `test email (${email})` : `test name`
      logFound("trainer_accounts", trainer.id, email, reason)

      if (APPLY) {
        const { error } = await supabase
          .from("trainer_accounts")
          .delete()
          .eq("id", trainer.id)
        if (error) {
          logSkipped("trainer_accounts", trainer.id, email, `delete error: ${error.message}`)
          continue
        }
        logDeleted("trainer_accounts", trainer.id, email)
      }
    } else {
      logSkipped("trainer_accounts", trainer.id, email, "looks like a real trainer")
    }
  }

  // ─── 3. Orphaned member_update_tokens ─────────────────────────────────────
  // Any tokens whose member was already deleted (or never existed) are also cleaned up.

  const { data: allTokens, error: allTokensError } = await supabase
    .from("member_update_tokens")
    .select("id, member_id, token, used, expires_at")

  if (allTokensError && !allTokensError.message?.includes("does not exist")) {
    throw allTokensError
  }

  if (allTokens && allTokens.length > 0) {
    const remainingMemberIds = new Set((members ?? []).map((m) => m.id))

    for (const tokenRow of allTokens) {
      // Skip tokens already scheduled for deletion above
      if (testMemberIds.includes(tokenRow.member_id)) continue

      if (!remainingMemberIds.has(tokenRow.member_id)) {
        logFound("member_update_tokens", tokenRow.id, `member_id=${tokenRow.member_id}`, "orphaned (member deleted)")
        if (APPLY) {
          const { error } = await supabase
            .from("member_update_tokens")
            .delete()
            .eq("id", tokenRow.id)
          if (error) {
            logSkipped("member_update_tokens", tokenRow.id, `member_id=${tokenRow.member_id}`, `delete error: ${error.message}`)
            continue
          }
          logDeleted("member_update_tokens", tokenRow.id, `member_id=${tokenRow.member_id}`)
        }
      }
    }
  }

  // ─── 4. Summary ───────────────────────────────────────────────────────────

  console.log("=".repeat(60))
  console.log("Gefundene Testdatensätze:", log.found.length)
  if (log.found.length > 0) {
    for (const entry of log.found) {
      const action = APPLY ? "" : " (würde gelöscht)"
      console.log(`  [${entry.table}] ${entry.email} — ${entry.reason}${action}`)
    }
  }

  console.log()
  if (APPLY) {
    console.log("Entfernte Datensätze:", log.deleted.length)
    for (const entry of log.deleted) {
      console.log(`  [${entry.table}] ${entry.email}`)
    }
  } else {
    console.log("Entfernte Datensätze: 0 (dry-run)")
  }

  console.log()
  console.log("Übersprungene Datensätze:", log.skipped.filter((s) => s.reason !== "looks like a real member" && s.reason !== "looks like a real trainer").length)
  for (const entry of log.skipped) {
    if (entry.reason === "looks like a real member" || entry.reason === "looks like a real trainer") continue
    console.log(`  [${entry.table}] ${entry.email} — ${entry.reason}`)
  }

  console.log()
  if (!APPLY) {
    console.log("Hinweis: Dry-Run abgeschlossen. Zum Ausführen: node scripts/cleanup-test-data.mjs --apply")
  } else {
    console.log("Clean-up abgeschlossen.")
  }
  console.log("=".repeat(60))
}

main().catch((error) => {
  console.error("\nFehler:", error instanceof Error ? error.message : error)
  process.exit(1)
})
