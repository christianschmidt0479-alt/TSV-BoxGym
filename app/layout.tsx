
import "./globals.css"
import { AreaProvider } from "@/lib/area-context"
import Header from "@/components/Header"
import AppVersion from "@/components/AppVersion"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <AreaProvider>
          <Header />
          {children}
          <footer className="bg-gray-50 border-t border-gray-200">
            <div className="max-w-4xl mx-auto text-center text-xs text-gray-500 py-6 space-x-4">
              <a href="/impressum" className="hover:underline">Impressum</a>
              <a href="/datenschutz" className="hover:underline">Datenschutz</a>
            </div>
          </footer>
          <AppVersion />
        </AreaProvider>
      </body>
    </html>
  )
}