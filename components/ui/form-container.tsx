import type { ReactNode } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type FormContainerProps = {
  title: string
  description?: string
  headerSlot?: ReactNode
  children: ReactNode
}

export function FormContainer({ title, description, headerSlot, children }: FormContainerProps) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
        <Card className="rounded-[24px] border border-[#d8e3ee] bg-white shadow-sm">
          <CardHeader>
            {headerSlot}
            <CardTitle className="text-2xl">{title}</CardTitle>
            {description ? <p className="text-sm text-zinc-600">{description}</p> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  )
}
