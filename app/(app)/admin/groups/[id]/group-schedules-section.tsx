"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTimeInZone } from "@/lib/utils";
import type { GroupRecurringSchedule } from "@/types/database";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TZ_OPTIONS = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
];

type EditorForm = {
  id?: string;
  label: string;
  day_of_week: number;
  event_time: string;
  timezone: string;
  location: string;
  player_limit: number;
  signup_closes_hours_before: number;
  withdraw_closes_hours_before: string; // empty string means null
  allow_member_guests: boolean;
  notes: string;
  is_active: boolean;
  enable_auto_post: boolean;
  post_day_of_week: number;
  post_time: string;
};

function defaultForm(): EditorForm {
  return {
    label: "",
    day_of_week: 2,
    event_time: "18:00",
    timezone: "America/New_York",
    location: "",
    player_limit: 16,
    signup_closes_hours_before: 2,
    withdraw_closes_hours_before: "",
    allow_member_guests: false,
    notes: "",
    is_active: true,
    enable_auto_post: false,
    post_day_of_week: 0,
    post_time: "10:00",
  };
}

function fromSchedule(s: GroupRecurringSchedule): EditorForm {
  const hasAutoPost = s.post_day_of_week != null && s.post_time != null;
  return {
    id: s.id,
    label: (s as unknown as { label?: string | null }).label ?? "",
    day_of_week: s.day_of_week,
    event_time: s.event_time.slice(0, 5),
    timezone: s.timezone ?? "America/New_York",
    location: s.location,
    player_limit: s.player_limit,
    signup_closes_hours_before: s.signup_closes_hours_before,
    withdraw_closes_hours_before: s.withdraw_closes_hours_before != null ? String(s.withdraw_closes_hours_before) : "",
    allow_member_guests: s.allow_member_guests,
    notes: s.notes ?? "",
    is_active: s.is_active,
    enable_auto_post: hasAutoPost,
    post_day_of_week: hasAutoPost ? s.post_day_of_week! : 0,
    post_time: hasAutoPost ? s.post_time!.slice(0, 5) : "10:00",
  };
}

export function GroupSchedulesSection({ groupId }: { groupId: string }) {
  const [schedules, setSchedules] = useState<GroupRecurringSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditorForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/schedule`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load schedules");
      setSchedules((json.schedules as GroupRecurringSchedule[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        label: editing.label.trim() || null,
        day_of_week: editing.day_of_week,
        event_time: editing.event_time + ":00",
        timezone: editing.timezone,
        location: editing.location.trim(),
        player_limit: editing.player_limit,
        signup_closes_hours_before: editing.signup_closes_hours_before,
        withdraw_closes_hours_before:
          editing.withdraw_closes_hours_before.trim() === ""
            ? null
            : parseInt(editing.withdraw_closes_hours_before, 10),
        allow_member_guests: editing.allow_member_guests,
        notes: editing.notes.trim() || null,
        is_active: editing.is_active,
        post_day_of_week: editing.enable_auto_post ? editing.post_day_of_week : null,
        post_time: editing.enable_auto_post ? editing.post_time + ":00" : null,
      };

      const url = editing.id
        ? `/api/groups/${groupId}/schedule?scheduleId=${editing.id}`
        : `/api/groups/${groupId}/schedule`;
      const method = editing.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      setEditing(null);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this play time?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/schedule?scheduleId=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to delete");
      }
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const sorted = useMemo(
    () => [...schedules].sort((a, b) =>
      a.day_of_week === b.day_of_week ? a.event_time.localeCompare(b.event_time) : a.day_of_week - b.day_of_week
    ),
    [schedules]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-dark-100">Play Times</h2>
        {!editing && (
          <button type="button" onClick={() => setEditing(defaultForm())} className="btn-primary text-sm">
            + Add Play Time
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-900/20 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-surface-muted">Loading play times…</p>
      ) : editing ? (
        <ScheduleEditor
          form={editing}
          onChange={setEditing}
          onCancel={() => { setEditing(null); setError(null); }}
          onSave={save}
          saving={saving}
        />
      ) : sorted.length === 0 ? (
        <p className="text-sm text-surface-muted">No play times configured yet.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((s) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              onEdit={() => setEditing(fromSchedule(s))}
              onDelete={() => remove(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleCard({
  schedule,
  onEdit,
  onDelete,
}: {
  schedule: GroupRecurringSchedule;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const label = (schedule as unknown as { label?: string | null }).label;
  const tz = schedule.timezone ?? "America/New_York";
  const tzAbbr = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value ?? "";
  const playLine = `${DAY_NAMES[schedule.day_of_week]}s · ${formatTimeInZone(schedule.event_time, tz)} ${tzAbbr}`;

  const autoPost =
    schedule.post_day_of_week != null && schedule.post_time != null
      ? `${DAY_SHORT[schedule.post_day_of_week]} ${formatTimeInZone(schedule.post_time, tz)}`
      : null;

  return (
    <div className={`card p-3 ${schedule.is_active ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {label && <p className="text-sm font-semibold text-dark-100">{label}</p>}
          <p className="text-sm text-dark-200">{playLine}</p>
          <p className="text-xs text-surface-muted mt-0.5">
            {schedule.location} · {schedule.player_limit} players
          </p>
          <p className="text-xs text-surface-muted mt-0.5">
            {autoPost ? (
              <>Auto-post: <span className="text-brand-vivid">{autoPost}</span></>
            ) : (
              <span className="text-surface-muted">No auto-post</span>
            )}
            {!schedule.is_active && <span className="ml-2 badge-gray">Inactive</span>}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={onEdit} className="text-sm text-brand-400 hover:text-brand-300">
            Edit
          </button>
          <button type="button" onClick={onDelete} className="text-sm text-adaptive-red hover:text-red-500">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleEditor({
  form,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  form: EditorForm;
  onChange: (f: EditorForm) => void;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
}) {
  const set = <K extends keyof EditorForm>(k: K, v: EditorForm[K]) => onChange({ ...form, [k]: v });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void onSave(); }}
      className="card space-y-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-dark-200">Label (optional)</span>
          <input
            type="text"
            value={form.label}
            onChange={(e) => set("label", e.target.value)}
            placeholder="e.g. Tuesday morning"
            className="input mt-1 w-full"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-dark-200">Day of week</span>
          <select
            value={form.day_of_week}
            onChange={(e) => set("day_of_week", parseInt(e.target.value, 10))}
            className="input mt-1 w-full"
          >
            {DAY_NAMES.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-dark-200">Start time</span>
          <input
            type="time"
            value={form.event_time}
            onChange={(e) => set("event_time", e.target.value)}
            className="input mt-1 w-full"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-dark-200">Timezone</span>
          <select
            value={form.timezone}
            onChange={(e) => set("timezone", e.target.value)}
            className="input mt-1 w-full"
          >
            {TZ_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-dark-200">Location</span>
          <input
            type="text"
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            className="input mt-1 w-full"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-dark-200">Player limit</span>
          <input
            type="number"
            min={1}
            value={form.player_limit}
            onChange={(e) => set("player_limit", parseInt(e.target.value, 10))}
            className="input mt-1 w-full"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-dark-200">Sign-up closes (hours before)</span>
          <input
            type="number"
            min={0}
            value={form.signup_closes_hours_before}
            onChange={(e) => set("signup_closes_hours_before", parseInt(e.target.value, 10))}
            className="input mt-1 w-full"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-dark-200">Withdraw closes (hours before)</span>
          <input
            type="number"
            min={0}
            placeholder="Same as sign-up"
            value={form.withdraw_closes_hours_before}
            onChange={(e) => set("withdraw_closes_hours_before", e.target.value)}
            className="input mt-1 w-full"
          />
        </label>
        <label className="flex items-center gap-2 pt-4">
          <input
            type="checkbox"
            checked={form.allow_member_guests}
            onChange={(e) => set("allow_member_guests", e.target.checked)}
          />
          <span className="text-sm text-dark-200">Allow members to add guests</span>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-dark-200">Notes (optional)</span>
        <textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
          className="input mt-1 w-full"
        />
      </label>

      <div className="border-t border-surface-border pt-4 space-y-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.enable_auto_post}
            onChange={(e) => set("enable_auto_post", e.target.checked)}
          />
          <span className="text-sm font-medium text-dark-200">Auto-post the sign-up sheet</span>
        </label>

        {form.enable_auto_post && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-dark-200">Post day</span>
              <select
                value={form.post_day_of_week}
                onChange={(e) => set("post_day_of_week", parseInt(e.target.value, 10))}
                className="input mt-1 w-full"
              >
                {DAY_NAMES.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-dark-200">Post time</span>
              <input
                type="time"
                value={form.post_time}
                onChange={(e) => set("post_time", e.target.value)}
                className="input mt-1 w-full"
              />
            </label>
          </div>
        )}
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => set("is_active", e.target.checked)}
        />
        <span className="text-sm text-dark-200">Active</span>
      </label>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="text-sm text-surface-muted hover:text-dark-200">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Saving…" : form.id ? "Update Play Time" : "Add Play Time"}
        </button>
      </div>
    </form>
  );
}
