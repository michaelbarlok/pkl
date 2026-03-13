"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Member {
  id: string;
  display_name: string;
}

export function AdminAddMember({
  sheetId,
  members,
}: {
  sheetId: string;
  members: Member[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleAdd() {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/sheets/${sheetId}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add member.");
      }
      const member = members.find((m) => m.id === selectedId);
      setSuccess(`${member?.display_name ?? "Member"} added.`);
      setSelectedId("");
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to add member.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-dark-100 mb-3">
        Add a Member
      </h3>
      {error && (
        <div className="mb-3 rounded-md bg-red-900/30 p-2 text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 rounded-md bg-teal-900/30 p-2 text-sm text-teal-300">
          {success}
        </div>
      )}
      <div className="flex gap-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="input flex-1"
        >
          <option value="">Select a member...</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={!selectedId || loading}
          className="btn-primary"
        >
          {loading ? "Adding..." : "Add"}
        </button>
      </div>
    </div>
  );
}
