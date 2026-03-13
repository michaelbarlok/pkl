"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteSheetButton({ sheetId }: { sheetId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm("Are you sure you want to permanently delete this sheet and all its registrations? This cannot be undone.")) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/sheets/${sheetId}/delete`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete sheet.");
      } else {
        router.refresh();
      }
    } catch {
      alert("Failed to delete sheet.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-sm text-red-400 hover:text-red-500 disabled:opacity-50"
    >
      {deleting ? "..." : "Delete"}
    </button>
  );
}
