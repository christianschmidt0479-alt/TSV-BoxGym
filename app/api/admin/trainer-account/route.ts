import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { createTrainerAccount, isTrainerAccountEmailConflict, type TrainerLicense } from "@/lib/trainerDb"
import { validateEmail } from "@/lib/formValidation"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { sendVerificationEmail } from "@/lib/resendClient"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { isTrainerPinCompliant, TRAINER_PIN_REQUIREMENTS_MESSAGE } from "@/lib/trainerPin"
import { normalizeTrainerLicense } from "@/lib/trainerLicense"

type AdminTrainerAccountBody = {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  trainerLicense?: TrainerLicense
  pin?: string
  linkedMemberId?: string
  skipMemberLink?: boolean
  useSetPasswordLink?: boolean
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-trainer-account:${getRequestIp(request)}`, 30, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as AdminTrainerAccountBody
    const firstName = body.firstName?.trim() ?? ""
    const lastName = body.lastName?.trim() ?? ""
    const email = body.email?.trim().toLowerCase() ?? ""
    const phone = body.phone?.trim() ?? ""
    const trainerLicenseInput = typeof body.trainerLicense === "string" ? body.trainerLicense : undefined
    const trainerLicense = normalizeTrainerLicense(trainerLicenseInput)
    const pin = body.pin?.trim() ?? ""
    const linkedMemberId = body.linkedMemberId?.trim() || null
    const skipMemberLink = Boolean(body.skipMemberLink)
    const useSetPasswordLink = Boolean(body.useSetPasswordLink)

    if (!firstName || !lastName || !email || !pin) {
      return new NextResponse("Bitte alle Felder für das Trainerkonto ausfüllen.", { status: 400 })
    }

    const emailValidation = validateEmail(email)
    if (!emailValidation.valid) {
      return new NextResponse(emailValidation.error || "Bitte eine gültige E-Mail-Adresse eingeben.", { status: 400 })
    }

    if (!isTrainerPinCompliant(pin)) {
      return new NextResponse(TRAINER_PIN_REQUIREMENTS_MESSAGE, { status: 400 })
    }

    if (trainerLicenseInput && !trainerLicense) {
      return new NextResponse("Ungültige Trainerlizenz.", { status: 400 })
    }

    const verificationToken = randomUUID()
    const supabase = getServerSupabase()

    let linkedMember: { id: string; email?: string | null } | null = null
    if (skipMemberLink) {
      linkedMember = null
    } else if (linkedMemberId) {
      const { data, error } = await supabase
        .from("members")
        .select("id, email")
        .eq("id", linkedMemberId)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        return new NextResponse("Verknüpftes Mitglied nicht gefunden.", { status: 404 })
      }

      linkedMember = data
    } else {
      const { data, error } = await supabase
        .from("members")
        .select("id, email")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1)

      if (error) throw error
      linkedMember = (data?.[0] as { id: string; email?: string | null } | undefined) ?? null
    }

    if (linkedMember?.email?.trim() && linkedMember.email.trim().toLowerCase() !== email) {
      return new NextResponse("Mitgliedsverknüpfung passt nicht zur E-Mail-Adresse.", { status: 400 })
    }

    const trainerAccount = await createTrainerAccount({
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || null,
      trainer_license: trainerLicense,
      pin,
      email_verification_token: verificationToken,
      linked_member_id: linkedMember?.id ?? null,
    })

    await writeAdminAuditLog({
      session,
      action: "trainer_account_created",
      targetType: "trainer",
      targetId: trainerAccount.id,
      targetName: `${firstName} ${lastName}`.trim(),
      details: `E-Mail: ${email}${trainerLicense ? `, Lizenz: ${trainerLicense}` : ""}${linkedMember?.id ? `, Mitglied verknüpft` : skipMemberLink ? ", ohne Mitgliedszuweisung" : ""}`,
    })

    const verificationBaseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
    const verificationLink = useSetPasswordLink
      ? `${verificationBaseUrl}/trainer-zugang/zugang-einrichten?token=${verificationToken}`
      : `${verificationBaseUrl}/trainer-zugang?trainer_verify=${verificationToken}`

    await sendVerificationEmail({
      email,
      name: `${firstName} ${lastName}`.trim(),
      link: verificationLink,
      kind: "trainer",
    })

    return NextResponse.json({ ok: true, email })
  } catch (error) {
    if (isTrainerAccountEmailConflict(error)) {
      return new NextResponse(error.message, { status: 409 })
    }

    console.error("admin trainer account creation failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
