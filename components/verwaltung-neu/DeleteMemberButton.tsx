"use client";
import { useState, useTransition } from "react";

type DeleteMemberButtonProps = {
  memberId: string;
  memberName?: string;
  onDeleted?: () => void;
};

export default function DeleteMemberButton({ memberId, memberName, onDeleted }: DeleteMemberButtonProps) {
  const [loading, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleDelete() {
    setError(null); setSuccess(null);
    if (!window.confirm(`Mitglied ${memberName || memberId} wirklich unwiderruflich löschen?`)) return;
    startTransition(async () => {
      const res = await fetch("/verwaltung-neu/mitglieder/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const result = await res.json();
      if (result?.ok) {
        setSuccess("Gelöscht");
        if (onDeleted) onDeleted();
      } else {
        setError(result?.error || "Fehler");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="px-3 py-1 rounded bg-red-600 text-white font-medium text-sm disabled:opacity-60 ml-2"
    >
      {loading ? "..." : "Löschen"}
    </button>
  );
}
