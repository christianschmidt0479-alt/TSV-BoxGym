"use client"

import { Button } from "@/components/ui/button"

interface GroupFilterBarProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  label?: string
  description?: string
}

export function GroupFilterBar({
  options,
  value,
  onChange,
  label = "Gruppenfilter",
  description = "Alle Gruppen bleiben direkt sichtbar und auf dem Handy horizontal scrollbar.",
}: GroupFilterBarProps) {
  const visibleOptions = ["alle", ...options]

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-sm font-semibold text-zinc-900">{label}</div>
        <div className="text-sm text-zinc-500">{description}</div>
      </div>

      <div className="-mx-1 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-3 px-1">
          {visibleOptions.map((option) => {
            const isActive = option === value

            return (
              <Button
                key={option}
                type="button"
                variant="outline"
                className={`min-h-12 shrink-0 rounded-full border px-5 py-3 text-sm font-semibold ${
                  isActive
                    ? "border-[#154c83] bg-[#154c83] text-white hover:bg-[#123d69] hover:text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
                onClick={() => onChange(option)}
              >
                {option === "alle" ? "Alle" : option}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
