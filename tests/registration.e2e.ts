const fs = require("fs")
const { createClient } = require("@supabase/supabase-js")

type RegistrationPayload = {
  firstName: string
  lastName: string
  birthDate: string
  gender: string
  password: string
  email: string
  phone: string
  baseGroup: string
  consent: boolean
  registrationType: "member" | "trial"
}

type RegistrationResponse = {
  ok?: boolean
  mailSent?: boolean
  error?: string
  memberId?: string
}

type MemberDbRow = {
  id: string
  first_name: string
  last_name: string
  birthdate: string
  gender: string
  email: string
  phone: string
  base_group: string
  is_trial: boolean
  is_approved: boolean
  member_phase: "member" | "trial" | "extended" | string | null
}

function loadEnvFile(path: string) {
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator < 0) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnvFile(".env.local")

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000"
const ORIGIN = BASE_URL
const timestamp = Date.now()
const timestampSuffix = timestamp.toString(36).replace(/[^a-z]/gi, "").slice(-8) || "test"

const memberTest: RegistrationPayload = {
  firstName: "Test",
  lastName: `Mitglied${timestampSuffix}`,
  birthDate: "1998-04-12",
  gender: "male",
  password: `TestPass!${timestamp}`,
  email: `test.member.${timestamp}@example.com`,
  phone: "+491701234567",
  baseGroup: "Basic Ü18",
  consent: true,
  registrationType: "member",
}

const trialTest: RegistrationPayload = {
  firstName: "Test",
  lastName: `Probe${timestampSuffix}`,
  birthDate: "2001-08-22",
  gender: "female",
  password: `TrialPass!${timestamp}`,
  email: `test.probe.${timestamp}@example.com`,
  phone: "+491709876543",
  baseGroup: "Basic Ü18",
  consent: true,
  registrationType: "trial",
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function register(payload: RegistrationPayload): Promise<{ response: Response; json: RegistrationResponse }> {
  const response = await fetch(`${BASE_URL}/api/public/member-register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      Referer: `${ORIGIN}/registrieren`,
    },
    body: JSON.stringify(payload),
  })

  const json = await response.json()
  return { response, json }
}

async function fetchRowByEmail(supabase: ReturnType<typeof createClient>, email: string): Promise<MemberDbRow | null> {
  const result = await supabase
    .from("members")
    .select("id, first_name, last_name, birthdate, gender, email, phone, base_group, is_trial, is_approved, member_phase")
    .eq("email", email)
    .maybeSingle()

  if (result.error) {
    throw new Error(`DB fetch failed for ${email}: ${result.error.message}`)
  }

  return result.data
}

async function main() {
  assert(process.env.NEXT_PUBLIC_SUPABASE_URL, "Missing NEXT_PUBLIC_SUPABASE_URL")
  assert(process.env.SUPABASE_SERVICE_ROLE_KEY, "Missing SUPABASE_SERVICE_ROLE_KEY")

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const createdMemberIds: string[] = []

  try {
    const memberResult = await register(memberTest)
    assert(memberResult.response.ok, `Member registration failed: ${memberResult.response.status} ${JSON.stringify(memberResult.json)}`)
    assert(memberResult.json.ok === true, `Member registration payload not ok: ${JSON.stringify(memberResult.json)}`)
    assert(memberResult.json.memberId, `Member registration missing memberId: ${JSON.stringify(memberResult.json)}`)
    createdMemberIds.push(memberResult.json.memberId)

    const trialResult = await register(trialTest)
    assert(trialResult.response.ok, `Trial registration failed: ${trialResult.response.status} ${JSON.stringify(trialResult.json)}`)
    assert(trialResult.json.ok === true, `Trial registration payload not ok: ${JSON.stringify(trialResult.json)}`)
    assert(trialResult.json.memberId, `Trial registration missing memberId: ${JSON.stringify(trialResult.json)}`)
    createdMemberIds.push(trialResult.json.memberId)

    const memberDbRow = await fetchRowByEmail(supabase, memberTest.email)
    const trialDbRow = await fetchRowByEmail(supabase, trialTest.email)

    assert(memberDbRow, "Mitglied nicht in DB gefunden")
    assert(trialDbRow, "Probemitglied nicht in DB gefunden")

    assert(memberDbRow.first_name === memberTest.firstName, `Member first_name mismatch: ${JSON.stringify(memberDbRow)}`)
    assert(memberDbRow.last_name === memberTest.lastName, `Member last_name mismatch: ${JSON.stringify(memberDbRow)}`)
    assert(memberDbRow.birthdate === memberTest.birthDate, `Member birthdate mismatch: ${JSON.stringify(memberDbRow)}`)
    assert(memberDbRow.gender === memberTest.gender, `Member gender mismatch: ${JSON.stringify(memberDbRow)}`)
    assert(memberDbRow.email === memberTest.email, `Member email mismatch: ${JSON.stringify(memberDbRow)}`)
    assert(memberDbRow.phone === memberTest.phone, `Member phone mismatch: ${JSON.stringify(memberDbRow)}`)
    assert(memberDbRow.base_group === memberTest.baseGroup, `Member base_group mismatch: ${JSON.stringify(memberDbRow)}`)
    assert(memberDbRow.member_phase === "member", `Member DB phase mismatch: ${JSON.stringify(memberDbRow)}`)
    assert(memberDbRow.is_trial === false, `Member DB is_trial mismatch: ${JSON.stringify(memberDbRow)}`)

    assert(trialDbRow.first_name === trialTest.firstName, `Trial first_name mismatch: ${JSON.stringify(trialDbRow)}`)
    assert(trialDbRow.last_name === trialTest.lastName, `Trial last_name mismatch: ${JSON.stringify(trialDbRow)}`)
    assert(trialDbRow.birthdate === trialTest.birthDate, `Trial birthdate mismatch: ${JSON.stringify(trialDbRow)}`)
    assert(trialDbRow.gender === trialTest.gender, `Trial gender mismatch: ${JSON.stringify(trialDbRow)}`)
    assert(trialDbRow.email === trialTest.email, `Trial email mismatch: ${JSON.stringify(trialDbRow)}`)
    assert(trialDbRow.phone === trialTest.phone, `Trial phone mismatch: ${JSON.stringify(trialDbRow)}`)
    assert(trialDbRow.base_group === trialTest.baseGroup, `Trial base_group mismatch: ${JSON.stringify(trialDbRow)}`)
    assert(trialDbRow.member_phase === "trial", `Trial DB phase mismatch: ${JSON.stringify(trialDbRow)}`)
    assert(trialDbRow.is_trial === true, `Trial DB is_trial mismatch: ${JSON.stringify(trialDbRow)}`)
    assert(trialDbRow.is_approved === false, `Trial DB is_approved mismatch: ${JSON.stringify(trialDbRow)}`)

    console.log("✔ Öffentlicher Mitglieds-/Probe-Registrierungsflow funktioniert")
    console.log("✔ DB-Zustand fuer member_phase/is_trial/is_approved korrekt")
  } finally {
    if (process.env.REGISTRATION_E2E_CLEANUP === "false") {
      console.log("ℹ Cleanup uebersprungen (REGISTRATION_E2E_CLEANUP=false)")
      return
    }

    for (const memberId of createdMemberIds) {
      try {
        const response = await supabase.from("members").delete().eq("id", memberId)
        if (response.error) {
          console.warn(`Cleanup failed for ${memberId}: ${response.error.message}`)
        }
      } catch (error) {
        console.warn(`Cleanup failed for ${memberId}:`, error)
      }
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
