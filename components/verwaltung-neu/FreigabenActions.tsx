"use client";
import React, { useState, useTransition } from "react";
import Link from "next/link";

type FreigabenActionsProps = {
  member: any;
  handleApproveServer: (memberId: string) => Promise<{ ok?: boolean; error?: string }>;
};

export default function FreigabenActions({ member, handleApproveServer }: FreigabenActionsProps) {
  const [loading, startTransition] = useTransition();
  const [mailLoading, setMailLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    setSuccess(null); setError(null);
    startTransition(async () => {
      const result = await handleApproveServer(member.id);
      if (result?.ok) setSuccess("Freigegeben");
      if (result?.error) setError(result.error);
    });
  }

  async function handleResend() {
    setMailLoading(true); setError(null); setSuccess(null);
    try {
      const res = await fetch("/api/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "approval_notice",
          email: member.email,
          name: member.name,
          kind: "member",
        }),
      });
      if (!res.ok) throw new Error("Fehler beim Senden der Mail");
      setSuccess("Mail gesendet");
    } catch (e: any) {
      setError(e.message || "Fehler");
    } finally {
      setMailLoading(false);
    }
  }

  return (
    <div className="flex flex-row gap-2 mt-2 md:mt-0 md:ml-4">
      <button
        type="button"
        onClick={handleApprove}
        disabled={loading}
        className="px-3 py-1 rounded bg-blue-600 text-white font-medium text-sm disabled:opacity-60"
      >
        {loading ? "..." : "Freigeben"}
      </button>
      <button
        type="button"
        onClick={handleResend}
        disabled={mailLoading}
        className="px-3 py-1 rounded bg-zinc-100 text-zinc-700 font-medium text-sm disabled:opacity-60"
      >
        {mailLoading ? "..." : "Verifizierungs-Mail senden"}
      </button>
      <Link href="#" className="px-3 py-1 rounded bg-zinc-50 border text-zinc-700 font-medium text-sm pointer-events-none opacity-60">Öffnen</Link>
      {success && <span className="text-green-700 text-xs ml-2">{success}</span>}
      {error && <span className="text-red-700 text-xs ml-2">{error}</span>}
    </div>
  );
}