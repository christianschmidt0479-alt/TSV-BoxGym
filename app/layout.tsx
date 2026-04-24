
import "./globals.css"
import { AreaProvider } from "@/lib/area-context"
import Header from "@/components/Header"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <AreaProvider>
          <Header />
          {children}
        </AreaProvider>
      </body>
    </html>
  )
}