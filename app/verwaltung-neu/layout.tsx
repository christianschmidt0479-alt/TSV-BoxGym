
import Link from "next/link";
import AdminGuard from "./admin-guard";
import { AdminSwitch } from "@/components/admin-switch";
import { TrainerLogoutButton } from "@/components/trainer-logout-button";
import { headers } from "next/headers";

// Nur aktive, wirklich nutzbare Menüpunkte:
const navItems = [
  { href: "/verwaltung-neu", label: "Dashboard" },
  { href: "/verwaltung-neu/freigaben", label: "Freigaben" },
  { href: "/verwaltung-neu/mitglieder", label: "Mitglieder" },
  { href: "/verwaltung-neu/system", label: "System" },
];

export default async function VerwaltungNeuLayout({ children }: { children: React.ReactNode }) {
  // Aktuellen Pfad aus den Request-Headern extrahieren (serverseitig)
  const h = await headers();
  const pathname = h.get("x-invoke-path") || h.get("x-original-url") || "";
  return (
    <AdminGuard>
      <div className="min-h-screen bg-zinc-50">
        <header className="border-b bg-white shadow-sm sticky top-0 z-20">
          <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-4">
              <span className="font-bold text-[#154c83] text-xl tracking-tight select-none">TSV Admin</span>
              <nav className="flex items-center gap-1 md:gap-2 overflow-x-auto">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={
                        "px-3 py-1 rounded text-sm font-medium transition-colors whitespace-nowrap " +
                        (isActive
                          ? "bg-[#154c83] text-white shadow-sm"
                          : "text-zinc-700 hover:bg-zinc-100 hover:text-[#154c83]")
                      }
                      aria-current={isActive ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <TrainerLogoutButton />
            </div>
          </div>
        </header>
        {/* Admin-Umschalter: nur im Adminbereich sichtbar, temporär */}
        <div className="max-w-6xl mx-auto px-4 md:px-0">
          <div className="pt-2 pb-1">
            <AdminSwitch current="neu" />
          </div>
        </div>
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
      </div>
    </AdminGuard>
  );
}
