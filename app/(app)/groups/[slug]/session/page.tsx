import { createClient } from "@/lib/supabase/server";
import { getGroupBySlug, getGroupMembers } from "@/lib/queries/group";
import { redirect, notFound } from "next/navigation";
import { SessionManager } from "./session-manager";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) redirect("/login");

  const group = await getGroupBySlug(slug);
  if (!group || group.group_type !== "free_play") notFound();

  const members = await getGroupMembers(group.id);

  // Check if caller is a member
  const myMembership = members.find((m) => m.player_id === profile.id);
  if (!myMembership) redirect(`/groups/${slug}`);

  const isAdmin = profile.role === "admin" || myMembership.group_role === "admin";

  // Check for an active session
  const { data: activeSession } = await supabase
    .from("free_play_sessions")
    .select("*")
    .eq("group_id", group.id)
    .eq("status", "active")
    .maybeSingle();

  // Get checked-in player IDs for the active session
  let checkedInPlayerIds: string[] = [];
  if (activeSession) {
    const { data: sp } = await supabase
      .from("free_play_session_players")
      .select("player_id")
      .eq("session_id", activeSession.id);
    checkedInPlayerIds = (sp ?? []).map((r) => r.player_id);
  }

  return (
    <SessionManager
      group={{ id: group.id, name: group.name, slug }}
      members={members.map((m) => ({
        id: m.player_id,
        displayName: m.player?.display_name ?? "Unknown",
        avatarUrl: m.player?.avatar_url ?? null,
      }))}
      activeSession={
        activeSession
          ? {
              id: activeSession.id,
              status: activeSession.status,
              roundNumber: activeSession.round_number,
              currentRound: activeSession.current_round as any,
              createdAt: activeSession.created_at,
            }
          : null
      }
      checkedInPlayerIds={checkedInPlayerIds}
      currentPlayerId={profile.id}
      isAdmin={isAdmin}
    />
  );
}
