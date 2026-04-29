import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { MemberAreaBrandHeader } from "@/components/member-area/MemberAreaBrandHeader"
import { FormContainer } from "@/components/ui/form-container"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { MEMBER_AREA_SESSION_COOKIE, readMemberSession } from "@/lib/publicAreaSession"
import { MemberQrRevealClient } from "./MemberQrRevealClient"

export default async function MemberQrCodePage() {
  const cookieStore = await cookies()
  const hadMemberSessionCookie = Boolean(cookieStore.get(MEMBER_AREA_SESSION_COOKIE)?.value)
  const memberSession = await readMemberSession(cookieStore)

  if (!memberSession?.memberId) {
    redirect(hadMemberSessionCookie ? "/mein-bereich/login?reason=session_expired" : "/mein-bereich/login")
  }

  const supabase = createServerSupabaseServiceClient()
  const { data: member, error } = await supabase
    .from("members")
    .select("id, first_name, last_name, member_qr_token, member_qr_active")
    .eq("id", memberSession.memberId)
    .maybeSingle()

  if (error || !member) {
    redirect("/mein-bereich/dashboard")
  }

  const qrToken = typeof member.member_qr_token === "string" ? member.member_qr_token.trim() : ""
  const isQrActive = member.member_qr_active !== false
  const memberName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || "Mitglied"

  return (
    <FormContainer rootClassName="!min-h-[calc(100svh-11rem)] !py-3 md:!py-5">
      <div className="space-y-4 sm:space-y-5">
        <MemberAreaBrandHeader
          title="Mein Mitglieds-QR"
          subtitle={`Persoenlicher QR-Code fuer ${memberName}`}
        />

        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Alternative Check-in-Moeglichkeit</p>
          <p className="text-sm text-zinc-700">
            Der regulaere Check-in erfolgt ueber den QR-Code am Eingang oder per NFC.
            Nutze diesen persoenlichen QR nur, wenn der regulaere Check-in nicht moeglich ist.
          </p>
        </div>

        {!qrToken ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            Fuer dein Konto ist aktuell kein QR-Token vorhanden. Bitte wende dich an das Trainer- oder Admin-Team.
          </div>
        ) : (
          <MemberQrRevealClient qrToken={qrToken} isQrActive={isQrActive} />
        )}

        <Link
          href="/mein-bereich/dashboard"
          className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
        >
          Zurueck zum Dashboard
        </Link>
      </div>
    </FormContainer>
  )
}
