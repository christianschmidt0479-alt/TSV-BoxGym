import type { ReactNode } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type FormContainerProps = {
  title?: string
  description?: string
  headerSlot?: ReactNode
  rootClassName?: string
  children: ReactNode
}

export function FormContainer({ title, description, headerSlot, rootClassName, children }: FormContainerProps) {
  return (
    <div className={`min-h-[100svh] bg-zinc-50 text-zinc-900 px-4 py-6 md:px-6 md:py-8 ${rootClassName ?? ""}`}>
      <div className="mx-auto w-full max-w-md space-y-4">
        <Card className="rounded-[24px] border border-[#d8e3ee] bg-white shadow-sm">
          {(headerSlot || title || description) ? (
            <CardHeader className="space-y-2.5 pb-2">
              {headerSlot}
              {title ? <CardTitle className="text-2xl text-zinc-900">{title}</CardTitle> : null}
              {description ? <p className="text-sm leading-6 text-zinc-600">{description}</p> : null}
            </CardHeader>
          ) : null}
          <CardContent className="pb-5">{children}</CardContent>
        </Card>
      </div>
    </div>
  )
}
