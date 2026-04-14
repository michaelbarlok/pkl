import { isGroupAdmin, requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

interface StepRow {
  playerName: string;    // display_name to match
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
  status: "updated" | "not_found" | "not_member" | "error";
  error?: string;
}

/**
 * POST /api/admin/groups/[id]/import-steps
 *
 * Body: { rows: StepRow[] }
 *
 * Requires group admin (or global admin) role.
 * Matches each row's playerName against group_memberships (display_name).
 * Updates group_memberships + optionally profiles.skill_level.
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
    const { rows } = body as { rows?: StepRow[] };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows array is required" }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // Fetch all members of this group with their display_name
    const { data: memberships, error: membersError } = await serviceClient
      .from("group_memberships")
      .select("player_id, profiles!group_memberships_player_id_fkey(id, display_name)")
      .eq("group_id", groupId);

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    // Build map: normalized display_name -> { player_id, profile_id, display_name }
    type MemberInfo = { playerId: string; profileId: string; displayName: string };
    const memberMap = new Map<string, MemberInfo>();
    for (const m of memberships ?? []) {
      const profile = m.profiles as unknown as { id: string; display_name: string } | null;
      if (profile) {
        const key = profile.display_name.toLowerCase().trim();
        memberMap.set(key, {
          playerId: m.player_id,
          profileId: profile.id,
          displayName: profile.display_name,
        });
      }
    }

    const results: RowResult[] = [];

    for (const row of rows) {
      const name = (row.playerName ?? "").trim();
      if (!name) {
        results.push({ playerName: "", status: "error", error: "Empty player name" });
        continue;
      }

      const info = memberMap.get(name.toLowerCase());
      if (!info) {
        results.push({ playerName: name, status: "not_found" });
        continue;
      }

      // Build membership update
      const membershipUpdate: Record<string, unknown> = {};
      if (row.step !== undefined && !isNaN(row.step)) membershipUpdate.current_step = row.step;
      if (row.winPct !== undefined && !isNaN(row.winPct)) membershipUpdate.win_pct = row.winPct;
      if (row.totalSessions !== undefined && !isNaN(row.totalSessions)) membershipUpdate.total_sessions = row.totalSessions;
      if (row.lastPlayedAt) {
        const d = new Date(row.lastPlayedAt);
        if (!isNaN(d.getTime())) membershipUpdate.last_played_at = d.toISOString();
      }
      if (row.joinedAt) {
        const d = new Date(row.joinedAt);
        if (!isNaN(d.getTime())) membershipUpdate.joined_at = d.toISOString();
      }

      if (Object.keys(membershipUpdate).length > 0) {
        const { error: updateError } = await serviceClient
          .from("group_memberships")
          .update(membershipUpdate)
          .eq("group_id", groupId)
          .eq("player_id", info.playerId);

        if (updateError) {
          results.push({ playerName: name, profileId: info.profileId, displayName: info.displayName, status: "error", error: updateError.message });
          continue;
        }
      }

      // Optionally update profile skill_level
      if (row.skillLevel !== undefined && !isNaN(row.skillLevel)) {
        await serviceClient
          .from("profiles")
          .update({ skill_level: row.skillLevel })
          .eq("id", info.profileId);
      }

      results.push({ playerName: name, profileId: info.profileId, displayName: info.displayName, status: "updated" });
    }

    const updated = results.filter((r) => r.status === "updated").length;
    const notFound = results.filter((r) => r.status === "not_found").length;
    const errors = results.filter((r) => r.status === "error").length;

    return NextResponse.json({ results, updated, notFound, errors }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/admin/groups/[id]/import-steps
 *
 * Returns the list of current group members (display_name + current_step)
 * so the import page can show a preview match.
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
