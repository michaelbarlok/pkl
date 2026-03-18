"use client";

import { useState } from "react";
import Link from "next/link";
import { US_STATES } from "@/lib/us-states";

export function CreateGroupForm({
  createAction,
}: {
  createAction: (formData: FormData) => Promise<void>;
}) {
  const [groupType, setGroupType] = useState("ladder_league");
  const [loading, setLoading] = useState(false);

  return (
    <form action={async (formData) => { setLoading(true); try { await createAction(formData); } finally { setLoading(false); } }} className="card space-y-4">
      {/* Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-dark-200 mb-1">
          Group Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          id="name"
          name="name"
          placeholder="e.g. Monday Shootout"
          required
          className="input w-full"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-dark-200 mb-1">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Tell people what your group is about..."
          className="input w-full"
        />
      </div>

      {/* Location */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="city" className="block text-sm font-medium text-dark-200 mb-1">
            City
          </label>
          <input
            type="text"
            id="city"
            name="city"
            placeholder="e.g. Athens"
            className="input w-full"
          />
        </div>
        <div>
          <label htmlFor="state" className="block text-sm font-medium text-dark-200 mb-1">
            State
          </label>
          <select id="state" name="state" className="input w-full">
            <option value="">Select State</option>
            {US_STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Group Type */}
      <div>
        <span className="block text-sm font-medium text-dark-200 mb-2">
          Group Type
        </span>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-dark-100">
            <input
              type="radio"
              name="group_type"
              value="ladder_league"
              checked={groupType === "ladder_league"}
              onChange={() => setGroupType("ladder_league")}
              className="text-brand-600 focus:ring-brand-500"
            />
            Ladder League
          </label>
          <label className="flex items-center gap-2 text-sm text-dark-100">
            <input
              type="radio"
              name="group_type"
              value="free_play"
              checked={groupType === "free_play"}
              onChange={() => setGroupType("free_play")}
              className="text-brand-600 focus:ring-brand-500"
            />
            Free Play
          </label>
        </div>
        <p className="mt-1 text-xs text-surface-muted">
          Ladder League uses step-based rankings. Free Play tracks wins and losses.
        </p>
      </div>

      {/* Visibility */}
      <div>
        <span className="block text-sm font-medium text-dark-200 mb-2">
          Visibility
        </span>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-dark-100">
            <input
              type="radio"
              name="visibility"
              value="public"
              defaultChecked
              className="text-brand-600 focus:ring-brand-500"
            />
            Public
          </label>
          <label className="flex items-center gap-2 text-sm text-dark-100">
            <input
              type="radio"
              name="visibility"
              value="private"
              className="text-brand-600 focus:ring-brand-500"
            />
            Private
          </label>
        </div>
        <p className="mt-1 text-xs text-surface-muted">
          Public groups can be found and joined by anyone. Private groups require an invite.
        </p>
      </div>

      {/* Ladder League Settings */}
      {groupType === "ladder_league" && (
        <div className="space-y-4 border-t border-surface-border pt-4">
          <h2 className="text-sm font-semibold text-dark-100">
            Ladder Settings
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pct_window_sessions" className="block text-sm font-medium text-dark-200 mb-1">
                Win % Window (sessions)
              </label>
              <input
                type="number"
                id="pct_window_sessions"
                name="pct_window_sessions"
                defaultValue={10}
                min={1}
                className="input w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                Recent sessions used to calculate win percentage.
              </p>
            </div>

            <div>
              <label htmlFor="new_player_start_step" className="block text-sm font-medium text-dark-200 mb-1">
                New Player Start Step
              </label>
              <input
                type="number"
                id="new_player_start_step"
                name="new_player_start_step"
                defaultValue={5}
                min={1}
                className="input w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                Step assigned to players when they first join.
              </p>
            </div>

            <div>
              <label htmlFor="min_step" className="block text-sm font-medium text-dark-200 mb-1">
                Highest Step
              </label>
              <input
                type="number"
                id="min_step"
                name="min_step"
                defaultValue={1}
                min={1}
                className="input w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                The best position on the ladder (1 = top).
              </p>
            </div>

            <div>
              <label htmlFor="max_step" className="block text-sm font-medium text-dark-200 mb-1">
                Lowest Step
              </label>
              <input
                type="number"
                id="max_step"
                name="max_step"
                defaultValue={10}
                min={1}
                className="input w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                The lowest step a player can drop to.
              </p>
            </div>

            <div>
              <label htmlFor="step_move_up" className="block text-sm font-medium text-dark-200 mb-1">
                Step Move Up
              </label>
              <input
                type="number"
                id="step_move_up"
                name="step_move_up"
                defaultValue={1}
                min={1}
                className="input w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                Steps gained by finishing 1st in a pool.
              </p>
            </div>

            <div>
              <label htmlFor="step_move_down" className="block text-sm font-medium text-dark-200 mb-1">
                Step Move Down
              </label>
              <input
                type="number"
                id="step_move_down"
                name="step_move_down"
                defaultValue={1}
                min={1}
                className="input w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                Steps lost by finishing last in a pool.
              </p>
            </div>

            <div>
              <label htmlFor="game_limit_4p" className="block text-sm font-medium text-dark-200 mb-1">
                Four Player Score Limit
              </label>
              <input
                type="number"
                id="game_limit_4p"
                name="game_limit_4p"
                defaultValue={3}
                min={1}
                className="input w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                Score limit in a 4-player pool.
              </p>
            </div>

            <div>
              <label htmlFor="game_limit_5p" className="block text-sm font-medium text-dark-200 mb-1">
                Five Player Score Limit
              </label>
              <input
                type="number"
                id="game_limit_5p"
                name="game_limit_5p"
                defaultValue={4}
                min={1}
                className="input w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                Score limit in a 5-player pool.
              </p>
            </div>

            <div className="flex items-center gap-3 sm:col-span-2">
              <input
                type="checkbox"
                name="win_by_2"
                id="win_by_2"
                defaultChecked
                className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="win_by_2" className="text-sm font-medium text-dark-200">
                Win by 2 required
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Link href="/groups" className="btn-secondary">
          Cancel
        </Link>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Creating..." : "Create Group"}
        </button>
      </div>
    </form>
  );
}
