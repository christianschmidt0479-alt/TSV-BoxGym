import { APP_VERSION } from "@/lib/appVersion"

export default function AppVersion() {
  return (
    <div
      className="hidden md:block"
      style={{
        position: "fixed",
        bottom: "8px",
        right: "12px",
        fontSize: "12px",
        opacity: 0.5,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      Version {APP_VERSION}
    </div>
  )
}
