"use client"

import { useEffect, useRef, useState } from "react"
import { Info } from "lucide-react"
import { createPortal } from "react-dom"

type InfoHintProps = {
  text: string
}

export function InfoHint({ text }: InfoHintProps) {
  const [open, setOpen] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState<{ left: number; top: number; width: number } | null>(null)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [])

  useEffect(() => {
    if (!open) return

    function updatePosition() {
      if (!buttonRef.current || typeof window === "undefined") return

      const rect = buttonRef.current.getBoundingClientRect()
      const viewportPadding = 12
      const width = Math.min(320, window.innerWidth - viewportPadding * 2)
      const centeredLeft = rect.left + rect.width / 2 - width / 2
      const left = Math.max(viewportPadding, Math.min(centeredLeft, window.innerWidth - width - viewportPadding))
      const top = rect.bottom + 8

      setTooltipStyle({ left, top, width })
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)

    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [open])

  return (
    <span
      ref={rootRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label="Mehr Infos"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#b9cde2] bg-[#eef4fb] text-[#154c83] transition hover:border-[#154c83] hover:bg-white"
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && tooltipStyle && typeof document !== "undefined"
        ? createPortal(
            <span
              className="fixed z-[100] rounded-2xl border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-700 shadow-xl"
              style={{
                left: tooltipStyle.left,
                top: tooltipStyle.top,
                width: tooltipStyle.width,
              }}
            >
              {text}
            </span>,
            document.body
          )
        : null}
    </span>
  )
}
