import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

export default async function CreateGroupPage() {
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

    // Create default preferences for ladder league groups
    if (groupType === "ladder_league") {
      await supabase.from("group_preferences").insert({
        group_id: newGroup.id,
        pct_window_sessions: 10,
        new_player_start_step: 5,
        min_step: 1,
        step_move_up: 1,
        step_move_down: 1,
        game_limit_4p: 3,
        game_limit_5p: 4,
        win_by_2: true,
      });
    }

    // Add creator as group admin
    await supabase.from("group_memberships").insert({
      group_id: newGroup.id,
      player_id: profile.id,
      current_step: 5,
      group_role: "admin",
    });

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

      <form action={createGroup} className="card space-y-4">
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
            <input
              type="text"
              id="state"
              name="state"
              placeholder="e.g. GA"
              className="input w-full"
            />
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
                defaultChecked
                className="text-brand-600 focus:ring-brand-500"
              />
              Ladder League
            </label>
            <label className="flex items-center gap-2 text-sm text-dark-100">
              <input
                type="radio"
                name="group_type"
                value="free_play"
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

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/groups" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary">
            Create Group
          </button>
        </div>
      </form>
    </div>
  );
}
