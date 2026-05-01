
import "./globals.css"
import type { Metadata, Viewport } from "next"
import { AreaProvider } from "@/lib/area-context"
import Header from "@/components/Header"
import AppVersion from "@/components/AppVersion"

export const viewport: Viewport = {
  themeColor: "#154c83",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL("https://www.tsvboxgym.de"),
  title: "TSV BoxGym",
  description: "Mitgliederbereich TSV Falkensee BoxGym",
  icons: {
    icon: [
      { url: "/icons/favicon-16-v2.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32-v2.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192-v2.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon-v2.png", sizes: "180x180", type: "image/png" }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <AreaProvider>
          <Header />
          {children}
          <footer data-app-footer className="bg-gray-50 border-t border-gray-200">
            <div className="max-w-4xl mx-auto text-center text-xs text-gray-500 py-6 space-x-4">
              <a href="/impressum" className="hover:underline">Impressum</a>
              <a href="/datenschutz" className="hover:underline">Datenschutz</a>
            </div>
          </footer>
          <div data-app-version>
            <AppVersion />
          </div>
        </AreaProvider>
      </body>
    </html>
  )
}