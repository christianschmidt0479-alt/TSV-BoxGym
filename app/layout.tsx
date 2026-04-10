import type { Metadata } from "next"
import Link from "next/link"
import { APP_VERSION } from "@/lib/appVersion"
import { getAppBaseUrl } from "@/lib/mailConfig"
import { TrainerSessionGuard } from "@/components/trainer-session-guard"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import "./globals.css"

const brandName = "TSV BoxGym"
const iconVersion = `v=${APP_VERSION}-tsv-boxgym-logo-v7`
const tabIcon = `/boxgym-headline-old.png?${iconVersion}`
const faviconIcon = `/boxgym-headline-old.png?${iconVersion}`
const appleIcon = `/boxgym-apple-icon.png?${iconVersion}`
const socialImage = "/opengraph-image"
const appBaseUrl = getAppBaseUrl()

export const metadata: Metadata = {
  metadataBase: new URL(appBaseUrl),
  applicationName: brandName,
  title: brandName,
  description: brandName,
  appleWebApp: {
    capable: true,
    title: brandName,
    statusBarStyle: "default",
  },
  openGraph: {
    title: brandName,
    description: brandName,
    siteName: brandName,
    locale: "de_DE",
    type: "website",
    url: appBaseUrl,
    images: [
      {
        url: socialImage,
        width: 512,
        height: 512,
        alt: brandName,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: brandName,
    description: brandName,
    images: [socialImage],
  },
  icons: {
    icon: [
      { url: faviconIcon, type: "image/png" },
      { url: tabIcon, type: "image/png", sizes: "512x512" },
    ],
    shortcut: faviconIcon,
    apple: [{ url: appleIcon, sizes: "180x180", type: "image/png" }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen flex-col">
          <TrainerSessionGuard />
          <WorkspaceSwitcher />
          <div className="flex-1">{children}</div>
          <div className="pointer-events-none fixed bottom-4 right-4 z-40 rounded-full border border-zinc-200 bg-white/95 px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm backdrop-blur print:hidden">
            Version {APP_VERSION}
          </div>
          <footer className="px-4 pb-4 pt-2 print:hidden md:px-6">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
                <Link href="/datenschutz" className="font-medium text-zinc-600 underline underline-offset-4 hover:text-[#154c83]">
                  Datenschutz
                </Link>
                <a
                  href="https://tsv-falkensee.de/impressum"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-zinc-600 underline underline-offset-4 hover:text-[#154c83]"
                >
                  Vereinsimpressum
                </a>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
