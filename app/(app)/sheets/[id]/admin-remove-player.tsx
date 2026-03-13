"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminRemovePlayer({
  registrationId,
  playerName,
}: {
  registrationId: string;
  playerName: string;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    if (!confirm(`Remove ${playerName} from this sheet?`)) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/sheets/registrations/${registrationId}/remove`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove player.");
      }
      router.refresh();
    } catch {
      alert("Failed to remove player.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <button
      onClick={handleRemove}
      disabled={removing}
      className="text-xs text-red-400 hover:text-red-300 font-medium"
      title={`Remove ${playerName}`}
    >
      {removing ? "..." : "Remove"}
    </button>
  );
}
