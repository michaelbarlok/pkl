import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { CreateGroupForm } from "./create-group-form";

export default function CreateGroupPage() {
  async function createGroup(formData: FormData) {
    "use server";

    const name = (formData.get("name") as string)?.trim();
    if (!name) return;

    const description = (formData.get("description") as string)?.trim() || null;
    const city = (formData.get("city") as string)?.trim() || null;
    const state = (formData.get("state") as string)?.trim() || null;
    const groupType = (formData.get("group_type") as string) || "ladder_league";
    const visibility = (formData.get("visibility") as string) || "public";

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!profile) return;

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
        visibility,
      })
      .select("id, slug")
      .single();

    if (error || !newGroup) return;

    // Create preferences for ladder league groups using form values
    if (groupType === "ladder_league") {
      await supabase.from("group_preferences").insert({
        group_id: newGroup.id,
        pct_window_sessions: Number(formData.get("pct_window_sessions")) || 10,
        new_player_start_step: Number(formData.get("new_player_start_step")) || 5,
        min_step: Number(formData.get("min_step")) || 1,
        max_step: Number(formData.get("max_step")) || 10,
        step_move_up: Number(formData.get("step_move_up")) || 1,
        step_move_down: Number(formData.get("step_move_down")) || 1,
        game_limit_4p: Number(formData.get("game_limit_4p")) || 3,
        game_limit_5p: Number(formData.get("game_limit_5p")) || 4,
        win_by_2: formData.get("win_by_2") === "on",
      });
    }

    // Add creator as group admin
    const startStep = Number(formData.get("new_player_start_step")) || 5;
    await supabase.from("group_memberships").upsert(
      {
        group_id: newGroup.id,
        player_id: profile.id,
        current_step: startStep,
        win_pct: 0,
        total_sessions: 0,
        group_role: "admin",
      },
      { onConflict: "group_id,player_id", ignoreDuplicates: true }
    );

    revalidatePath("/groups");
    redirect(`/groups/${newGroup.slug}`);
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
