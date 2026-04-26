
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
          <AppVersion />
        </AreaProvider>
      </body>
    </html>
  )
}