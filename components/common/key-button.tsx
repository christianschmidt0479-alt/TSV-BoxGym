import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"

export function KeyButton({
  href = "/",
  className = "",
  size = 80,
  "aria-label": ariaLabel = "TSV Falkensee BoxGym",
  ...props
}: {
  href?: string
  className?: string
  size?: number
  "aria-label"?: string
} & React.ComponentPropsWithoutRef<"a">) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-[#d8e3ee] bg-white p-2 shadow-md transition hover:scale-105 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[#154c83] focus-visible:outline-none",
        className
      )}
      {...props}
    >
      <Image
        src="/BoxGym Kompakt.png"
        alt="TSV Falkensee BoxGym"
        width={size}
        height={size}
        className="h-auto w-auto object-contain"
        priority
      />
    </Link>
  )
}
