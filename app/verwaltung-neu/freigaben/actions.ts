"use server";
import { cookies } from "next/headers";
import { TRAINER_SESSION_COOKIE, verifyTrainerSessionToken } from "@/lib/authSession";
import { approveMember, findMemberById } from "@/lib/boxgymDb";
import { validateEmail, validateName, validateBirthdate } from "@/lib/formValidation";
import { parseTrainingGroup } from "@/lib/trainingGroups";

export async function handleApproveServer(memberId: string): Promise<{ ok?: boolean; error?: string }> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get?.(TRAINER_SESSION_COOKIE);
  const session = await verifyTrainerSessionToken(sessionCookie?.value);
  const isAdmin = session?.role === "admin" || session?.accountRole === "admin";
  if (!isAdmin) {
    return { error: "Nicht berechtigt" };
  }
  if (!memberId || typeof memberId !== "string") {
    return { error: "Ungültige ID" };
  }

  // Mitglied laden und Pflichtfelder prüfen
  const member = await findMemberById(memberId);
  if (!member) return { error: "Mitglied nicht gefunden" };

  // Pflichtfeld: Stammgruppe
  if (!member.base_group || !parseTrainingGroup(member.base_group)) {
    return { error: "Stammgruppe muss gesetzt sein." };
  }
  // Pflichtfeld: E-Mail
  if (!member.email || !validateEmail(member.email).valid) {
    return { error: "Gültige E-Mail muss gesetzt sein." };
  }
  // Pflichtfeld: Name
  if (!member.first_name || !validateName(member.first_name, "Vorname").valid) {
    return { error: "Vorname fehlt oder ungültig." };
  }
  if (!member.last_name || !validateName(member.last_name, "Nachname").valid) {
    return { error: "Nachname fehlt oder ungültig." };
  }
  // Pflichtfeld: Geburtsdatum (optional, aber empfohlen)
  if (!member.birthdate || !validateBirthdate(member.birthdate).valid) {
    return { error: "Geburtsdatum fehlt oder ungültig." };
  }

  try {
    await approveMember(memberId);
    return { ok: true };
  } catch (e: any) {
    return { error: "Aktion fehlgeschlagen" };
  }
}
