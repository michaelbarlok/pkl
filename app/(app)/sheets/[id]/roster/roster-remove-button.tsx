"use client";

import { useConfirm } from "@/components/confirm-modal";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface RosterRemoveButtonProps {
  registrationId: string;
  playerName: string;
}

export function RosterRemoveButton({
  registrationId,
  playerName,
}: RosterRemoveButtonProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    const ok = await confirm({
      title: `Remove ${playerName}?`,
      description: "They will be removed from this sheet. If there is a waitlist, the next player will be promoted.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/sheets/registrations/${registrationId}/remove`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove player");
      }
      router.refresh();
    } catch (err) {
      console.error("Failed to remove player:", err);
      alert("Failed to remove player. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleRemove}
      disabled={loading}
      className="btn-danger text-xs"
    >
      {loading ? "Removing..." : "Remove"}
    </button>
  );
}
