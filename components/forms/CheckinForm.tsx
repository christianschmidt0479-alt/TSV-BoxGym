"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FormInput } from "@/components/common/FormInput"
import { FormSelect } from "@/components/common/FormSelect"
import {
  validateEmail,
  validateName,
  validatePin,
  validateBirthdate,
} from "@/lib/formValidation"
import { ErrorMessages } from "@/lib/errorHandling"

interface Session {
  id: string
  dayKey: string
  title: string
  group: string
  start: string
  end: string
}

interface CheckinFormProps {
  /**
   * Form-Typ: "member" (PIN-basiert) oder "trial" (Probetraining)
   */
  type: "member" | "trial"

  /**
   * Verfügbare Trainingsgruppen/Sessions
   */
  sessions: Session[]

  /**
   * Aktuell aktive Session (zum Vorabfüllen)
   */
  defaultSessionId?: string

  /**
   * Kann gerade eingecheckt werden?
   */
  canCheckin: boolean

  /**
   * Lädt gerade?
   */
  isLoading?: boolean

  /**
   * Form-Submission  Handler
   */
  onSubmit: (data: MemberCheckinData | TrialCheckinData) => Promise<void>

  /**
   * Submit-Button Label
   */
  submitLabel?: string

  /**
   * Info-Text über dem Formular
   */
  infoText?: string

  /**
   * Zusätzliche Hinweise/Warnungen
   */
  notice?: {
    type: "info" | "warning" | "error"
    message: string
  }
}

export interface MemberCheckinData {
  email: string
  pin: string
  sessionId: string
}

export interface TrialCheckinData {
  firstName: string
  lastName: string
  birthDate: string
  email: string
  phone: string
  sessionId: string
}

type FormData = MemberCheckinData | TrialCheckinData

/**
 * Wiederverwendbares Check-in Formular für Mitglieder und Probetraining
 * Nutzt FormInput/FormSelect für einheitliches Validierungs-Feedback
 */
export function CheckinForm({
  type,
  sessions,
  defaultSessionId,
  canCheckin,
  isLoading = false,
  onSubmit,
  submitLabel = type === "member" ? "Mitglied einchecken" : "Probetraining anmelden",
  infoText,
  notice,
}: CheckinFormProps) {
  const [memberEmail, setMemberEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [pin, setPin] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [sessionId, setSessionId] = useState(defaultSessionId || sessions[0]?.id || "")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const selectedSession = sessions.find((s) => s.id === sessionId)

  // Validatore für Member-Check-in
  const validateMemberForm = (): boolean => {
    const errors: Record<string, string> = {}

    const emailValidation = validateEmail(memberEmail)
    if (!emailValidation.valid) {
      errors.email = emailValidation.error || ""
    }

    const pinValidation = validatePin(pin)
    if (!pinValidation.valid) {
      errors.pin = pinValidation.error || ""
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Validator für Trial-Check-in
  const validateTrialForm = (): boolean => {
    const errors: Record<string, string> = {}

    const firstNameValidation = validateName(firstName, "Vorname")
    if (!firstNameValidation.valid) {
      errors.firstName = firstNameValidation.error || ""
    }

    const lastNameValidation = validateName(lastName, "Nachname")
    if (!lastNameValidation.valid) {
      errors.lastName = lastNameValidation.error || ""
    }

    const birthDateValidation = validateBirthdate(birthDate)
    if (!birthDateValidation.valid) {
      errors.birthDate = birthDateValidation.error || ""
    }

    if (!email.trim()) {
      errors.email = "E-Mail ist erforderlich."
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Gültige E-Mail-Adresse erforderlich."
    }

    if (!phone.trim()) {
      errors.phone = "Telefonnummer ist erforderlich."
    } else if (!/^[+\-() 0-9]+$/.test(phone.trim())) {
      errors.phone = "Ungültiges Format (nur Ziffern, +, -, Klammern)."
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    // Validiere Formular
    const isValid = type === "member" ? validateMemberForm() : validateTrialForm()
    if (!isValid) {
      setSubmitError("Bitte füllen Sie alle erforderlichen Felder korrekt aus.")
      return
    }

    if (!selectedSession) {
      setSubmitError("Bitte wählen Sie eine Trainingsgruppe.")
      return
    }

    if (!canCheckin) {
      setSubmitError(ErrorMessages.CHECKIN_UNAVAILABLE)
      return
    }

    try {
      const data: FormData =
        type === "member"
          ? {
              email: memberEmail.trim().toLowerCase(),
              pin: pin.trim(),
              sessionId,
            }
          : {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              birthDate,
              email: email.trim(),
              phone: phone.trim(),
              sessionId,
            }

      await onSubmit(data)

      // Reset form on success
      setMemberEmail("")
      setFirstName("")
      setLastName("")
      setPin("")
      setBirthDate("")
      setEmail("")
      setPhone("")
      setValidationErrors({})
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : ErrorMessages.SERVICE_ERROR
      setSubmitError(errorMessage)
    }
  }

  const sessionOptions = sessions.map((session) => ({
    value: session.id,
    label: session.title,
    disabled: false,
  }))

  return (
    <Card className="rounded-[24px] border-0 shadow-sm">
      <CardHeader>
        <CardTitle>{type === "member" ? "Mitglieder-Check-in" : "Probetraining"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {infoText && (
          <div className="rounded-2xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
            {infoText}
          </div>
        )}

        {notice && (
          <div
            className={`rounded-2xl border p-3 text-sm ${
              notice.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : notice.type === "warning"
                  ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                  : "border-blue-200 bg-blue-50 text-blue-700"
            }`}
          >
            {notice.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {type === "member" ? (
            <FormInput
              label="E-Mail"
              name="email"
              type="email"
              value={memberEmail}
              onChange={setMemberEmail}
              placeholder="name@tsv-falkensee.de"
              required
              validator={validateEmail}
              showValidation={!!validationErrors.email}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <FormInput
                label="Vorname"
                name="firstName"
                value={firstName}
                onChange={setFirstName}
                placeholder="Vorname"
                required
                validator={(v) => validateName(v, "Vorname")}
                showValidation={!!validationErrors.firstName}
              />

              <FormInput
                label="Nachname"
                name="lastName"
                value={lastName}
                onChange={setLastName}
                placeholder="Nachname"
                required
                validator={(v) => validateName(v, "Nachname")}
                showValidation={!!validationErrors.lastName}
              />
            </div>
          )}

          {type === "member" && (
            <FormInput
              label="Passwort"
              name="pin"
              value={pin}
              onChange={setPin}
              placeholder="Passwort eingeben"
              required
              validator={validatePin}
              showValidation={!!validationErrors.pin}
            />
          )}

          {type === "trial" && (
            <>
              <FormInput
                label="Geburtsdatum"
                name="birthDate"
                type="date"
                value={birthDate}
                onChange={setBirthDate}
                required
                validator={validateBirthdate}
                showValidation={!!validationErrors.birthDate}
              />

              <FormInput
                label="E-Mail"
                name="email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="deine@email.de"
                required
                showValidation={!!validationErrors.email}
              />

              <FormInput
                label="Telefonnummer"
                name="phone"
                value={phone}
                onChange={setPhone}
                placeholder="+49 123 456789"
                required
                showValidation={!!validationErrors.phone}
              />
            </>
          )}

          <FormSelect
            label="Trainingsgruppe"
            name="sessionId"
            value={sessionId}
            onChange={setSessionId}
            options={sessionOptions}
            required
            error={validationErrors.sessionId}
          />

          {submitError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <strong>Fehler:</strong> {submitError}
            </div>
          )}

          <Button
            type="submit"
            className="bg-[#154c83] w-full rounded-2xl text-white hover:bg-[#123d69]"
            disabled={isLoading || !canCheckin}
          >
            {isLoading ? "Wird gespeichert..." : submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
