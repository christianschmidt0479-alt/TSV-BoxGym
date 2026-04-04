"use client"

import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Printer } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { buildAdminQrEntries, type AdminQrEntryKey } from "@/lib/adminQrEntries"
import { Button } from "@/components/ui/button"
import { clearTrainerAccessSession } from "@/lib/trainerAccess"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"

const VALID_SCOPES: AdminQrEntryKey[] = ["registration", "member-checkin", "trial-signup"]

type QrPrintClientProps = {
  initialScope: string
}

export default function QrPrintClient({ initialScope }: QrPrintClientProps) {
  const router = useRouter()
  const printedRef = useRef(false)
  const [resolvedBaseUrl] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.origin.replace(/\/+$/, "")
    }

    const appBaseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
    return appBaseUrl.replace(/\/+$/, "")
  })
  const [memberQrUrl, setMemberQrUrl] = useState("")
  const [trialQrUrl, setTrialQrUrl] = useState("")

  const loadQrUrl = useCallback(async (panel: "member" | "trial") => {
    const response = await fetch(`/api/qr-access-url?panel=${panel}`)

    if (response.status === 401 || response.status === 403) {
      await clearTrainerAccessSession({ remote: false })
      router.replace("/trainer-zugang")
      router.refresh()
      return false
    }

    if (!response.ok) {
      return false
    }

    const payload = (await response.json()) as { url?: string }
    if (panel === "member") {
      setMemberQrUrl(payload.url?.trim() ?? "")
    } else {
      setTrialQrUrl(payload.url?.trim() ?? "")
    }

    return true
  }, [router])

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadQrUrl("member"), loadQrUrl("trial")])
      } catch (error) {
        console.error("qr print urls failed", error)
      }
    })()
  }, [loadQrUrl])

  const allEntries = useMemo(
    () =>
      buildAdminQrEntries({
        baseUrl: resolvedBaseUrl,
        memberQrUrl,
        trialQrUrl,
      }),
    [memberQrUrl, resolvedBaseUrl, trialQrUrl]
  )

  const printableEntries = useMemo(() => {
    if (initialScope === "all") {
      return allEntries
    }

    if (!VALID_SCOPES.includes(initialScope as AdminQrEntryKey)) {
      return []
    }

    return allEntries.filter((entry) => entry.key === initialScope)
  }, [allEntries, initialScope])

  const readyToPrint = printableEntries.length > 0 && printableEntries.every((entry) => !!entry.url)

  useEffect(() => {
    if (!readyToPrint || printedRef.current) {
      return
    }

    printedRef.current = true
    window.setTimeout(() => window.print(), 150)
  }, [readyToPrint])

  return (
    <div className="min-h-screen bg-[#eef3f8] text-zinc-900 print:bg-white">
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 8mm;
        }

        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: white;
          }

          .qr-print-page {
            height: calc(297mm - 16mm);
          }
        }
      `}</style>

      <div className="sticky top-0 z-20 border-b border-[#d8e3ee] bg-white/92 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#154c83]">QR-Druck</div>
            <h1 className="text-lg font-bold text-[#154c83]">A4-Druckansicht</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="rounded-2xl">
              <Link href="/verwaltung/qr-codes">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zurück
              </Link>
            </Button>
            <Button className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Jetzt drucken
            </Button>
          </div>
        </div>
      </div>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 md:px-6 print:max-w-none print:gap-0 print:px-0 print:py-0">
        {!printableEntries.length ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 print:hidden">
            Unbekannte Druckauswahl.
          </div>
        ) : null}

        {printableEntries.map((entry, index) => (
          <section
            key={entry.key}
            className="qr-print-page flex min-h-[calc(297mm-16mm)] flex-col justify-between overflow-hidden rounded-[28px] border border-[#d8e3ee] bg-[radial-gradient(circle_at_top_right,rgba(230,51,42,0.10),transparent_28%),linear-gradient(180deg,#ffffff_0%,#f6f9fc_100%)] p-[10mm] shadow-sm print:min-h-0 print:rounded-none print:border-0 print:p-[8mm] print:shadow-none"
            style={{ breakAfter: index === printableEntries.length - 1 ? "auto" : "page" }}
          >
            <header className="text-center">
              <Image
                src="/boxgym-headline-old.png"
                alt="TSV Falkensee BoxGym"
                width={180}
                height={76}
                className="mx-auto mb-5 h-auto w-[180px] max-w-full object-contain print:mb-4 print:w-[165px]"
                priority
              />
              <div className="inline-flex rounded-full bg-[#154c83]/8 px-5 py-1.5 text-[9pt] font-semibold uppercase tracking-[0.16em] text-[#154c83] print:px-4 print:py-1 print:text-[8.5pt]">
                {entry.eyebrow}
              </div>
              <h1 className="mt-4 text-[21pt] leading-[1.1] font-bold text-[#154c83] print:mt-3 print:text-[18pt]">{entry.title}</h1>
              <p
                className={`mx-auto mt-3 max-w-[145mm] text-[10.5pt] leading-[1.45] text-slate-600 print:mt-2 print:max-w-[140mm] print:text-[9.5pt] print:leading-[1.35] ${
                  entry.key === "trial-signup" ? "print:mb-[-6mm]" : ""
                }`}
              >
                {entry.description}
              </p>
            </header>

            <main className="my-6 flex flex-col items-center gap-5 print:mt-4 print:mb-1 print:gap-4">
              <div className="rounded-[28px] border border-[#d8e3ee] bg-white p-5 shadow-[0_10px_30px_rgba(15,39,64,0.06)] print:rounded-[22px] print:p-4">
                <div className="flex h-[100mm] w-[100mm] items-center justify-center rounded-[22px] bg-white print:h-[92mm] print:w-[92mm] print:rounded-[18px]">
                  {entry.url ? (
                    <QRCodeSVG
                      value={entry.url}
                      title={entry.alt}
                      size={360}
                      level="M"
                      marginSize={2}
                      bgColor="#ffffff"
                      fgColor="#111827"
                      className="block h-full w-full"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-[22px] bg-zinc-100 text-sm text-zinc-500">
                      QR-Link wird geladen...
                    </div>
                  )}
                </div>
              </div>

              <div className="max-w-[145mm] rounded-[18px] border border-[#d8e3ee] bg-[#f7fbff] px-5 py-4 text-center text-[10pt] leading-[1.45] text-[#244566] print:max-w-[140mm] print:px-4 print:py-3 print:text-[9pt] print:leading-[1.35]">
                {entry.helper}
              </div>
            </main>

            <footer className="flex flex-col items-center gap-2 text-center print:gap-0">
              <div className="text-[9pt] font-semibold uppercase tracking-[0.12em] text-[#154c83] print:text-[8pt]">TSV BoxGym</div>
            </footer>
          </section>
        ))}
      </main>
    </div>
  )
}