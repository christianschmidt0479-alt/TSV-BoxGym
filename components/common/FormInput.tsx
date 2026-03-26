"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2, AlertCircle } from "lucide-react"
import { ValidationResult } from "@/lib/formValidation"

interface FormInputProps {
  /**
   * Label für das Eingabefeld
   */
  label?: string

  /**
   * Input-Name & ID
   */
  name: string

  /**
   * Input-Wert
   */
  value: string

  /**
   * Input-Änderung Handler
   */
  onChange: (value: string) => void

  /**
   * Input-Typ (text, email, password, date, etc.)
   */
  type?: string

  /**
   * Placeholder-Text
   */
  placeholder?: string

  /**
   * Optionale Validierungsfunktion
   * Wird aufgerufen bei onChange und nach Blur
   */
  validator?: (value: string) => ValidationResult

  /**
   * Validierungsfehler anzeigen?
   */
  showValidation?: boolean

  /**
   * Deaktiviert?
   */
  disabled?: boolean

  /**
   * Auto-Complete
   */
  autoComplete?: string

  /**
   * CSS-Klasse
   */
  className?: string

  /**
   * Required-Indikator
   */
  required?: boolean
}

/**
 * Validiertes Input-Feld mit optionalen Live-Feedback
 * - Grüner Haken bei erfolgreicher Validierung
 * - Fehler-Icon + Meldung bei Validierungsfehler
 * - Error wird nur nach Blur angezeigt (oder bei showValidation=true)
 */
export function FormInput({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  validator,
  showValidation = false,
  disabled = false,
  autoComplete,
  className = "",
  required = false,
}: FormInputProps) {
  const [touched, setTouched] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)

  const showError = touched || showValidation
  const hasError = showError && validation && !validation.valid
  const hasSuccess = touched && validation && validation.valid && value.trim().length > 0

  // Validierung beim Input (aber zeige Fehler erst nach Blur oder showValidation=true)
  // Blur: Markiere als "touched" damit Fehler angezeigt werden
  const handleBlur = () => {
    setTouched(true)
  }

  // Validierung beim Input (aber zeige Fehler erst nach Blur oder showValidation=true)
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue)

    if (!newValue.trim()) {
      setValidation(null)
      return
    }

    if (validator) {
      const result = validator(newValue)
      setValidation(result)
    }
  }

  return (
    <div className="space-y-1.5">
      {label && (
        <Label htmlFor={name} className="text-sm font-medium text-zinc-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}

      <div className="relative">
        <Input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          className={`
            rounded-2xl border-zinc-300 bg-white text-zinc-900
            transition-colors
            ${hasError ? "border-red-400 focus:ring-red-200" : ""}
            ${hasSuccess ? "border-green-400 focus:ring-green-200" : ""}
            ${className}
          `}
        />

        {/* Success Indicator */}
        {hasSuccess && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </div>
        )}

        {/* Error Indicator */}
        {hasError && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
        )}
      </div>

      {/* Error Message */}
      {hasError && validation?.error && (
        <p className="text-sm text-red-600 flex items-start gap-1.5">
          <span className="mt-0.5 flex-shrink-0">!</span>
          <span>{validation.error}</span>
        </p>
      )}
    </div>
  )
}
