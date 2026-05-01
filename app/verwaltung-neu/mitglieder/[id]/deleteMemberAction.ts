"use server";
import { deleteMember } from "@/lib/boxgymDb";
import { redirect } from "next/navigation";

export async function handleDeleteMember(memberId: string, returnTo?: string) {
  await deleteMember(memberId);

  const safeReturnTo =
    typeof returnTo === "string" &&
    returnTo.startsWith("/verwaltung-neu/mitglieder") &&
    !returnTo.startsWith("//")
      ? returnTo
      : "/verwaltung-neu/mitglieder"

  redirect(safeReturnTo);
}