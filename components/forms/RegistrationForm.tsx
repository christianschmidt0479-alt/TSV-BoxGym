"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FormInput } from "@/components/common/FormInput"
import { FormSelect } from "@/components/common/FormSelect"
import {
  validateName,
  validatePin,
  validateBirthdate,
  validateEmail,
  validatePhone,
} from "@/lib/formValidation"
import { ErrorMessages } from "@/lib/errorHandling"

interface RegistrationFormProps {
  /**
   * Verfügbare Stammgruppen
   */
  groupOptions: string[]

  /**
   * Wird gerade gespeichert?
   */
  isLoading?: boolean

  /**
   * Form-Submission Handler
   */
  onSubmit: (data: RegistrationFormData) => Promise<void>
}

export interface RegistrationFormData {
  firstName: string
  lastName: string
  birthDate: string
  pin: string
  email: string
  phone: string
  baseGroup: string
}

/**
 * Formular zur Registrierung neuer Mitglieder
 */
export function RegistrationForm({
  groupOptions,
  isLoading = false,
  onSubmit,
}: RegistrationFormProps) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [pin, setPin] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [baseGroup, setBaseGroup] = useState(groupOptions[0] || "")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const validateForm = (): boolean => {
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

    const pinValidation = validatePin(pin)
    if (!pinValidation.valid) {
      errors.pin = pinValidation.error || ""
    }

    const emailValidation = validateEmail(email)
    if (!emailValidation.valid) {
      errors.email = emailValidation.error || ""
    }

    const phoneValidation = validatePhone(phone, true)
    if (!phoneValidation.valid) {
      errors.phone = phoneValidation.error || ""
    }

    if (!baseGroup) {
      errors.baseGroup = "Bitte wählen Sie eine Stammgruppe."
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!validateForm()) {
      setSubmitError("Bitte füllen Sie alle erforderlichen Felder korrekt aus.")
      return
    }

    try {
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate,
        pin: pin.trim(),
        email: email.trim(),
        phone: phone.trim(),
        baseGroup,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : ErrorMessages.SERVICE_ERROR
      setSubmitError(errorMessage)
    }
  }

  const groupSelectOptions = groupOptions.map((group) => ({
    value: group,
    label: group,
  }))

  return (
    <Card className="rounded-[24px] border-0 shadow-sm">
      <CardHeader>
        <CardTitle>Mitglied registrieren</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-zinc-500">
          Neues Mitglied anlegen. Die Stammgruppe ist Grundlage für die Besuchsauswertung.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput
            label="Vorname"
            name="firstName"
              value={firstName}
              onChange={setFirstName}
              placeholder="Vorname"
              required
              validator={(v: string) => validateName(v, "Vorname")}
              showValidation={!!validationErrors.firstName}
            />

            <FormInput
            label="Nachname"
              name="lastName"
              value={lastName}
              onChange={setLastName}
              placeholder="Nachname"
              required
              validator={(v: string) => validateName(v, "Nachname")}
              showValidation={!!validationErrors.lastName}
            />
          </div>

          <FormInput
            label="Geburtsdatum"
            name="birthDate"
            type="date"
            value={birthDate}
            onChange={setBirthDate}
            required
            validator={(v: string) => validateBirthdate(v)}
            showValidation={!!validationErrors.birthDate}
          />

          <FormSelect
            label="Stammgruppe"
            name="baseGroup"
            value={baseGroup}
            onChange={setBaseGroup}
            options={groupSelectOptions}
            required
            error={validationErrors.baseGroup}
          />

          <FormInput
            label="Passwort"
            name="pin"
            type="password"
            value={pin}
            onChange={setPin}
            placeholder="Passwort eingeben"
            required
            validator={(v: string) => validatePin(v)}
            showValidation={!!validationErrors.pin}
            allowPasswordToggle
          />

          <FormInput
            label="E-Mail"
            name="email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="deine@email.de"
            required
            validator={(v: string) => validateEmail(v)}
            showValidation={!!validationErrors.email}
          />

          <FormInput
            label="Telefon"
            name="phone"
            type="tel"
            value={phone}
            onChange={setPhone}
            placeholder="Telefonnummer eingeben"
            validator={(v: string) => validatePhone(v, true)}
            showValidation={!!validationErrors.phone}
            required
          />

          {submitError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <strong>Fehler:</strong> {submitError}
            </div>
          )}

          <Button
            type="submit"
            className="bg-[#154c83] w-full rounded-2xl text-white hover:bg-[#123d69]"
            disabled={isLoading}
          >
            {isLoading ? "Wird gespeichert..." : "Mitglied registrieren"}
          </Button>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            Nach der Registrierung muss zuerst die E-Mail bestätigt werden. Erst danach ist die Freigabe durch den Admin möglich.
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
