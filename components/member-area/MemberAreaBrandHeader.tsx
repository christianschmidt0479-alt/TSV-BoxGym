import Image from "next/image"
import type { ReactNode } from "react"

type MemberAreaBrandHeaderProps = {
  title: string
  subtitle?: string
  actionSlot?: ReactNode
}

export function MemberAreaBrandHeader({ title, subtitle, actionSlot }: MemberAreaBrandHeaderProps) {
  return (
    <div className="rounded-2xl border border-[#d8e3ee] bg-gradient-to-r from-[#0f2a44] to-[#154c83] px-4 py-4 text-white shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center rounded-xl bg-white/95 px-3 py-2 shadow-sm">
            <Image src="/logo.png" alt="TSV Falkensee" width={40} height={40} className="h-10 w-auto object-contain" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-100">TSV Falkensee BoxGym</p>
            <h2 className="text-base font-semibold leading-tight sm:text-lg">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-blue-100 sm:text-sm">{subtitle}</p> : null}
          </div>
        </div>

        {actionSlot ? <div className="shrink-0">{actionSlot}</div> : null}
      </div>
    </div>
  )
}
