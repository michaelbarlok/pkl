"use client";

import { useConfirm } from "@/components/confirm-modal";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LeaveGroupButton({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [leaving, setLeaving] = useState(false);

  async function handleLeave() {
    const ok = await confirm({
      title: `Leave ${groupName}?`,
      description:
        "Your stats are saved — if you rejoin later, your step and win % come back with you. You'll also be removed from any upcoming sign-up sheets in this group.",
      confirmLabel: "Leave Group",
      cancelLabel: "Stay",
      variant: "danger",
    });
    if (!ok) return;

    setLeaving(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/leave`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to leave group.");
        setLeaving(false);
        return;
      }
      router.push("/groups");
      router.refresh();
    } catch {
      alert("Failed to leave group.");
      setLeaving(false);
    }
  }

  return (
    <button
      onClick={handleLeave}
      disabled={leaving}
      className="btn-secondary text-xs text-red-400 hover:text-red-300"
    >
      {leaving ? "Leaving..." : "Leave Group"}
    </button>
  );
}
