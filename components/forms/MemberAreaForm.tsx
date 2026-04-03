"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FormInput } from "@/components/common/FormInput"
import { validateEmail, validatePin } from "@/lib/formValidation"
import { ErrorMessages } from "@/lib/errorHandling"

interface MemberAreaFormProps {
  /**
   * Wird gerade geladen?
   */
  isLoading?: boolean

  /**
   * Form-Submission Handler
   */
  onSubmit: (data: MemberAreaFormData) => Promise<void>

  /**
   * Fehler anzeigen?
   */
  error?: string | null
}

export interface MemberAreaFormData {
  email: string
  pin: string
}

/**
 * Formular zum Entsperren des Mitgliederbereichs
 */
export function MemberAreaForm({ isLoading = false, onSubmit, error }: MemberAreaFormProps) {
  const [email, setEmail] = useState("")
  const [pin, setPin] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(error || null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    const emailValidation = validateEmail(email)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!validateForm()) {
      setSubmitError("Bitte füllen Sie alle erforderlichen Felder korrekt aus.")
      return
    }

    try {
      await onSubmit({
        email: email.trim().toLowerCase(),
        pin: pin.trim(),
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : ErrorMessages.SERVICE_ERROR
      setSubmitError(errorMessage)
    }
  }

  return (
    <Card className="rounded-[24px] border-0 shadow-sm">
      <CardHeader>
        <CardTitle>Mein Bereich</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormInput
            label="E-Mail"
            name="email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="name@tsv-falkensee.de"
            required
            validator={(value: string) => validateEmail(value)}
            showValidation={!!validationErrors.email}
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
            {isLoading ? "Wird geladen..." : "Mitgliederbereich öffnen"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
