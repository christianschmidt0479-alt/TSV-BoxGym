
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import DeleteButton from "./DeleteButton";
import { findMemberById, changeMemberBaseGroup, updateMemberCompetitionData, updateMemberRegistrationData } from "@/lib/boxgymDb";
import { TRAINING_GROUPS, parseTrainingGroup } from "@/lib/trainingGroups";
import { validateName, validateBirthdate } from "@/lib/formValidation";
import { OfficeMatchBadge, getOfficeCheckedAtText, getOfficeMatchText } from "@/components/verwaltung-neu/OfficeMatchBadge";




function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "–";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}


export default async function MitgliedDetailPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<{ error?: string; returnTo?: string; success?: string }> }) {
  const { id } = await params;
  const member = await findMemberById(id);
  if (!member) return notFound();

  // searchParams als Promise behandeln
  let errorMsg = "";
  let returnTo = "";
  let successMsg = "";
  if (searchParams) {
    const sp = await searchParams;
    errorMsg = sp?.error || "";
    returnTo = sp?.returnTo || "";
    successMsg = sp?.error ? "" : (sp?.success || "");
  }

  // Server Actions
  async function handleSave(formData: FormData) {
    "use server";
    const first_name = formData.get("first_name")?.toString() ?? "";
    const last_name = formData.get("last_name")?.toString() ?? "";
    const birthdate = formData.get("birthdate")?.toString() ?? "";
    const base_group = formData.get("base_group")?.toString() ?? "";
    const is_competition_member = formData.get("is_competition_member") === "on";
    const has_competition_pass = formData.get("has_competition_pass") === "on";
    const competition_license_number = formData.get("competition_license_number")?.toString() ?? "";
    const competition_target_weight = formData.get("competition_target_weight")?.toString() ?? "";
    const last_medical_exam_date = formData.get("last_medical_exam_date")?.toString() ?? "";
    const competition_fights = Number(formData.get("competition_fights") ?? 0);
    const competition_wins = Number(formData.get("competition_wins") ?? 0);
    const competition_losses = Number(formData.get("competition_losses") ?? 0);
    const competition_draws = Number(formData.get("competition_draws") ?? 0);
    const member_id = formData.get("member_id")?.toString() ?? id;

    // Pflichtfeld-Validierung
    let error = "";
    if (!validateName(first_name, "Vorname").valid) {
      error = "Vorname fehlt oder ungültig.";
    } else if (!validateName(last_name, "Nachname").valid) {
      error = "Nachname fehlt oder ungültig.";
    } else if (!base_group || !parseTrainingGroup(base_group)) {
      error = "Stammgruppe muss gewählt werden.";
    } else if (!birthdate || !validateBirthdate(birthdate).valid) {
      error = "Geburtsdatum fehlt oder ungültig.";
    }
    if (error) {
      redirect(`/verwaltung-neu/mitglieder/${member_id}?error=${encodeURIComponent(error)}`);
    }

    await changeMemberBaseGroup(member_id, base_group);
    await updateMemberRegistrationData(member_id, { first_name, last_name, birthdate });
    // Nur wenn Kämpferstatus gesetzt, alle Felder speichern, sonst alles auf Default
    await updateMemberCompetitionData(member_id, {
      is_competition_member,
      has_competition_pass: is_competition_member ? has_competition_pass : false,
      competition_license_number: is_competition_member ? competition_license_number : "",
      last_medical_exam_date: is_competition_member ? last_medical_exam_date : undefined,
      competition_fights: is_competition_member ? Math.max(0, competition_fights) : 0,
      competition_wins: is_competition_member ? Math.max(0, competition_wins) : 0,
      competition_losses: is_competition_member ? Math.max(0, competition_losses) : 0,
      competition_draws: is_competition_member ? Math.max(0, competition_draws) : 0,
    });
    redirect(`/verwaltung-neu/mitglieder/${member_id}`);
  }

  async function handleUpdateGsMatchEmail(formData: FormData) {
    "use server";
    const member_id = formData.get("member_id")?.toString() ?? id;
    const gsMatchEmail = formData.get("gs_match_email")?.toString() ?? "";
    const reqHeaders = await headers();
    const host = reqHeaders.get("host") || "localhost:3000";
    const proto = reqHeaders.get("x-forwarded-proto") || "http";
    const origin = reqHeaders.get("origin") || `${proto}://${host}`;
    const cookie = reqHeaders.get("cookie") || "";

    const response = await fetch(`${origin}/api/admin/member-gs-match-email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie,
      },
      body: JSON.stringify({ memberId: member_id, gsMatchEmail }),
      cache: "no-store",
    }).catch(() => null);

    if (!response || !response.ok) {
      redirect(`/verwaltung-neu/mitglieder/${member_id}?error=${encodeURIComponent("GS-Abgleich E-Mail konnte nicht gespeichert werden.")}`);
    }

    redirect(`/verwaltung-neu/mitglieder/${member_id}?success=${encodeURIComponent("GS-Abgleich E-Mail wurde gespeichert.")}`);
  }

  async function handleManualGsConfirm(formData: FormData) {
    "use server";
    const member_id = formData.get("member_id")?.toString() ?? id;
    const reqHeaders = await headers();
    const host = reqHeaders.get("host") || "localhost:3000";
    const proto = reqHeaders.get("x-forwarded-proto") || "http";
    const origin = reqHeaders.get("origin") || `${proto}://${host}`;
    const cookie = reqHeaders.get("cookie") || "";

    const response = await fetch(`${origin}/api/admin/member-gs-manual-confirm`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie,
      },
      body: JSON.stringify({ memberId: member_id }),
      cache: "no-store",
    }).catch(() => null);

    if (!response || !response.ok) {
      redirect(`/verwaltung-neu/mitglieder/${member_id}?error=${encodeURIComponent("GS-Status konnte nicht manuell bestätigt werden.")}`);
    }

    redirect(`/verwaltung-neu/mitglieder/${member_id}?success=${encodeURIComponent("GS-Status wurde manuell bestätigt. Mitgliedsdaten wurden nicht verändert.")}`);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[#154c83] px-4 py-4">
        <div className="text-base font-semibold text-white">{member.first_name} {member.last_name}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={`/verwaltung-neu/gs-abgleich?focusMemberId=${encodeURIComponent(member.id)}&mode=link`}
            className="inline-flex items-center rounded-md border border-white/50 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
          >
            Mit GS-Datenbank abgleichen
          </a>
          <form action={handleManualGsConfirm}>
            <input type="hidden" name="member_id" value={member.id} />
            <button
              type="submit"
              className="inline-flex items-center rounded-md border border-white/50 bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              GS manuell bestätigen
            </button>
          </form>
        </div>
      </div>
      {errorMsg && (
        <div className="bg-red-100 text-red-700 px-4 py-2 rounded mb-4">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-100 text-emerald-800 px-4 py-2 rounded mb-4">
          {successMsg}
        </div>
      )}
      <form action={handleSave} className="bg-white rounded shadow-sm border border-zinc-100 p-6 space-y-4">
        <input type="hidden" name="member_id" value={member.id} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Vorname</label>
            <input name="first_name" defaultValue={member.first_name || ""} className="w-full border rounded px-2 py-1" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nachname</label>
            <input name="last_name" defaultValue={member.last_name || ""} className="w-full border rounded px-2 py-1" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">E-Mail</label>
          <div className="w-full rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm text-zinc-800">{member.email || "—"}</div>
          <div className="mt-1 text-[11px] text-zinc-500">Haupt-E-Mail für Login und Kommunikation.</div>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Geburtsdatum</label>
          <input name="birthdate" defaultValue={member.birthdate || ""} className="w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Stammgruppe</label>
          <select name="base_group" defaultValue={member.base_group || ""} className="w-full border rounded px-2 py-1">
            <option value="">–</option>
            {TRAINING_GROUPS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-700">
          <span className="font-semibold">GS-/Office:</span>
          <OfficeMatchBadge
            compact
            status={typeof member.office_list_status === "string" ? member.office_list_status : null}
            baseGroup={typeof member.base_group === "string" ? member.base_group : null}
            officeGroup={typeof member.office_list_group === "string" ? member.office_list_group : null}
            checkedAt={typeof member.office_list_checked_at === "string" ? member.office_list_checked_at : null}
          />
          <span>{getOfficeMatchText(typeof member.office_list_status === "string" ? member.office_list_status : null)}</span>
          <span>Office: {typeof member.office_list_group === "string" && member.office_list_group ? member.office_list_group : "-"}</span>
          <span>Geprüft: {getOfficeCheckedAtText(typeof member.office_list_checked_at === "string" ? member.office_list_checked_at : null)}</span>
          {member.base_group === "L-Gruppe" ? <span className="text-zinc-600">L-Gruppe: Abgleich über Stamm-/Office-Gruppe prüfen.</span> : null}
        </div>
        <div className="mt-8 border-t pt-6">
          <div className="text-lg font-semibold mb-2">Wettkampf</div>
          <div className="mb-4">
            <label className="block text-xs text-zinc-500 mb-1">Kämpferstatus</label>
            <input type="checkbox" name="is_competition_member" defaultChecked={!!member.is_competition_member} /> Kämpfer
          </div>
          {member.is_competition_member && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Wettkampfpass</label>
                <input type="checkbox" name="has_competition_pass" defaultChecked={!!member.has_competition_pass} /> Pass vorhanden
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Lizenznummer</label>
                <input name="competition_license_number" defaultValue={member.competition_license_number || ""} className="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Zielgewicht (kg)</label>
                <input name="competition_target_weight" type="number" step="0.1" min="0" defaultValue={member.competition_target_weight ?? ""} className="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Letzte Untersuchung</label>
                <input name="last_medical_exam_date" type="date" defaultValue={member.last_medical_exam_date || ""} className="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Kämpfe</label>
                <input name="competition_fights" type="number" min="0" defaultValue={member.competition_fights ?? 0} className="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Siege</label>
                <input name="competition_wins" type="number" min="0" defaultValue={member.competition_wins ?? 0} className="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Niederlagen</label>
                <input name="competition_losses" type="number" min="0" defaultValue={member.competition_losses ?? 0} className="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Unentschieden</label>
                <input name="competition_draws" type="number" min="0" defaultValue={member.competition_draws ?? 0} className="w-full border rounded px-2 py-1" />
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-4 mt-4">
          <button type="submit" className="rounded-md bg-[#154c83] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f3d6b]">Speichern</button>
        </div>
        <div className="mt-6">
          <div className="text-xs text-zinc-500 mb-1">Status</div>
          <div className="flex gap-4">
            <span className={member.is_approved ? "text-green-700 font-medium" : "text-orange-700 font-medium"}>
              {member.is_approved ? "Freigegeben" : "Offen"}
            </span>
            <span className={member.email_verified ? "text-green-700 font-medium" : "text-orange-700 font-medium"}>
              {member.email_verified ? "E-Mail bestätigt" : "E-Mail offen"}
            </span>
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500 mb-1">Registriert am</div>
          <div className="text-base text-zinc-800">{formatDate(member.created_at ?? null)}</div>
        </div>
      </form>

      <form action={handleUpdateGsMatchEmail} className="bg-white rounded shadow-sm border border-zinc-100 p-6 space-y-3">
        <input type="hidden" name="member_id" value={member.id} />
        <div className="text-sm font-semibold text-zinc-900">GS-Abgleich E-Mail</div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Alternative E-Mail für GS-Abgleich</label>
          <input
            name="gs_match_email"
            defaultValue={typeof member.gs_match_email === "string" ? member.gs_match_email : ""}
            className="w-full border rounded px-2 py-1"
          />
          <div className="mt-1 text-[11px] text-zinc-500">
            Diese E-Mail wird ausschließlich für den GS-Abgleich verwendet. Login, Passwort und Kommunikation bleiben über die Haupt-E-Mail unverändert.
          </div>
        </div>
        <div>
          <button type="submit" className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-zinc-400">GS-Abgleich E-Mail speichern</button>
        </div>
      </form>

      <div className="flex gap-4 mt-4">
        <DeleteButton memberId={member.id} returnTo={returnTo} />
      </div>
    </div>
  );
}
