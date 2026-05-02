import Link from "next/link"
import { redirect } from "next/navigation"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { resolveUserContext } from "@/lib/resolveUserContext"
import { needsWeight } from "@/lib/memberUtils"
import { MemberAreaBrandHeader } from "@/components/member-area/MemberAreaBrandHeader"
import { FormContainer } from "@/components/ui/form-container"
import { DOWNLOAD_DOCUMENTS } from "@/lib/downloadDocuments"

export default async function MemberDownloadPage() {
  const resolvedContext = await resolveUserContext()

  if (!resolvedContext.isLoggedIn) {
    redirect("/mein-bereich/login")
  }

  if (!resolvedContext.isMember || resolvedContext.isAdmin || !resolvedContext.memberId) {
    redirect("/mein-bereich")
  }

  const supabase = createServerSupabaseServiceClient()
  const { data: member } = await supabase
    .from("members")
    .select("base_group, is_competition_member, is_wettkaempfer")
    .eq("id", resolvedContext.memberId)
    .maybeSingle()

  const canAccessDownloads = Boolean(member && (member.is_competition_member === true || needsWeight(member)))

  if (!canAccessDownloads) {
    redirect("/mein-bereich")
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-3 py-4 sm:px-4 sm:py-6">
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <MemberAreaBrandHeader
          title="Downloads"
          subtitle="Wettkampfunterlagen und Gewichtsklassen"
          actionSlot={
            <Link
              href="/mein-bereich/dashboard"
              className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/25"
            >
              Zurueck zum Dashboard
            </Link>
          }
        />

        <FormContainer title="Wettkampf & Gewicht" description="Offizielle Unterlagen fuer Wettkaempfer und L-Gruppe">
          <div className="space-y-3">
            {DOWNLOAD_DOCUMENTS.map((document) => (
              <div key={document.href} className="rounded-xl border border-zinc-200 bg-white p-4">
                <p className="text-sm font-semibold text-zinc-900">{document.title}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={document.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50"
                  >
                    PDF ansehen
                  </a>
                  <a
                    href={document.href}
                    download
                    className="rounded-lg bg-[#154c83] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#103b66]"
                  >
                    PDF herunterladen
                  </a>
                </div>
              </div>
            ))}
          </div>
        </FormContainer>
      </div>
    </div>
  )
}
