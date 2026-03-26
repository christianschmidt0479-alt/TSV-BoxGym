import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type">

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className, ...props },
  ref
) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? "text" : "password"}
        data-slot="input"
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 pr-11 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        )}
        {...props}
      />
      <button
        type="button"
        aria-label={visible ? "Eingabe verbergen" : "Eingabe anzeigen"}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-zinc-500 transition hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154c83]/30"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
})

export { PasswordInput }
