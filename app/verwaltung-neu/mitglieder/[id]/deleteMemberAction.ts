"use server";
import { deleteMember } from "@/lib/boxgymDb";
import { redirect } from "next/navigation";

export async function handleDeleteMember(memberId: string) {
  await deleteMember(memberId);
  redirect(`/verwaltung-neu/mitglieder`);
}