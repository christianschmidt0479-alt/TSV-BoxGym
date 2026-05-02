
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import DeleteButton from "./DeleteButton";
import { findMemberById, changeMemberBaseGroup, updateMemberCompetitionData, updateMemberRegistrationData } from "@/lib/boxgymDb";
import { TRAINING_GROUPS, parseTrainingGroup } from "@/lib/trainingGroups";
import { validateName, validateBirthdate } from "@/lib/formValidation";
import { OfficeMatchBadge, getOfficeCheckedAtText, getOfficeMatchText } from "@/components/verwaltung-neu/OfficeMatchBadge";
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase";
import { needsWeight } from "@/lib/memberUtils";




function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "–";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

type RoleState = {
  trainerId: string | null;
  trainerRole: "trainer" | "admin" | null;
  trainerApproved: boolean;
  trainerEmailVerified: boolean;
  trainerLinkedMemberId: string | null;
  trainerProfileLinked: boolean;
};

async function loadRoleState(memberId: string, memberEmail: string | null | undefined): Promise<RoleState> {
  const supabase = createServerSupabaseServiceClient();
  const normalizedEmail = (memberEmail ?? "").trim().toLowerCase();

  const linkedResponse = await supabase
    .from("trainer_accounts")
    .select("id, role, is_approved, email_verified, linked_member_id")
    .eq("linked_member_id", memberId)
    .maybeSingle();

  if (linkedResponse.error) {
    throw linkedResponse.error;
  }

  let trainer = linkedResponse.data;

  if (!trainer && normalizedEmail) {
    const emailResponse = await supabase
      .from("trainer_accounts")
      .select("id, role, is_approved, email_verified, linked_member_id")
      .eq("email", normalizedEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (emailResponse.error) {
      throw emailResponse.error;
    }

    trainer = emailResponse.data;
  }

  let trainerProfileLinked = false;
  if (trainer?.id) {
    const profileResponse = await supabase
      .from("training_trainer_profiles")
      .select("trainer_id")
      .eq("trainer_id", trainer.id)
      .maybeSingle();

    if (!profileResponse.error) {
      trainerProfileLinked = Boolean(profileResponse.data?.trainer_id);
    }
  }

  return {
    trainerId: trainer?.id ?? null,
    trainerRole: trainer?.role === "admin" ? "admin" : trainer?.id ? "trainer" : null,
    trainerApproved: Boolean(trainer?.is_approved),
    trainerEmailVerified: Boolean(trainer?.email_verified),
    trainerLinkedMemberId: typeof trainer?.linked_member_id === "string" ? trainer.linked_member_id : null,
    trainerProfileLinked,
  };
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

  const roleState = await loadRoleState(member.id, member.email);

  // Gewichtstagebuch — nur für Wettkämpfer / L-Gruppe
  type AdminWeightEntry = { created_at: string; weight_kg: number; source: string; note: string | null }
  type AdminWeightData = {
    targetWeightKg: number | null
    lastWeightKg: number | null
    weightDistanceKg: number | null
    entries: AdminWeightEntry[]
  }
  let adminWeightData: AdminWeightData | null = null

  if (needsWeight(member)) {
    const supabaseW = createServerSupabaseServiceClient()
    const targetWeightKg = typeof (member as Record<string, unknown>).competition_target_weight === "number"
      ? (member as Record<string, unknown>).competition_target_weight as number
      : null

    let entries: AdminWeightEntry[] = []
    let lastWeightKg: number | null = null

    try {
      const { data: logRows, error: logError } = await supabaseW
        .from("member_weight_logs")
        .select("created_at, weight_kg, source, note")
        .eq("member_id", member.id)
        .order("created_at", { ascending: false })
        .limit(10)

      if (!logError && logRows && logRows.length > 0) {
        entries = logRows as AdminWeightEntry[]
      } else {
        // Fallback: checkins.weight
        const { data: checkinRows } = await supabaseW
          .from("checkins")
          .select("created_at, weight")
          .eq("member_id", member.id)
          .not("weight", "is", null)
          .order("created_at", { ascending: false })
          .limit(10)

        if (checkinRows && checkinRows.length > 0) {
          entries = checkinRows
            .filter((r) => r.weight !== null)
            .map((r) => ({
              created_at: r.created_at,
              weight_kg: Number(r.weight),
              source: "checkin",
              note: null,
            }))
        }
      }
    } catch {
      // Tabelle fehlt oder Query-Fehler – kein Absturz, leere Liste
    }

    lastWeightKg = entries[0]?.weight_kg ?? null
    const weightDistanceKg =
      targetWeightKg !== null && lastWeightKg !== null
        ? Math.round((lastWeightKg - targetWeightKg) * 10) / 10
        : null

    adminWeightData = { targetWeightKg, lastWeightKg, weightDistanceKg, entries }
  }

  async function postPersonRoleAction(payload: Record<string, unknown>, memberId: string, successMessage: string, fallbackError: string) {
    "use server";

    const reqHeaders = await headers();
    const host = reqHeaders.get("host") || "localhost:3000";
    const proto = reqHeaders.get("x-forwarded-proto") || "http";
    const origin = reqHeaders.get("origin") || `${proto}://${host}`;
    const cookie = reqHeaders.get("cookie") || "";

    const response = await fetch(`${origin}/api/admin/person-roles`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }).catch(() => null);

    if (!response || !response.ok) {
      let message = fallbackError;
      if (response) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        if (body?.error) {
          message = body.error;
        }
      }
      redirect(`/verwaltung-neu/mitglieder/${memberId}?error=${encodeURIComponent(message)}`);
    }

    redirect(`/verwaltung-neu/mitglieder/${memberId}?success=${encodeURIComponent(successMessage)}`);
  }

  async function handleGrantTrainer(formData: FormData) {
    "use server";
    const member_id = formData.get("member_id")?.toString() ?? id;
    const sendAccessMail = formData.get("send_access_mail") === "on";

    await postPersonRoleAction(
      { action: "grant_trainer", memberId: member_id, sendAccessMail },
      member_id,
      sendAccessMail
        ? "Trainerrolle gesetzt. Zugangsmail wurde bei Bedarf versendet."
        : "Trainerrolle gesetzt.",
      "Trainerrolle konnte nicht gesetzt werden."
    );
  }

  async function handleRevokeTrainer(formData: FormData) {
    "use server";
    const member_id = formData.get("member_id")?.toString() ?? id;

    await postPersonRoleAction(
      { action: "revoke_trainer", memberId: member_id },
      member_id,
      "Trainerrolle wurde deaktiviert. Mitgliedsdaten bleiben unverändert.",
      "Trainerrolle konnte nicht entfernt werden."
    );
  }

  async function handleEnsureSportler(formData: FormData) {
    "use server";
    const member_id = formData.get("member_id")?.toString() ?? id;
    const base_group = formData.get("base_group")?.toString() ?? "";

    await postPersonRoleAction(
      { action: "ensure_sportler", memberId: member_id, baseGroup: base_group },
      member_id,
      "Sportlerstatus wurde bestätigt.",
      "Sportlerstatus konnte nicht gesetzt werden."
    );
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
        competition_target_weight: (() => {
          if (!is_competition_member) return null
          const parsed = parseFloat(competition_target_weight)
          if (!Number.isFinite(parsed) || parsed < 20 || parsed > 250) return null
          return parsed
        })(),
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

      <div className="bg-white rounded shadow-sm border border-zinc-100 p-6 space-y-4">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Rollen &amp; Rechte</div>
          <div className="text-xs text-zinc-500">Rollen werden serverseitig durch Admin-Aktionen gepflegt. Mitglieds- und Check-in-Daten bleiben unverändert.</div>
        </div>

        <div className="grid gap-2 text-sm text-zinc-800 md:grid-cols-2">
          <div>
            <span className="text-zinc-500">Sportler aktiv:</span>{" "}
            <span className={member.is_approved ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
              {member.is_approved ? "ja (freigegeben)" : "ja (noch nicht freigegeben)"}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Trainerrolle:</span>{" "}
            <span className={roleState.trainerId && roleState.trainerApproved ? "font-semibold text-emerald-700" : "font-semibold text-zinc-700"}>
              {roleState.trainerId
                ? roleState.trainerApproved
                  ? "ja (aktiv)"
                  : "ja (deaktiviert)"
                : "nein"}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Adminrolle:</span>{" "}
            <span className={roleState.trainerRole === "admin" ? "font-semibold text-emerald-700" : "font-semibold text-zinc-700"}>
              {roleState.trainerRole === "admin" ? "ja" : "nein"}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Verknüpftes Trainerprofil:</span>{" "}
            <span className={roleState.trainerProfileLinked ? "font-semibold text-emerald-700" : "font-semibold text-zinc-700"}>
              {roleState.trainerProfileLinked ? "ja" : "nein"}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Trainer-E-Mail bestätigt:</span>{" "}
            <span className={roleState.trainerEmailVerified ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
              {roleState.trainerId ? (roleState.trainerEmailVerified ? "ja" : "nein") : "-"}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Mitglied-Verknüpfung:</span>{" "}
            <span className={roleState.trainerLinkedMemberId === member.id ? "font-semibold text-emerald-700" : "font-semibold text-zinc-700"}>
              {roleState.trainerLinkedMemberId === member.id ? "ok" : roleState.trainerId ? "abweichend" : "-"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <form action={handleGrantTrainer} className="flex flex-wrap items-center gap-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2">
            <input type="hidden" name="member_id" value={member.id} />
            <label className="inline-flex items-center gap-1 text-xs text-zinc-700">
              <input type="checkbox" name="send_access_mail" defaultChecked />
              Zugangsmail senden
            </label>
            <button type="submit" className="rounded-md bg-[#154c83] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f3d6b]">
              Als Trainer berechtigen
            </button>
          </form>

          <form action={handleRevokeTrainer}>
            <input type="hidden" name="member_id" value={member.id} />
            <button type="submit" className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:border-red-300">
              Trainerrolle entfernen
            </button>
          </form>

          <form action={handleEnsureSportler} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="member_id" value={member.id} />
            <input type="hidden" name="base_group" value={member.base_group || ""} />
            <button type="submit" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:border-zinc-400">
              Als Sportler führen
            </button>
          </form>
        </div>

        <div className="text-[11px] text-zinc-500">
          Hinweis: "Sportlerstatus deaktivieren" wird bewusst noch nicht angeboten, um keine historischen Check-ins oder Mitgliedsdaten unbeabsichtigt zu beeinflussen.
        </div>
      </div>

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

      {adminWeightData ? (
        <div className="bg-white rounded shadow-sm border border-zinc-100 p-6 space-y-4">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Gewichtstagebuch</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Gewichtsdaten sind sensibel und nur für die sportliche Betreuung bestimmt.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
              <div className="text-xs text-zinc-500">Zielgewicht</div>
              <div className="mt-0.5 font-semibold text-zinc-900">
                {adminWeightData.targetWeightKg !== null
                  ? `${adminWeightData.targetWeightKg} kg`
                  : "Nicht hinterlegt"}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
              <div className="text-xs text-zinc-500">Letztes Gewicht</div>
              <div className="mt-0.5 font-semibold text-zinc-900">
                {adminWeightData.lastWeightKg !== null
                  ? `${adminWeightData.lastWeightKg} kg`
                  : "Kein Eintrag vorhanden"}
              </div>
            </div>
            {adminWeightData.weightDistanceKg !== null ? (
              <div className="col-span-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                <div className="text-xs text-zinc-500">Abstand zum Ziel</div>
                <div className={`mt-0.5 font-semibold ${
                  adminWeightData.weightDistanceKg <= 0 ? "text-emerald-700" : "text-zinc-900"
                }`}>
                  {adminWeightData.weightDistanceKg > 0
                    ? `+${adminWeightData.weightDistanceKg} kg über Ziel`
                    : adminWeightData.weightDistanceKg < 0
                    ? `${Math.abs(adminWeightData.weightDistanceKg)} kg unter Ziel`
                    : "Genau auf Zielgewicht"}
                </div>
              </div>
            ) : null}
          </div>
          {adminWeightData.entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left">
                    <th className="pb-1 pr-4 text-xs font-semibold text-zinc-500">Datum</th>
                    <th className="pb-1 pr-4 text-xs font-semibold text-zinc-500">Gewicht</th>
                    <th className="pb-1 pr-4 text-xs font-semibold text-zinc-500">Quelle</th>
                    <th className="pb-1 text-xs font-semibold text-zinc-500">Notiz</th>
                  </tr>
                </thead>
                <tbody>
                  {adminWeightData.entries.map((entry, i) => (
                    <tr key={i} className="border-b border-zinc-50">
                      <td className="py-1.5 pr-4 text-zinc-700">
                        {new Intl.DateTimeFormat("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          timeZone: "Europe/Berlin",
                        }).format(new Date(entry.created_at))}
                      </td>
                      <td className="py-1.5 pr-4 font-semibold text-zinc-900">{entry.weight_kg} kg</td>
                      <td className="py-1.5 pr-4 text-zinc-600">
                        {entry.source === "manual" ? "Manuell" : "Check-in"}
                      </td>
                      <td className="py-1.5 text-zinc-500">{entry.note ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-zinc-500">Noch keine Gewichtseinträge vorhanden.</div>
          )}
        </div>
      ) : null}

      <div className="flex gap-4 mt-4">
        <DeleteButton memberId={member.id} returnTo={returnTo} />
      </div>
    </div>
  );
}
