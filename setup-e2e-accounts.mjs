import nextEnv from "@next/env"
import { createClient } from "@supabase/supabase-js"
import { hash } from "bcryptjs"

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const BASE_URL = (process.env.E2E_BASE_URL || "https://www.tsvboxgym.de").trim().replace(/\/$/, "")

const MEMBER = {
  email: "e2e_member@test.local",
  password: "Test1234!",
  firstName: "E2E",
  lastName: "Member",
  registrationFirstName: "Ete",
}

const TRAINER = {
  email: "e2e_trainer@test.local",
  password: "Test1234!",
  firstName: "E2E",
  lastName: "Trainer",
}

function mustEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function createServiceClient() {
  const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY")
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function postJson(path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
      Referer: `${BASE_URL}/checkin`,
    },
    body: JSON.stringify(body),
  })

  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  return { ok: response.ok, status: response.status, text, json }
}

async function ensureMemberRegistration() {
  const payload = {
    firstName: MEMBER.registrationFirstName,
    lastName: MEMBER.lastName,
    birthDate: "1998-01-01",
    gender: "male",
    password: MEMBER.password,
    email: MEMBER.email,
    phone: "+491701234567",
    baseGroup: "Basic Ü18",
    consent: true,
    registrationType: "member",
  }

  const result = await postJson("/api/public/member-register", payload)
  if (result.ok || result.status === 409) {
    return {
      createdOrExists: true,
      viaApiStatus: result.status,
      viaApiBody: result.json || result.text || "",
    }
  }

  throw new Error(`member-register failed (${result.status}): ${result.text}`)
}

async function ensureTrainerRequestAccess() {
  const payload = {
    action: "request_access",
    firstName: TRAINER.firstName,
    lastName: TRAINER.lastName,
    email: TRAINER.email,
    phone: "+491709876543",
    gender: "male",
    birthdate: "1992-02-02",
    dosbLicense: "Keine / noch nicht vorhanden",
  }

  const result = await postJson("/api/public/trainer-access", payload)
  if (result.ok || result.status === 409) {
    return {
      createdOrExists: true,
      viaApiStatus: result.status,
      viaApiBody: result.json || result.text || "",
    }
  }

  throw new Error(`trainer-access request_access failed (${result.status}): ${result.text}`)
}

async function ensureMemberApproved(supabase) {
  const { data: existing, error: findError } = await supabase
    .from("members")
    .select("id, email, first_name, last_name")
    .eq("email", MEMBER.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (findError) throw findError
  if (!existing?.id) {
    throw new Error(`Member ${MEMBER.email} not found after registration`)
  }

  const memberPinHash = await hash(MEMBER.password.trim(), 10)

  const { error: updateError } = await supabase
    .from("members")
    .update({
      first_name: MEMBER.firstName,
      last_name: MEMBER.lastName,
      name: `${MEMBER.firstName} ${MEMBER.lastName}`,
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      email_verification_token: null,
      email_verification_expires_at: null,
      is_approved: true,
      privacy_accepted_at: new Date().toISOString(),
      member_pin: memberPinHash,
      base_group: "Basic Ü18",
      member_phase: "member",
      is_trial: false,
      trial_count: 0,
    })
    .eq("id", existing.id)

  if (updateError) throw updateError

  return { id: existing.id, email: MEMBER.email }
}

async function ensureTrainerApproved(supabase) {
  const { data: existing, error: findError } = await supabase
    .from("trainer_accounts")
    .select("id, email")
    .eq("email", TRAINER.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (findError) throw findError
  if (!existing?.id) {
    throw new Error(`Trainer ${TRAINER.email} not found after request_access`)
  }

  const passwordHash = await hash(TRAINER.password.trim(), 10)

  const { error: updateError } = await supabase
    .from("trainer_accounts")
    .update({
      first_name: TRAINER.firstName,
      last_name: TRAINER.lastName,
      role: "trainer",
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      email_verification_token: null,
      is_approved: true,
      approved_at: new Date().toISOString(),
      password_hash: passwordHash,
    })
    .eq("id", existing.id)

  if (updateError) throw updateError

  return { id: existing.id, email: TRAINER.email }
}

async function verifyTrainerLogin() {
  const result = await postJson("/api/trainer-login", {
    email: TRAINER.email,
    password: TRAINER.password,
  })

  return {
    ok: result.ok,
    status: result.status,
    body: result.json || result.text || "",
  }
}

async function verifyMemberLogin() {
  const result = await postJson("/api/public/member-area", {
    action: "member_login",
    email: MEMBER.email,
    password: MEMBER.password,
  })

  return {
    ok: result.ok,
    status: result.status,
    body: result.json || result.text || "",
  }
}

async function run() {
  const supabase = createServiceClient()

  const memberApi = await ensureMemberRegistration()
  const trainerApi = await ensureTrainerRequestAccess()
  const memberDb = await ensureMemberApproved(supabase)
  const trainerDb = await ensureTrainerApproved(supabase)

  const trainerLogin = await verifyTrainerLogin()
  const memberLogin = await verifyMemberLogin()

  const summary = {
    baseUrl: BASE_URL,
    memberApi,
    trainerApi,
    memberDb,
    trainerDb,
    trainerLogin,
    memberLogin,
  }

  console.log(JSON.stringify(summary, null, 2))

  if (!trainerLogin.ok || !memberLogin.ok) {
    process.exitCode = 1
  }
}

run().catch((error) => {
  console.error("setup-e2e-accounts failed", error)
  process.exitCode = 1
})
