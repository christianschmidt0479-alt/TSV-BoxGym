"use server";
import { cookies } from "next/headers";
import { TRAINER_SESSION_COOKIE, verifyTrainerSessionToken } from "@/lib/authSession";
import { deleteMember } from "@/lib/boxgymDb";

export async function handleDeleteMemberServer(memberId: string) {
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
  try {
    await deleteMember(memberId);
    return { ok: true };
  } catch (e: any) {
    return { error: "Aktion fehlgeschlagen" };
  }
}
