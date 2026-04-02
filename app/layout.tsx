import type { Metadata } from "next"
import { APP_VERSION } from "@/lib/appVersion"
import { getAppBaseUrl } from "@/lib/mailConfig"
import { TrainerSessionGuard } from "@/components/trainer-session-guard"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import "./globals.css"

const brandName = "TSV BoxGym"
const iconVersion = `v=${APP_VERSION}-tsv-boxgym-logo-v6`
const svgIcon = `/tsv-boxgym-brand-mark.svg?${iconVersion}`
const tabIcon = `/tsv-boxgym-stack-icon.png?${iconVersion}`
const faviconIcon = `/favicon-tsv-boxgym-stack.ico?${iconVersion}`
const socialImage = "/tsv-boxgym-share-v3.png"
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
    card: "summary",
    title: brandName,
    description: brandName,
    images: [socialImage],
  },
  icons: {
    icon: [
      { url: svgIcon, type: "image/svg+xml" },
      { url: faviconIcon },
      { url: tabIcon, type: "image/png", sizes: "512x512" },
    ],
    shortcut: faviconIcon,
    apple: [{ url: `/tsv-boxgym-stack-apple.png?${iconVersion}`, sizes: "180x180", type: "image/png" }],
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
          <footer className="px-4 pb-4 pt-2 md:px-6">
            <div className="mx-auto flex max-w-7xl justify-end">
              <div className="rounded-full border border-zinc-200 bg-white/95 px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm backdrop-blur">
                Version {APP_VERSION}
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
