import { createMember, findMemberByEmail, setMemberPin } from "../lib/boxgymDb"
import { createServerSupabaseServiceClient } from "../lib/serverSupabase"
import { hashTrainerPin } from "../lib/trainerPin"

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing ${name}`)
  }

  return value
}

function isMissingColumnError(error: { message?: string; details?: string; code?: string } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  return error?.code === "42703" || message.includes("does not exist") || message.includes("schema cache")
}

async function main() {
  const supabase = createServerSupabaseServiceClient()
  const now = new Date().toISOString()
  const memberEmail = getRequiredEnv("E2E_MEMBER_EMAIL")
  const memberPassword = getRequiredEnv("E2E_MEMBER_PASSWORD")
  const trainerEmail = getRequiredEnv("E2E_TRAINER_EMAIL")
  const trainerPassword = getRequiredEnv("E2E_TRAINER_PASSWORD")

  let member = (await findMemberByEmail(memberEmail)) as { id: string } | null
  if (!member) {
    member = (await createMember({
      first_name: "E2E",
      last_name: "Mitglied",
      birthdate: "1999-04-04",
      email: memberEmail,
      phone: "",
      is_trial: false,
      member_pin: memberPassword,
      is_approved: true,
      base_group: "Basic Ü18",
    })) as { id: string }
  }

  await setMemberPin(member.id, memberPassword)

  const memberUpdate = await supabase
    .from("members")
    .update({
      email: memberEmail,
      name: "E2E Mitglied",
      first_name: "E2E",
      last_name: "Mitglied",
      birthdate: "1999-04-04",
      is_trial: false,
      is_approved: true,
      base_group: "Basic Ü18",
      privacy_accepted_at: now,
      email_verified: true,
      email_verified_at: now,
    })
    .eq("id", member.id)

  if (memberUpdate.error && !isMissingColumnError(memberUpdate.error)) {
    throw memberUpdate.error
  }

  const passwordHash = await hashTrainerPin(trainerPassword)
  const trainerBasePayload = {
    first_name: "E2E",
    last_name: "Admin",
    email: trainerEmail,
    trainer_license: "Keine DOSB-Lizenz",
    password_hash: passwordHash,
    email_verified: true,
    email_verified_at: now,
    email_verification_token: null,
    is_approved: true,
    approved_at: now,
  }

  const existingTrainer = await supabase
    .from("trainer_accounts")
    .select("id")
    .eq("email", trainerEmail)
    .maybeSingle()

  if (existingTrainer.error) {
    throw existingTrainer.error
  }

  let trainerId = existingTrainer.data?.id as string | undefined

  if (!trainerId) {
    const insert = await supabase.from("trainer_accounts").insert([trainerBasePayload]).select("id").single()
    if (insert.error) {
      throw insert.error
    }

    trainerId = insert.data.id as string
  } else {
    const update = await supabase.from("trainer_accounts").update(trainerBasePayload).eq("id", trainerId)
    if (update.error) {
      throw update.error
    }
  }

  const trainerOptionalUpdate = await supabase
    .from("trainer_accounts")
    .update({ role: "admin", linked_member_id: member.id })
    .eq("id", trainerId)

  if (trainerOptionalUpdate.error && !isMissingColumnError(trainerOptionalUpdate.error)) {
    throw trainerOptionalUpdate.error
  }

  console.log(`member_email=${memberEmail}`)
  console.log(`trainer_email=${trainerEmail}`)
  console.log(`member_id=${member.id}`)
  console.log(`trainer_id=${trainerId}`)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})