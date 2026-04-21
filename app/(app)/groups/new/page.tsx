import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { CreateGroupForm } from "./create-group-form";

export default function CreateGroupPage() {
  async function createGroup(formData: FormData): Promise<{ error: string } | void> {
    "use server";

    const name = (formData.get("name") as string)?.trim();
    if (!name) return { error: "Group name is required." };

    const description = (formData.get("description") as string)?.trim() || null;
    const city = (formData.get("city") as string)?.trim() || null;
    const state = (formData.get("state") as string)?.trim() || null;
    const groupType = (formData.get("group_type") as string) || "ladder_league";
    const ladderType = (formData.get("ladder_type") as string) || "court_promotion";
    const visibility = (formData.get("visibility") as string) || "public";

    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You must be logged in to create a group." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!profile) return { error: "Profile not found. Please complete your profile setup first." };

    // Try the base slug; if it conflicts, append a short random suffix
    const serviceClient = await createServiceClient();
    let slug = baseSlug;
    const { data: existing } = await serviceClient
      .from("shootout_groups")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const { data: newGroup, error } = await supabase
      .from("shootout_groups")
      .insert({
        name,
        slug,
        description,
        city,
        state,
        created_by: profile.id,
        is_active: true,
        group_type: groupType,
        ladder_type: groupType === "ladder_league" ? ladderType : "court_promotion",
        visibility,
      })
      .select("id, slug")
      .single();

    if (error || !newGroup) {
      console.error("Create group error:", error);
      return { error: error?.message ?? "Failed to create group. Please try again." };
    }

    // Create preferences for ladder league groups using form values
    if (groupType === "ladder_league") {
      const { error: prefsError } = await supabase.from("group_preferences").insert({
        group_id: newGroup.id,
        pct_window_sessions: Number(formData.get("pct_window_sessions")) || 10,
        new_player_start_step: Number(formData.get("new_player_start_step")) || 5,
        min_step: Number(formData.get("min_step")) || 1,
        max_step: Number(formData.get("max_step")) || 10,
        step_move_up: Number(formData.get("step_move_up")) || 1,
        step_move_down: Number(formData.get("step_move_down")) || 1,
        ...(formData.get("game_limit_4p") ? { game_limit_4p: Number(formData.get("game_limit_4p")) } : {}),
        ...(formData.get("game_limit_5p") ? { game_limit_5p: Number(formData.get("game_limit_5p")) } : {}),
        win_by_2: formData.get("win_by_2") === "on",
      });
      if (prefsError) console.error("Create group preferences error:", prefsError);
    }

    // Create play time / recurring schedule if enabled
    const enablePlayTime = formData.get("enable_play_time") === "on";
    if (enablePlayTime && groupType === "ladder_league") {
      const enableAutoPost = formData.get("enable_auto_post") === "on";
      const postDow = enableAutoPost ? Number(formData.get("post_day_of_week")) : null;
      const postT = enableAutoPost ? (formData.get("post_time") as string) || null : null;
      const withdrawHours = formData.get("play_withdraw_closes_hours") as string;

      await serviceClient.from("group_recurring_schedules").insert({
        group_id: newGroup.id,
        created_by: profile.id,
        day_of_week: Number(formData.get("play_day_of_week")) || 6,
        event_time: `${(formData.get("play_time") as string) || "09:00"}:00`,
        timezone: (formData.get("play_timezone") as string) || "America/New_York",
        location: (formData.get("play_location") as string)?.trim() || "",
        player_limit: Number(formData.get("play_player_limit")) || 16,
        signup_closes_hours_before: Number(formData.get("play_signup_closes_hours")) || 2,
        withdraw_closes_hours_before: withdrawHours ? Number(withdrawHours) : null,
        allow_member_guests: formData.get("play_allow_members") === "on",
        notes: (formData.get("play_notes") as string)?.trim() || null,
        is_active: true,
        post_day_of_week: postDow,
        post_time: postT ? `${postT}:00` : null,
      });
    }

    // Add creator as group admin (use service client to bypass RLS)
    const startStep = Number(formData.get("new_player_start_step")) || 5;
    await serviceClient.from("group_memberships").upsert(
      {
        group_id: newGroup.id,
        player_id: profile.id,
        current_step: startStep,
        win_pct: 0,
        total_sessions: 0,
        group_role: "admin",
      },
      { onConflict: "group_id,player_id" }
    );

    revalidatePath("/groups");
    // Send the creator straight into the admin settings for their new
    // group. Both group types land on the Preferences tab — which for
    // ladder renders the step/game-limit/ladder-mode form, and for
    // free play renders the stats-window control. The creator can jump
    // to Schedule from the same admin page to set play times.
    redirect(`/admin/groups/${newGroup.id}?tab=preferences`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Link
            href="/groups"
            className="text-sm text-surface-muted hover:text-dark-200"
          >
            Groups
          </Link>
          <span className="text-sm text-surface-muted">/</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-dark-100">
          Create a Group
        </h1>
        <p className="mt-1 text-surface-muted">
          Set up a new group for your pickleball community.
        </p>
      </div>

      <CreateGroupForm createAction={createGroup} />
    </div>
  );
}
