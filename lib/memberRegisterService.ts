// Neuer Service für Mitgliederregistrierung

import * as crypto from "crypto"
import { findMemberByEmail, createMember, updateMemberRegistrationData } from "./boxgymDb"
import { validateName, validateEmail, validatePin, validateBirthdate } from "./formValidation"
import { sendMemberVerificationMail } from "./mail/memberVerificationMail"

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
  | { ok: true; memberId: string; mailSent: boolean }
  | { ok: false; error: string; code?: "already-exists" | "validation-error" | "error" }

export async function registerMemberService(input: RegisterMemberInput): Promise<RegisterMemberResult> {
  // Debug-Log: Einstieg Service
  if (process.env.NODE_ENV !== "production") {
    console.log("MEMBER_REGISTER_SERVICE_PASSWORD_PRESENT", {
      email: input.email,
      password_present: !!input.password,
      password_length: input.password ? String(input.password).length : 0,
    })
  }

  // 1. Eingaben validieren (nur Kernfelder, keine Altlogik)
  const firstNameResult = validateName(input.firstName, "Vorname")
  if (!firstNameResult.valid) {
    return { ok: false, code: "validation-error", error: firstNameResult.error || "Ungültiger Vorname" }
  }

  const lastNameResult = validateName(input.lastName, "Nachname")
  if (!lastNameResult.valid) {
    return { ok: false, code: "validation-error", error: lastNameResult.error || "Ungültiger Nachname" }
  }

  const birthDateResult = validateBirthdate(input.birthDate)
  if (!birthDateResult.valid) {
    return { ok: false, code: "validation-error", error: birthDateResult.error || "Ungültiges Geburtsdatum" }
  }

  // Gender: Pflichtfeld, aber keine Sonderlogik
  if (!input.gender || typeof input.gender !== "string" || input.gender.trim().length < 1) {
    return { ok: false, code: "validation-error", error: "Geschlecht ist erforderlich." }
  }

  const emailResult = validateEmail(input.email)
  if (!emailResult.valid) {
    return { ok: false, code: "validation-error", error: emailResult.error || "Ungültige E-Mail" }
  }

  const passwordResult = validatePin(input.password)
  if (!passwordResult.valid) {
    return { ok: false, code: "validation-error", error: passwordResult.error || "Ungültiges Passwort" }
  }

  // baseGroup: Pflichtfeld, aber keine Altlogik
  if (!input.baseGroup || typeof input.baseGroup !== "string" || input.baseGroup.trim().length < 1) {
    return { ok: false, code: "validation-error", error: "Gruppe ist erforderlich." }
  }

  // Consent: Muss true sein
  if (input.consent !== true) {
    return { ok: false, code: "validation-error", error: "Zustimmung zur Datenschutzerklärung ist erforderlich." }
  }

  // Phone: Optionaler Mindestcheck für Datenqualität
  const normalizedPhone = input.phone
    ?.replace(/[^\d+]/g, "")
    ?.replace(/^0/, "+49")
    ?.trim() || null

  if (!normalizedPhone || normalizedPhone.length < 8) {
    return { ok: false, code: "validation-error", error: "Telefon ungültig" }
  }

  // 2. Bestehendes Mitglied suchen (nur E-Mail als Kernkriterium)
  let existingMember = null
  try {
    existingMember = await findMemberByEmail(input.email)
  } catch (err) {
    return {
      ok: false,
      code: "error",
      error: "Fehler beim Member-Lookup: " + (err instanceof Error ? err.message : String(err)),
    }
  }

  if (existingMember) {
    return {
      ok: false,
      code: "already-exists",
      error: "Zu diesem Mitglied existiert bereits ein Zugang. Bitte Mein Bereich nutzen oder Trainer/Admin ansprechen.",
    }
  }

  // 3. Neues Mitglied anlegen (nur Kernfelder, keine Altlogik)
  try {
    const payload = {
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      birthdate: input.birthDate,
      gender: input.gender,
      email: input.email.trim().toLowerCase(),
      phone: normalizedPhone,
      is_trial: false,
      base_group: input.baseGroup,
      member_pin: input.password, // Minimaler Fix: Passwort als member_pin übergeben
      // Keine guardian_name, keine Alt-/Sonderfelder
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("MEMBER_REGISTER_SERVICE_MEMBER_PIN_PRESENT", {
        email: payload.email,
        member_pin_present: !!payload.member_pin,
      })
    }

    const created = await createMember(payload)
    if (!created || !created.id) {
      return { ok: false, code: "error", error: "Mitglied konnte nicht angelegt werden." }
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("SERVICE CREATE MEMBER", {
        id: created.id,
        email: created.email || payload.email,
      })
    }

    // 4. Verifizierungstoken erzeugen und speichern
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    try {
      await updateMemberRegistrationData(created.id, {
        email_verification_token: token,
        email_verification_expires_at: expiresAt,
        last_verification_sent_at: new Date(),
        email_verification_consumed_at: null,
        email_verification_consumed_token_hash: null,
      })
    } catch (err) {
      return {
        ok: false,
        code: "error",
        error: "Fehler beim Speichern des Verifizierungstokens: " + (err instanceof Error ? err.message : String(err)),
      }
    }

    // Debug-Log: Vor Mailversand
    if (process.env.NODE_ENV !== "production") {
      console.log("MEMBER_REGISTER_BEFORE_MAIL", { email: input.email })
    }

    // 5. Verifizierungs-Mail versenden
    try {
      await sendMemberVerificationMail({ email: input.email.trim().toLowerCase(), token })
      const mailResult = { sent: true }
      if (process.env.NODE_ENV !== "production") {
        console.log("SERVICE MAIL:", mailResult)
      }
      return { ok: true, memberId: created.id, mailSent: true }
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.log("SERVICE MAIL:", { sent: false, error: err instanceof Error ? err.message : String(err) })
      }
      return { ok: true, memberId: created.id, mailSent: false }
    }
  } catch (err) {
    return {
      ok: false,
      code: "error",
      error: "Fehler bei Member-Anlage: " + (err instanceof Error ? err.message : String(err)),
    }
  }

  // (Altlogik entfernt)
}
