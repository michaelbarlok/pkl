import { isGroupAdmin, requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

interface StepRow {
  playerName: string;    // display_name from CSV (used for auto-match)
  playerId?: string;     // admin-supplied manual match; wins over display-name lookup
  step?: number;
  winPct?: number;
  totalSessions?: number;
  lastPlayedAt?: string;
  joinedAt?: string;
  skillLevel?: number;
}

interface RowResult {
  playerName: string;
  profileId?: string;
  displayName?: string;
  status: "already_member" | "updated_member" | "added_to_group" | "pending" | "not_found" | "error";
  error?: string;
}

/**
 * POST /api/admin/groups/[id]/import-steps
 *
 * Body: { rows: StepRow[], overwrite?: boolean }
 *
 * Four outcomes per row:
 *   A. Player is already a group member:
 *      - overwrite=false (default): skipped, live stats untouched
 *      - overwrite=true: update the fields the CSV actually provides
 *        (no clobbering of a field with 0 just because it was absent)
 *   B. Player has a profile but isn't a member → add to group with imported stats
 *   C. Player has no profile (not signed up yet) → create a pending_group_members record;
 *      stats will be applied automatically when they sign up
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const groupId = params.id;
    const isAdmin = await isGroupAdmin(auth.supabase, auth.profile.id, groupId, auth.profile.role);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { rows, overwrite } = body as { rows?: StepRow[]; overwrite?: boolean };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows array is required" }, { status: 400 });
    }

    const allowOverwrite = overwrite === true;

    const serviceClient = await createServiceClient();

    // --- Build member map (existing group members) ---
    const { data: memberships, error: membersError } = await serviceClient
      .from("group_memberships")
      .select("player_id, profiles!group_memberships_player_id_fkey(id, display_name)")
      .eq("group_id", groupId);

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    type MemberInfo = { playerId: string; profileId: string; displayName: string };
    const memberMap = new Map<string, MemberInfo>();
    for (const m of memberships ?? []) {
      const profile = m.profiles as unknown as { id: string; display_name: string } | null;
      if (profile) {
        memberMap.set(profile.display_name.toLowerCase().trim(), {
          playerId: m.player_id,
          profileId: profile.id,
          displayName: profile.display_name,
        });
      }
    }

    // --- Build all-profiles map (players with accounts but not yet members) ---
    const { data: allProfiles } = await serviceClient
      .from("profiles")
      .select("id, display_name")
      .eq("is_active", true);

    const profileMap = new Map<string, { id: string; displayName: string }>();
    for (const p of allProfiles ?? []) {
      if (p.display_name) {
        profileMap.set(p.display_name.toLowerCase().trim(), {
          id: p.id,
          displayName: p.display_name,
        });
      }
    }

    // --- Get group preferences (start step fallback) ---
    const { data: prefs } = await serviceClient
      .from("group_preferences")
      .select("new_player_start_step")
      .eq("group_id", groupId)
      .maybeSingle();
    const defaultStep = prefs?.new_player_start_step ?? 5;

    // Build an index of group members by player_id so manual-match rows
    // can be looked up in O(1).
    const memberByPlayerId = new Map<string, MemberInfo>();
    for (const m of memberMap.values()) memberByPlayerId.set(m.playerId, m);

    /**
     * Build the partial update payload for an existing-member stats
     * correction. Only fields the CSV actually provides are included, so
     * an empty cell can't silently zero someone's session count.
     */
    function buildMemberUpdate(row: StepRow): Record<string, unknown> {
      const payload: Record<string, unknown> = {};
      if (row.step !== undefined && !isNaN(row.step))                 payload.current_step   = row.step;
      if (row.winPct !== undefined && !isNaN(row.winPct))             payload.win_pct        = row.winPct;
      if (row.totalSessions !== undefined && !isNaN(row.totalSessions)) payload.total_sessions = row.totalSessions;
      if (row.lastPlayedAt) {
        const d = new Date(row.lastPlayedAt);
        if (!isNaN(d.getTime())) payload.last_played_at = d.toISOString();
      }
      if (row.joinedAt) {
        const d = new Date(row.joinedAt);
        if (!isNaN(d.getTime())) payload.joined_at = d.toISOString();
      }
      return payload;
    }

    async function applyMemberUpdate(
      row: StepRow,
      target: MemberInfo,
      csvName: string,
    ): Promise<RowResult> {
      const updatePayload = buildMemberUpdate(row);
      if (Object.keys(updatePayload).length === 0) {
        return { playerName: csvName, profileId: target.profileId, displayName: target.displayName, status: "already_member" };
      }
      const { error: updateError } = await serviceClient
        .from("group_memberships")
        .update(updatePayload)
        .eq("group_id", groupId)
        .eq("player_id", target.playerId);
      if (updateError) {
        return { playerName: csvName, displayName: target.displayName, status: "error", error: updateError.message };
      }
      if (row.skillLevel !== undefined && !isNaN(row.skillLevel)) {
        await serviceClient.from("profiles").update({ skill_level: row.skillLevel }).eq("id", target.profileId);
      }
      return { playerName: csvName, profileId: target.profileId, displayName: target.displayName, status: "updated_member" };
    }

    const results: RowResult[] = [];

    for (const row of rows) {
      const name = (row.playerName ?? "").trim();
      if (!name) {
        results.push({ playerName: "", status: "error", error: "Empty player name" });
        continue;
      }

      // --- Manual match wins if provided ---
      // Admin explicitly picked this group member for this CSV row (e.g.
      // because display names didn't auto-match). Apply the CSV stats
      // directly to that member regardless of the global overwrite flag —
      // the manual pick IS the admin's explicit consent per row.
      if (row.playerId) {
        const target = memberByPlayerId.get(row.playerId);
        if (!target) {
          results.push({ playerName: name, status: "error", error: "Manually selected player is not a member of this group" });
          continue;
        }
        results.push(await applyMemberUpdate(row, target, name));
        continue;
      }

      const key = name.toLowerCase();

      // --- Case A: already a group member ---
      // Default behavior: skip, don't clobber live stats accumulated through
      // real play. Opt-in (`overwrite: true` on the request) lets admins
      // push CSV corrections onto live members.
      const member = memberMap.get(key);
      if (member) {
        if (!allowOverwrite) {
          results.push({ playerName: name, profileId: member.profileId, displayName: member.displayName, status: "already_member" });
          continue;
        }
        results.push(await applyMemberUpdate(row, member, name));
        continue;
      }

      // --- Case B: has a profile but not yet a member → add to group ---
      const profile = profileMap.get(key);
      if (profile) {
        const insertPayload: Record<string, unknown> = {
          group_id:       groupId,
          player_id:      profile.id,
          current_step:   row.step ?? defaultStep,
          win_pct:        row.winPct ?? 0,
          total_sessions: row.totalSessions ?? 0,
        };
        if (row.lastPlayedAt) {
          const d = new Date(row.lastPlayedAt);
          if (!isNaN(d.getTime())) insertPayload.last_played_at = d.toISOString();
        }
        if (row.joinedAt) {
          const d = new Date(row.joinedAt);
          if (!isNaN(d.getTime())) insertPayload.joined_at = d.toISOString();
        }

        const { error: insertError } = await serviceClient
          .from("group_memberships")
          .insert(insertPayload);

        if (insertError) {
          results.push({ playerName: name, displayName: profile.displayName, status: "error", error: insertError.message });
          continue;
        }

        if (row.skillLevel !== undefined && !isNaN(row.skillLevel)) {
          await serviceClient.from("profiles").update({ skill_level: row.skillLevel }).eq("id", profile.id);
        }

        results.push({ playerName: name, profileId: profile.id, displayName: profile.displayName, status: "added_to_group" });
        continue;
      }

      // --- Case C: no profile → create pending record ---
      const pendingPayload: Record<string, unknown> = { group_id: groupId, name };
      if (row.step !== undefined && !isNaN(row.step))               pendingPayload.step           = row.step;
      if (row.winPct !== undefined && !isNaN(row.winPct))           pendingPayload.win_pct        = row.winPct;
      if (row.totalSessions !== undefined && !isNaN(row.totalSessions)) pendingPayload.total_sessions = row.totalSessions;
      if (row.skillLevel !== undefined && !isNaN(row.skillLevel))   pendingPayload.skill_level    = row.skillLevel;
      if (row.lastPlayedAt) {
        const d = new Date(row.lastPlayedAt);
        if (!isNaN(d.getTime())) pendingPayload.last_played_at = d.toISOString();
      }
      if (row.joinedAt) {
        const d = new Date(row.joinedAt);
        if (!isNaN(d.getTime())) pendingPayload.joined_at = d.toISOString();
      }

      // Upsert: re-importing same name updates the record
      const { error: pendingError } = await serviceClient
        .from("pending_group_members")
        .upsert(pendingPayload, { onConflict: "group_id,name" });

      if (pendingError) {
        results.push({ playerName: name, status: "error", error: pendingError.message });
        continue;
      }

      results.push({ playerName: name, status: "pending" });
    }

    const alreadyMember = results.filter((r) => r.status === "already_member").length;
    const updatedMember = results.filter((r) => r.status === "updated_member").length;
    const addedToGroup  = results.filter((r) => r.status === "added_to_group").length;
    const pending       = results.filter((r) => r.status === "pending").length;
    const errors        = results.filter((r) => r.status === "error").length;

    return NextResponse.json({ results, alreadyMember, updatedMember, addedToGroup, pending, errors }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/admin/groups/[id]/import-steps
 * Returns the list of current group members for the preview match UI.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const groupId = params.id;
    const isAdmin = await isGroupAdmin(auth.supabase, auth.profile.id, groupId, auth.profile.role);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: memberships } = await auth.supabase
      .from("group_memberships")
      .select("player_id, current_step, profiles!group_memberships_player_id_fkey(display_name)")
      .eq("group_id", groupId);

    const members = (memberships ?? []).map((m) => ({
      playerId: m.player_id,
      displayName: (m.profiles as unknown as { display_name: string } | null)?.display_name ?? "",
      currentStep: m.current_step,
    }));

    return NextResponse.json({ members });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
