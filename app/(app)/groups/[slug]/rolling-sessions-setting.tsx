"use client";

import { useState } from "react";

export function RollingSessionsSetting({
  groupId,
  currentValue,
}: {
  groupId: string;
  currentValue: number;
}) {
  const [value, setValue] = useState(currentValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (value === currentValue || value < 1) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/groups/${groupId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rolling_sessions_count: value }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-surface-muted whitespace-nowrap">
        Stats window:
      </label>
      <input
        type="number"
        min={1}
        max={100}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="input w-20 text-center text-sm"
      />
      <span className="text-sm text-surface-muted">sessions</span>
      {value !== currentValue && (
        <button
          onClick={handleSave}
          disabled={saving || value < 1}
          className="btn-secondary text-xs"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      )}
      {saved && (
        <span className="text-xs text-teal-400">Saved</span>
      )}
    </div>
  );
}
