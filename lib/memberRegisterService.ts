// Neuer Service für Mitgliederregistrierung

export type RegisterMemberInput = {
  firstName: string
  lastName: string
  birthDate: string
  gender: string
  password: string
  email: string
  phone: string
  baseGroup: string
  consent: boolean
}

export type RegisterMemberResult =
  | { status: "success"; memberId: string }
  | { status: "already-exists"; memberId?: string }
  | { status: "validation-error"; error: string }
  | { status: "mail-failed"; memberId: string; error: string }
  | { status: "error"; error: string }



import { validateName, validateEmail, validatePin, validateBirthdate } from "./formValidation"
import { findMemberByEmail, createMember, updateMemberRegistrationData } from "./boxgymDb"
import { randomUUID } from "crypto"
import { sendMemberVerificationMail } from "./mail/memberVerificationMail"

export async function registerMemberService(input: RegisterMemberInput): Promise<RegisterMemberResult> {
  // Debug-Log: Einstieg Service
  console.log("MEMBER_REGISTER_SERVICE_PASSWORD_PRESENT", {
    email: input.email,
    password_present: !!input.password,
    password_length: input.password ? String(input.password).length : 0
  })

  // 1. Eingaben validieren (nur Kernfelder, keine Altlogik)
  const firstNameResult = validateName(input.firstName, "Vorname")
  if (!firstNameResult.valid) {
    return { status: "validation-error", error: firstNameResult.error || "Ungültiger Vorname" }
  }

  const lastNameResult = validateName(input.lastName, "Nachname")
  if (!lastNameResult.valid) {
    return { status: "validation-error", error: lastNameResult.error || "Ungültiger Nachname" }
  }

  const birthDateResult = validateBirthdate(input.birthDate)
  if (!birthDateResult.valid) {
    return { status: "validation-error", error: birthDateResult.error || "Ungültiges Geburtsdatum" }
  }

  // Gender: Pflichtfeld, aber keine Sonderlogik
  if (!input.gender || typeof input.gender !== "string" || input.gender.trim().length < 1) {
    return { status: "validation-error", error: "Geschlecht ist erforderlich." }
  }

  const emailResult = validateEmail(input.email)
  if (!emailResult.valid) {
    return { status: "validation-error", error: emailResult.error || "Ungültige E-Mail" }
  }

  const passwordResult = validatePin(input.password)
  if (!passwordResult.valid) {
    return { status: "validation-error", error: passwordResult.error || "Ungültiges Passwort" }
  }

  // baseGroup: Pflichtfeld, aber keine Altlogik
  if (!input.baseGroup || typeof input.baseGroup !== "string" || input.baseGroup.trim().length < 1) {
    return { status: "validation-error", error: "Gruppe ist erforderlich." }
  }

  // Consent: Muss true sein
  if (input.consent !== true) {
    return { status: "validation-error", error: "Zustimmung zur Datenschutzerklärung ist erforderlich." }
  }

  // Phone: Optional, keine Pflichtprüfung im Kernprozess


  // 2. Bestehendes Mitglied suchen (nur E-Mail als Kernkriterium)
  let existingMember = null
  try {
    existingMember = await findMemberByEmail(input.email)
  } catch (err) {
    return { status: "error", error: "Fehler beim Member-Lookup: " + (err instanceof Error ? err.message : String(err)) }
  }
  if (existingMember) {
    return { status: "already-exists", memberId: existingMember.id }
  }

  // 3. Neues Mitglied anlegen (nur Kernfelder, keine Altlogik)
  try {
    const payload = {
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      birthdate: input.birthDate,
      gender: input.gender,
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || undefined,
      is_trial: false,
      base_group: input.baseGroup,
      member_pin: input.password, // Minimaler Fix: Passwort als member_pin übergeben
      // Keine guardian_name, keine Alt-/Sonderfelder
    }
    console.log("MEMBER_REGISTER_SERVICE_MEMBER_PIN_PRESENT", {
      email: payload.email,
      member_pin_present: !!payload.member_pin
    })
    const created = await createMember(payload)
    if (!created || !created.id) {
      return { status: "error", error: "Mitglied konnte nicht angelegt werden." }
    }
    // 4. Verifizierungstoken erzeugen und speichern
    const token = randomUUID()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    try {
      await updateMemberRegistrationData(created.id, {
        email_verification_token: token,
        email_verification_expires_at: expiresAt,
      })
    } catch (err) {
      return { status: "error", error: "Fehler beim Speichern des Verifizierungstokens: " + (err instanceof Error ? err.message : String(err)) }
    }

    // Debug-Log: Vor Mailversand
    console.log("MEMBER_REGISTER_BEFORE_MAIL", { email: input.email })
    // 5. Verifizierungs-Mail versenden
    try {
      await sendMemberVerificationMail({ email: input.email.trim().toLowerCase(), token })
      return { status: "success", memberId: created.id }
    } catch (err) {
      return { status: "mail-failed", memberId: created.id, error: (err instanceof Error ? err.message : String(err)) }
    }
  } catch (err) {
    return { status: "error", error: "Fehler bei Member-Anlage: " + (err instanceof Error ? err.message : String(err)) }
  }

  // (Altlogik entfernt)
}
