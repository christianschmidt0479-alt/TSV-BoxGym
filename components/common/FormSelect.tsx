"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle } from "lucide-react"

interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface FormSelectProps {
  /**
   * Label für das Select-Feld
   */
  label?: string

  /**
   * Select-Name & ID
   */
  name: string

  /**
   * Aktuell ausgewählter Wert
   */
  value: string

  /**
   * Change-Handler
   */
  onChange: (value: string) => void

  /**
   * Verfügbare Optionen
   */
  options: SelectOption[]

  /**
   * Placeholder wenn kein Wert ausgewählt
   */
  placeholder?: string

  /**
   * Deaktiviert?
   */
  disabled?: boolean

  /**
   * Fehler anzeigen?
   */
  error?: string

  /**
   * Required-Indikator
   */
  required?: boolean

  /**
   * CSS-Klasse
   */
  className?: string
}

/**
 * Verbessertes Select-Feld mit besserer Fehlerbehandlung
 */
export function FormSelect({
  label,
  name,
  value,
  onChange,
  options,
  placeholder = "Bitte wählen...",
  disabled = false,
  error,
  required = false,
  className = "",
}: FormSelectProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <Label htmlFor={name} className="text-sm font-medium text-zinc-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}

      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={name}
          className={`
            rounded-2xl border-zinc-300 bg-white text-zinc-900
            ${error ? "border-red-400" : ""}
            ${className}
          `}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent className="rounded-2xl">
          {options.length === 0 ? (
            <SelectItem value="_empty" disabled>
              Keine Optionen verfügbar
            </SelectItem>
          ) : (
            options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {/* Error Message */}
      {error && (
        <p className="text-sm text-red-600 flex items-start gap-1.5">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
