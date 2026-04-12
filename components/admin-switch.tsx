import Link from "next/link";

interface AdminSwitchProps {
  current: "alt" | "neu";
}

export function AdminSwitch({ current }: AdminSwitchProps) {
  return (
    <nav className="flex gap-2 items-center justify-center my-2">
      <Link
        href="/verwaltung"
        className={
          current === "alt"
            ? "px-3 py-1 rounded bg-[#154c83] text-white font-semibold shadow-sm text-sm border border-[#154c83] pointer-events-none"
            : "px-3 py-1 rounded bg-white text-[#154c83] border border-[#cdd9e6] hover:bg-[#f0f6fc] text-sm font-medium"
        }
        aria-current={current === "alt" ? "page" : undefined}
      >
        Alter Admin
      </Link>
      <Link
        href="/verwaltung-neu"
        className={
          current === "neu"
            ? "px-3 py-1 rounded bg-[#154c83] text-white font-semibold shadow-sm text-sm border border-[#154c83] pointer-events-none"
            : "px-3 py-1 rounded bg-white text-[#154c83] border border-[#cdd9e6] hover:bg-[#f0f6fc] text-sm font-medium"
        }
        aria-current={current === "neu" ? "page" : undefined}
      >
        Neuer Admin
      </Link>
    </nav>
  );
}
