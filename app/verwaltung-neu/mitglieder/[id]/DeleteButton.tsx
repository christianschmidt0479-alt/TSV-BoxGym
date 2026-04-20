"use client";
import React from "react";
import { handleDeleteMember } from "./deleteMemberAction";

export default function DeleteButton({ memberId }: { memberId: string }) {
  function onButtonClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!confirm("Wirklich löschen?")) {
      e.preventDefault();
    }
  }

  async function action(formData: FormData) {
    // Ruft die ausgelagerte Server Action auf
    await handleDeleteMember(memberId);
  }

  return (
    <form action={action} style={{ display: "inline" }}>
      <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded" onClick={onButtonClick}>
        Löschen
      </button>
    </form>
  );
}