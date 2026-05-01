// Neuer Service für Mitgliederregistrierung

import * as crypto from "crypto"
import { findMemberByEmail, createMember, updateMemberRegistrationData } from "./boxgymDb"
import { validateName, validateEmail, validatePin, validateBirthdate } from "./formValidation"
import { sendMemberVerificationMail } from "./mail/memberVerificationMail"
import { runRegistrationOfficePrecheck } from "./officePrecheck"

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
  memberPhase?: "member" | "trial" | "extended"
  isTrial?: boolean
  isApproved?: boolean
}

export type RegisterMemberResult =
  | { ok: true; memberId: string; mailSent: boolean }
  | { ok: false; error: string; code?: "already-exists" | "validation-error" | "error" }

export type RegisterMemberServiceDeps = {
  findMemberByEmail: typeof findMemberByEmail
  createMember: typeof createMember
  updateMemberRegistrationData: typeof updateMemberRegistrationData
  runRegistrationOfficePrecheck: typeof runRegistrationOfficePrecheck
  sendMemberVerificationMail: typeof sendMemberVerificationMail
}

const defaultDeps: RegisterMemberServiceDeps = {
  findMemberByEmail,
  createMember,
  updateMemberRegistrationData,
  runRegistrationOfficePrecheck,
  sendMemberVerificationMail,
}

export async function registerMemberService(input: RegisterMemberInput): Promise<RegisterMemberResult> {
  return registerMemberServiceWithDeps(input, defaultDeps)
}

export async function registerMemberServiceWithDeps(
  input: RegisterMemberInput,
  deps: RegisterMemberServiceDeps,
): Promise<RegisterMemberResult> {
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

  const normalizedGender = typeof input.gender === "string" && input.gender.trim().length > 0
    ? input.gender.trim()
    : null

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
    existingMember = await deps.findMemberByEmail(input.email)
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
    const memberPhase =
      input.memberPhase === "member" || input.memberPhase === "extended" || input.memberPhase === "trial"
        ? input.memberPhase
        : "trial"
    const isTrial = typeof input.isTrial === "boolean" ? input.isTrial : memberPhase !== "member"
    const isApproved = typeof input.isApproved === "boolean" ? input.isApproved : false

    const payload = {
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      birthdate: input.birthDate,
      gender: normalizedGender,
      email: input.email.trim().toLowerCase(),
      phone: normalizedPhone,
      is_trial: isTrial,
      member_phase: memberPhase,
      is_approved: isApproved,
      base_group: input.baseGroup,
      member_pin: input.password, // Minimaler Fix: Passwort als member_pin übergeben
      // Keine guardian_name, keine Alt-/Sonderfelder
    }

    const created = await deps.createMember(payload)
    if (!created || !created.id) {
      return { ok: false, code: "error", error: "Mitglied konnte nicht angelegt werden." }
    }

    // 4. Verifizierungstoken erzeugen und speichern
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    try {
      await deps.updateMemberRegistrationData(created.id, {
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

    // Hidden best-effort precheck against latest uploaded GS list.
    // This intentionally does not write office_list_* fields.
    try {
      await deps.runRegistrationOfficePrecheck({
        firstName: payload.first_name,
        lastName: payload.last_name,
        birthdate: payload.birthdate,
        email: payload.email,
        phone: payload.phone ?? "",
      })
    } catch {
      // Do not fail registration because of an internal precheck issue.
    }

    // 5. Verifizierungs-Mail versenden
    try {
      await deps.sendMemberVerificationMail({ email: input.email.trim().toLowerCase(), token })
      return { ok: true, memberId: created.id, mailSent: true }
    } catch (err) {
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
